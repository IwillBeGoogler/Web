import { beforeEach, describe, expect, it, vi } from 'vitest';

const importOpenedFile = vi.hoisted(() => vi.fn(() => ({ fileId: 'F1' })));
const openFile = vi.hoisted(() => vi.fn());
vi.mock('../../workspace/actions', () => ({ importOpenedFile, openFile }));

import { useDiagramStore } from '../../store/diagramStore';
import { applySchema, mergeSchemaIntoPage, replaceTablesFromSql } from './apply';
import { diagramToSchema, schemaToDiagram } from './convert';
import { parseSql } from './sqlParse';
import { relationOf, tableOf } from './tableData';
import { emptySchema, newColumn, newTable, type ErSchemaDef } from './types';
import { createRelation, blankTable } from './relations';

const s = () => useDiagramStore.getState();
const c = newColumn;
const sch = (...tables: ReturnType<typeof newTable>[]): ErSchemaDef => ({ ...emptySchema(), tables });

describe('schemaToDiagram', () => {
  it('prefixes ids, assigns group accents, singleton grey, view/enum/comment/schema', () => {
    const s0 = sch(
      newTable('a', [c('id', 'int', { pk: true })]),
      newTable('b', [c('id', 'int', { pk: true }), c('a_id', 'int', { fk: { table: 'a', column: 'id' } })], { schema: 'app', comment: 'hi' }),
      newTable('lonely', [c('id')], { kind: 'view' }),
      newTable('colored', [c('id')], { accent: '#111111' }),
      newTable('c', [c('x', 'int', { fk: { table: 'A', column: 'ID' } })]),
    );
    s0.enums.push({ name: 'mood', values: ['x', 'y'] });
    const d = schemaToDiagram(s0, { prefix: 'p_' });
    const n = (name: string) => d.nodes.find((x) => tableOf(x).label === name)!;
    expect(d.nodes.every((x) => x.id.startsWith('p_'))).toBe(true);
    expect(tableOf(n('a')).accent).toBe(tableOf(n('b')).accent);
    expect(tableOf(n('lonely')).accent).toBe('#4b5563');
    expect(tableOf(n('colored')).accent).toBe('#111111');
    expect(tableOf(n('lonely')).tableKind).toBe('view');
    expect(tableOf(n('b'))).toMatchObject({ schema: 'app', comment: 'hi' });
    expect(tableOf(n('mood')).tableKind).toBe('enum');
    expect(tableOf(n('mood')).columns.map((x) => x.name)).toEqual(['x', 'y']);
    // case-insensitive fk resolution, column fallback to the pk
    const e = d.edges.find((x) => x.target === n('c').id)!;
    expect(e.source).toBe(n('a').id);
    expect(relationOf(e)!.fromCol).toBe(tableOf(n('a')).columns[0].id);
  });
  it('composite fks produce one grouped edge per pair; label/name on the first only', () => {
    const s0 = sch(
      newTable('p', [c('a', 'int', { pk: true }), c('b', 'int', { pk: true })]),
      newTable('k', [c('pa', 'int', { pk: true, fk: { table: 'p', column: 'a', group: 'g', name: 'fk_p' } }), c('pb', 'int', { pk: true, fk: { table: 'p', column: 'b', group: 'g', name: 'fk_p', manyRequired: true } }), c('other', 'int', { fk: { table: 'nope', column: 'id' } })]),
    );
    const d = schemaToDiagram(s0, { layout: false });
    expect(d.edges).toHaveLength(2);
    const [e0, e1] = d.edges.map((e) => relationOf(e)!);
    expect(e0.group).toBe(e1.group);
    expect(e0.name).toBe('fk_p');
    expect(e1.name).toBeUndefined();
    expect(e0.identifying).toBe(true);
    expect(e0.manyRequired).toBeUndefined();
    const flagged = schemaToDiagram(sch(newTable('p', [c('a', 'int', { pk: true })]), newTable('k', [c('pa', 'int', { fk: { table: 'p', column: 'a', manyRequired: true, identifying: true, label: 'lbl' } })])));
    expect(relationOf(flagged.edges[0])).toMatchObject({ manyRequired: true, identifying: true, name: 'lbl' });
  });
  it('loose relations resolve by name; missing ends are skipped; layout:false keeps origin', () => {
    const s0 = sch(newTable('a', [c('id')]), newTable('b', [c('id')]));
    s0.loose.push({ from: 'a', to: 'b', cardinality: 'N:M', identifying: true, label: 'knows' }, { from: 'a', to: 'b', cardinality: 'N:M', identifying: false }, { from: 'a', to: 'zzz', cardinality: 'N:M', identifying: false });
    const d = schemaToDiagram(s0, { layout: false });
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0].label).toBe('knows');
    expect(relationOf(d.edges[0])).toMatchObject({ name: 'knows', identifying: true });
    expect(d.edges[1].label).toBeUndefined();
    expect(d.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
    const laid = schemaToDiagram(s0, { origin: { x: 500, y: 500 } });
    expect(Math.min(...laid.nodes.map((n) => n.position.x))).toBeGreaterThanOrEqual(500);
  });
});

describe('diagramToSchema', () => {
  it('round-trips a schema through the diagram', () => {
    const src = parseSql(`CREATE TYPE mood AS ENUM ('a');
CREATE TABLE users (id serial PRIMARY KEY, email text UNIQUE);
CREATE TABLE orders (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE pairs (a int, b int, PRIMARY KEY (a,b));
CREATE TABLE usage (a int, b int, FOREIGN KEY (a,b) REFERENCES pairs(a,b));
CREATE VIEW v AS SELECT 1;`).schema;
    const d = schemaToDiagram(src);
    const back = diagramToSchema(d.nodes, d.edges);
    expect(back.tables.map((t) => t.name).sort()).toEqual(['orders', 'pairs', 'usage', 'users', 'v']);
    expect(back.enums).toEqual([{ name: 'mood', values: ['a'] }]);
    const o = back.tables.find((t) => t.name === 'orders')!;
    expect(o.columns[1].fk).toMatchObject({ table: 'users', column: 'id' });
    const u = back.tables.find((t) => t.name === 'usage')!;
    expect(u.columns[0].fk!.group).toBe(u.columns[1].fk!.group);
    expect(u.columns[0].fk!.group).toBeTruthy();
    expect(back.tables.find((t) => t.name === 'v')!.kind).toBe('view');
    expect(o.columns[0]).not.toHaveProperty('id');
  });
  it('N:1 edges, N:M loose relations (label via edge or name), via-edges skipped, hidden fk hints kept, comment/schema', () => {
    s().reset();
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'a'));
    s().addNode(blankTable('b', { x: 0, y: 0 }, 'b'));
    const r = createRelation(s().nodes, [], { childId: 'b', parentId: 'a' })!;
    const nodes = r.nodes.map((n) => (n.id === 'b' ? { ...n, data: { ...n.data, schema: 'app', comment: 'cm' } } : n)) as typeof r.nodes;
    // reverse -> N:1 oriented
    const e = r.edges[0];
    const rev = { ...e, source: e.target, target: e.source, data: { ...e.data, relation: { ...relationOf(e)!, cardinality: 'N:1', fromCol: relationOf(e)!.toCol, toCol: relationOf(e)!.fromCol, pairs: [] } } };
    const back = diagramToSchema(nodes, [rev as never]);
    expect(back.tables.find((t) => t.name === 'b')!.columns.some((x) => x.fk?.table === 'a')).toBe(true);
    expect(back.tables.find((t) => t.name === 'b')).toMatchObject({ schema: 'app', comment: 'cm' });
    const nm = (extra: object, label?: unknown) => ({ id: 'nm', source: 'a', target: 'b', ...(label ? { label } : {}), data: { relation: { cardinality: 'N:M', identifying: false, optional: false, ...extra } } });
    expect(diagramToSchema(nodes, [nm({ name: 'viaName' }) as never]).loose[0].label).toBe('viaName');
    expect(diagramToSchema(nodes, [nm({}, 'edgeLabel') as never]).loose[0].label).toBe('edgeLabel');
    expect(diagramToSchema(nodes, [nm({}) as never]).loose[0].label).toBeUndefined();
    expect(diagramToSchema(nodes, [nm({ via: 'j' }) as never]).loose).toEqual([]);
    // edges to missing / non-table nodes and relation edges on enum children are ignored
    expect(diagramToSchema(nodes, [{ ...nm({}), target: 'ghost' } as never]).loose).toEqual([]);
    const en = blankTable('en', { x: 0, y: 0 }, 'mood', 'enum');
    const edgeToEnum = { id: 'x', source: 'a', target: 'en', data: { relation: { cardinality: '1:N', identifying: false, optional: false, toCol: 'c0' } } };
    expect(() => diagramToSchema([...nodes, en], [edgeToEnum as never])).not.toThrow();
    // an fk hint whose table is not on the page is preserved; unknown child columns are skipped
    const hint = nodes.map((n) => (n.id === 'b' ? { ...n, data: { ...n.data, columns: [...(n.data as never as { columns: unknown[] }).columns, { id: 'zz', name: 'ext', type: 'int', pk: false, unique: false, nullable: true, fk: { table: 'elsewhere', column: 'id' } }] } } : n)) as typeof nodes;
    const kept = diagramToSchema(hint, []);
    expect(kept.tables.find((t) => t.name === 'b')!.columns.find((x) => x.name === 'ext')!.fk).toEqual({ table: 'elsewhere', column: 'id' });
    const bad = { ...e, data: { ...e.data, relation: { ...relationOf(e)!, toCol: 'missing' } } };
    expect(diagramToSchema(nodes, [bad as never]).tables.find((t) => t.name === 'b')!.columns.every((x) => !x.fk)).toBe(true);
    const badName = { ...e, data: { ...e.data, relation: { ...relationOf(e)!, toCol: 'c1', fromCol: 'nope' } } };
    expect(diagramToSchema(nodes, [badName as never]).tables.find((t) => t.name === 'b')!.columns[1].fk!.column).toBe('id');
  });
  it('group merging also keeps pairs from edges beyond the first', () => {
    const src = parseSql('CREATE TABLE p (a int, b int, c int, PRIMARY KEY(a,b,c)); CREATE TABLE k (a int, b int, c int, FOREIGN KEY (a,b,c) REFERENCES p(a,b,c));').schema;
    const d = schemaToDiagram(src);
    expect(d.edges).toHaveLength(3);
    const back = diagramToSchema(d.nodes, d.edges);
    const k = back.tables.find((t) => t.name === 'k')!;
    expect(new Set(k.columns.map((x) => x.fk!.group)).size).toBe(1);
  });
});

describe('apply (store-bound)', () => {
  beforeEach(() => { s().reset(); importOpenedFile.mockClear(); openFile.mockClear(); });
  const SQL = 'CREATE TABLE a_x (id int PRIMARY KEY);\nCREATE TABLE a_y (id int PRIMARY KEY, x int REFERENCES a_x(id));\nCREATE TABLE b (id int);';
  it('applySchema "page" inserts and counts only tables (not groups)', () => {
    const n = applySchema(parseSql(SQL).schema, 'page', 'n', { groupByPrefix: true });
    expect(n).toBe(3);
    expect(s().nodes.some((x) => x.type === 'group')).toBe(true);
  });
  it('applySchema folds junctions when asked', () => {
    const sql = 'CREATE TABLE a(id int primary key); CREATE TABLE b(id int primary key); CREATE TABLE ab(a_id int references a(id), b_id int references b(id), primary key(a_id,b_id));';
    applySchema(parseSql(sql).schema, 'page', 'n', { foldJunctions: true });
    expect(s().nodes.filter((n) => n.hidden)).toHaveLength(1);
  });
  it('applySchema "newfile" builds a project with a named first page and opens it', () => {
    const n = applySchema(parseSql(SQL).schema, 'newfile', 'My schema');
    expect(n).toBe(3);
    expect(importOpenedFile).toHaveBeenCalledTimes(1);
    const proj = (importOpenedFile.mock.calls[0] as unknown as [{ pages: { name: string; nodes: unknown[]; edges: unknown[] }[] }])[0];
    expect(proj.pages[0].name).toBe('My schema');
    expect(proj.pages[0].nodes).toHaveLength(3);
    expect(proj.pages[0].edges).toHaveLength(1);
    expect(openFile).toHaveBeenCalledWith('F1');
    expect(s().nodes).toHaveLength(0);
  });
  it('applySchema "update" returns added + updated', () => {
    applySchema(parseSql('CREATE TABLE a (id int);').schema, 'page');
    expect(applySchema(parseSql('CREATE TABLE a (id int, x int);CREATE TABLE z (id int);').schema, 'update')).toBe(2);
  });
  it('replaceTablesFromSql: null when nothing parses; enums alone count; keeps position, accent, collapsed, edge style; offsets new tables', () => {
    expect(replaceTablesFromSql('nothing')).toBeNull();
    s().reset();
    expect(replaceTablesFromSql("CREATE TYPE m AS ENUM ('a');")!.tables).toBe(0);
    s().reset();
    applySchema(parseSql('CREATE TABLE users (id int PRIMARY KEY);CREATE TABLE orders (id int PRIMARY KEY, user_id int REFERENCES users(id));').schema, 'page');
    const users = s().nodes.find((n) => tableOf(n).label === 'users')!;
    s().transform((ns, es) => ({
      nodes: ns.map((n) => (n.id === users.id ? { ...n, position: { x: 700, y: 20 }, data: { ...n.data, accent: '#abcdef', collapsed: true } } : n)),
      edges: es.map((e) => ({ ...e, data: { ...e.data, waypoints: [{ x: 1, y: 2 }], manual: true, color: '#f00' } })),
    }));
    const r = replaceTablesFromSql('CREATE TABLE users (id int PRIMARY KEY, n text);CREATE TABLE orders (id int PRIMARY KEY, user_id int REFERENCES users(id));CREATE TABLE fresh (id int);')!;
    expect(r.tables).toBe(3);
    const u = s().nodes.find((n) => tableOf(n).label === 'users')!;
    expect(u.position).toEqual({ x: 700, y: 20 });
    expect(tableOf(u)).toMatchObject({ accent: '#abcdef', collapsed: true });
    const fresh = s().nodes.find((n) => tableOf(n).label === 'fresh')!;
    expect(fresh.position.x).toBeGreaterThan(700);
    const e = s().edges[0];
    expect(e.data).toMatchObject({ manual: true, color: '#f00', waypoints: [{ x: 1, y: 2 }] });
    expect(s().nodes.filter((n) => n.type === 'table')).toHaveLength(3);
  });
  it('mergeSchemaIntoPage: first import into an empty page, grouping, removal drops relations, untouched relations survive', () => {
    const empty = mergeSchemaIntoPage(parseSql('CREATE TABLE g_a (id int);CREATE TABLE g_b (id int);').schema, { groupByPrefix: true });
    expect(empty).toEqual({ added: 2, updated: 0, removed: 0 });
    expect(s().nodes.some((n) => n.type === 'group')).toBe(true);
    s().reset();
    applySchema(parseSql('CREATE TABLE p (id int PRIMARY KEY);CREATE TABLE q (id int PRIMARY KEY, p_id int REFERENCES p(id));CREATE TABLE r (id int PRIMARY KEY, p_id int REFERENCES p(id));').schema, 'page');
    s().transform((ns, es) => ({ nodes: ns, edges: es.map((e) => ({ ...e, data: { ...e.data, color: '#0f0', manual: true, waypoints: [] } })) }));
    // import only p and q (+ new t pointing at p): r is removed with its edge; p<->q keeps the style
    const m = mergeSchemaIntoPage(parseSql('CREATE TABLE p (id int PRIMARY KEY);CREATE TABLE q (id int PRIMARY KEY, p_id int REFERENCES p(id), extra text);CREATE TABLE t (id int, p_id int REFERENCES p(id));').schema, { removeMissing: true });
    expect(m).toEqual({ added: 1, updated: 2, removed: 1 });
    const names = s().nodes.map((n) => tableOf(n).label).sort();
    expect(names).toEqual(['p', 'q', 't']);
    expect(s().edges).toHaveLength(2);
    expect(s().edges.some((e) => e.data?.color === '#0f0')).toBe(true);
    // relations to tables outside the import stay; those whose columns vanished go
    s().reset();
    applySchema(parseSql('CREATE TABLE p (id int PRIMARY KEY);CREATE TABLE q (id int PRIMARY KEY, p_id int REFERENCES p(id));CREATE TABLE other (id int PRIMARY KEY, q_id int REFERENCES q(id));').schema, 'page');
    mergeSchemaIntoPage(parseSql('CREATE TABLE q (id int PRIMARY KEY);').schema);
    expect(s().nodes.map((n) => tableOf(n).label).sort()).toEqual(['other', 'p', 'q']);
    const rels = s().edges.map((e) => `${tableOf(s().nodes.find((n) => n.id === e.source)!).label}>${tableOf(s().nodes.find((n) => n.id === e.target)!).label}`);
    expect(rels).toEqual(['q>other']);
    // a plain (non-relation) edge survives a merge
    s().transform((ns, es) => ({ nodes: ns, edges: [...es, { id: 'plain', source: ns[0].id, target: ns[1].id } as never] }));
    mergeSchemaIntoPage(parseSql('CREATE TABLE q (id int PRIMARY KEY);').schema);
    expect(s().edges.some((e) => e.id === 'plain')).toBe(true);
  });
  it('mergeSchemaIntoPage maps new column ids without colliding with kept ones', () => {
    applySchema(parseSql('CREATE TABLE t (a int, b int, c int);').schema, 'page');
    mergeSchemaIntoPage(parseSql('CREATE TABLE t (n1 int, b int, n2 int);').schema);
    const t = tableOf(s().nodes[0]);
    expect(t.columns.map((x) => x.name)).toEqual(['n1', 'b', 'n2']);
    expect(new Set(t.columns.map((x) => x.id)).size).toBe(3);
    expect(t.columns[1].id).toBe('c1');
  });
});
