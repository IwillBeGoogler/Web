import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import {
  addColumn, blankJunction, blankTable, createJunction, createRelation, dropDanglingRelations, fkColumnIds, fkTypeFor, moveColumn, patchColumn, pruneFks,
  relationEdge, removeColumn, reverseRelation, setCardinality, withRelation,
} from './relations';
import { expandManyToMany, findJunctions, foldJunctions, showAsManyToMany } from './junction';
import { relationOf, tableOf, type TableNodeData } from './tableData';

let seq = 0;
const gen = (p: string) => `${p}${++seq}`;
const rel = (id: string, s: string, t: string, extra: Partial<NonNullable<ReturnType<typeof relationOf>>> = {}): DiagramEdge =>
  relationEdge(id, s, t, { cardinality: '1:N', identifying: false, optional: false, ...extra });
const withData = (n: DiagramNode, fn: (d: TableNodeData) => TableNodeData): DiagramNode => ({ ...n, data: fn(tableOf(n)) as unknown as DiagramNode['data'] });

describe('relation edges', () => {
  it('relationEdge styles by identifying; withRelation re-derives; extras keep data', () => {
    const e = relationEdge('e', 'a', 'b', { cardinality: '1:N', identifying: true, optional: true }, { data: { keep: 1 } as never, label: 'L' });
    expect(e.data).toMatchObject({ keep: 1, strokeStyle: 'solid', dashed: false, startMarker: 'zeroOrOne', endMarker: 'zeroOrMany' });
    expect(e.label).toBe('L');
    const w = withRelation(e, { identifying: false, manyRequired: true });
    expect(w.data).toMatchObject({ strokeStyle: 'dashed', dashed: true, endMarker: 'oneOrMany' });
  });
  it('setCardinality to N:M clears columns and optional', () => {
    const e = rel('e', 'a', 'b', { fromCol: 'c0', toCol: 'c1', optional: true });
    const nm = relationOf(setCardinality(e, 'N:M'))!;
    expect(nm).toMatchObject({ cardinality: 'N:M', fromCol: undefined, toCol: undefined, optional: false });
    expect(relationOf(setCardinality(e, '1:1'))!.fromCol).toBe('c0');
  });
  it('reverseRelation swaps ends, columns, pairs and flips cardinality; non-relations unchanged', () => {
    const e = rel('e', 'a', 'b', { fromCol: 'x', toCol: 'y', pairs: [{ fromCol: 'p', toCol: 'q' }] });
    const r = reverseRelation({ ...e, sourceHandle: 'h', targetHandle: 'h2' });
    expect([r.source, r.target]).toEqual(['b', 'a']);
    expect(relationOf(r)).toMatchObject({ cardinality: 'N:1', fromCol: 'y', toCol: 'x', pairs: [{ fromCol: 'q', toCol: 'p' }] });
    expect(r.sourceHandle).toBeUndefined();
    const plain = { id: 'p', source: 'a', target: 'b' } as DiagramEdge;
    expect(reverseRelation(plain)).toBe(plain);
  });
});

describe('fkColumnIds / pruneFks / dropDanglingRelations', () => {
  const a = blankTable('a', { x: 0, y: 0 }, 'a');
  const b = blankTable('b', { x: 0, y: 0 }, 'b');
  it('fkColumnIds handles 1:N, N:1, pairs and N:M', () => {
    const es = [rel('1', 'a', 'b', { toCol: 'c1', pairs: [{ fromCol: 'c0', toCol: 'c0' }] }), rel('2', 'b', 'a', { cardinality: 'N:1', fromCol: 'c0' }), rel('3', 'a', 'b', { cardinality: 'N:M', toCol: 'zz' }), { id: '4', source: 'a', target: 'b' } as DiagramEdge];
    expect([...fkColumnIds(es, 'b')].sort()).toEqual(['c0', 'c1']);
    expect([...fkColumnIds(es, 'a')]).toEqual([]);
    expect([...fkColumnIds([rel('5', 'a', 'a', { toCol: undefined })], 'a')]).toEqual([]);
  });
  it('pruneFks clears stale fk hints, returns same array when unchanged', () => {
    const withFk = withData(b, (d) => ({ ...d, columns: d.columns.map((c, i) => (i === 1 ? { ...c, fk: { table: 'a', column: 'id' } } : c)) }));
    const nodes = [a, withFk, { ...a, id: 'g', type: 'group' } as DiagramNode];
    const out = pruneFks(nodes, []);
    expect(tableOf(out[1]).columns[1].fk).toBeUndefined();
    expect(out[0]).toBe(a);
    const live = pruneFks(nodes, [rel('e', 'a', 'b', { toCol: 'c1' })]);
    expect(live).toBe(nodes);
    expect(pruneFks([a], [])).toEqual([a]);
  });
  it('dropDanglingRelations drops edges whose columns vanished, keeps unknown tables and non-relations', () => {
    const es = [rel('ok', 'a', 'b', { fromCol: 'c0', toCol: 'c1' }), rel('bad1', 'a', 'b', { fromCol: 'nope' }), rel('bad2', 'a', 'b', { toCol: 'nope' }), rel('ghost', 'a', 'zzz', { toCol: 'nope' }), { id: 'plain', source: 'a', target: 'b' } as DiagramEdge, rel('hdr', 'a', 'b', {})];
    expect(dropDanglingRelations([a, b], es).map((e) => e.id)).toEqual(['ok', 'ghost', 'plain', 'hdr']);
  });
});

describe('createRelation', () => {
  const users = withData(blankTable('u', { x: 0, y: 0 }, 'Users'), (d) => ({ ...d, columns: [{ ...d.columns[0], type: 'serial' }, d.columns[1]] }));
  const orders = blankTable('o', { x: 300, y: 0 }, 'orders');
  it('fkTypeFor', () => {
    expect(fkTypeFor('bigserial')).toBe('bigint');
    expect(fkTypeFor('smallserial')).toBe('smallint');
    expect(fkTypeFor('SERIAL')).toBe('integer');
    expect(fkTypeFor('int unsigned')).toBe('int unsigned');
    expect(fkTypeFor('')).toBe('integer');
  });
  it('creates a named FK column (singular of snake name), repeated drop returns the same edge', () => {
    const r = createRelation([users, orders], [], { childId: 'o', parentId: 'u' }, gen)!;
    expect(r.created).toBe(true);
    const col = tableOf(r.nodes[1]).columns.find((c) => c.id === r.fkColumnId)!;
    expect(col).toMatchObject({ name: 'user_id', type: 'integer', fk: { table: 'Users', column: 'id' } });
    expect(relationOf(r.edges[0])).toMatchObject({ cardinality: '1:N', optional: true, identifying: false, fromCol: 'c0', toCol: r.fkColumnId });
    const again = createRelation(r.nodes, r.edges, { childId: 'o', parentId: 'u', childCol: r.fkColumnId }, gen)!;
    expect(again.created).toBe(false);
    expect(again.edges).toBe(r.edges);
    expect(again.edgeId).toBe(r.edges[0].id);
    // second new fk gets a suffixed name
    const second = createRelation(r.nodes, r.edges, { childId: 'o', parentId: 'u' }, gen)!;
    expect(tableOf(second.nodes[1]).columns.at(-1)!.name).toBe('user_id_2');
  });
  it('unique / sole-pk fk is 1:1; pk fk is identifying', () => {
    const child = withData(orders, (d) => ({ ...d, columns: [{ ...d.columns[0], fk: undefined }, { ...d.columns[1], unique: true }] }));
    const r = createRelation([users, child], [], { childId: 'o', parentId: 'u', childCol: 'c1' }, gen)!;
    expect(relationOf(r.edges[0])!.cardinality).toBe('1:1');
    expect(tableOf(r.nodes[1]).columns[1].fk).toEqual({ table: 'Users', column: 'id' });
    // dragging a non-key column of child onto parent pk keeps orientation; pk of child => identifying 1:1
    const idRel = createRelation([users, child], [], { childId: 'o', parentId: 'u', childCol: 'c0', parentCol: 'c0' }, gen)!;
    // both sole pks => no reorientation, child's pk becomes the fk
    expect(relationOf(idRel.edges[0])).toMatchObject({ cardinality: '1:1', identifying: true, optional: false });
  });
  it('dragging a sole pk onto another table reorients: dragged is the parent', () => {
    const r = createRelation([users, orders], [], { childId: 'u', childCol: 'c0', parentId: 'o', parentCol: 'c1' }, gen)!;
    expect(r.edges[0].source).toBe('u');
    expect(r.edges[0].target).toBe('o');
    expect(tableOf(r.nodes.find((n) => n.id === 'o')!).columns.find((c) => c.id === 'c1')!.fk).toEqual({ table: 'Users', column: 'id' });
    // drop target is an enum => not reoriented
    const en = blankTable('en', { x: 0, y: 0 }, 'mood', 'enum');
    const r2 = createRelation([users, en], [], { childId: 'u', childCol: 'c0', parentId: 'en' }, gen)!;
    expect(r2.edges[0].source).toBe('en');
  });
  it('self references use "parent_" and missing tables / empty parents fail', () => {
    const r = createRelation([orders], [], { childId: 'o', parentId: 'o' }, gen)!;
    expect(tableOf(r.nodes[0]).columns.at(-1)!.name).toBe('parent_id');
    expect(createRelation([orders], [], { childId: 'o', parentId: 'nope' }, gen)).toBeNull();
    const empty = withData(blankTable('e', { x: 0, y: 0 }, 'empty'), (d) => ({ ...d, columns: [] }));
    expect(createRelation([orders, empty], [], { childId: 'o', parentId: 'e' }, gen)).toBeNull();
    const en = blankTable('en', { x: 0, y: 0 }, 'mood', 'enum');
    const enEmpty = withData(en, (d) => ({ ...d, columns: [] }));
    const r3 = createRelation([orders, enEmpty], [], { childId: 'o', parentId: 'en' }, gen)!;
    expect(tableOf(r3.nodes[0]).columns.at(-1)!.name).toBe('mood_id');
    expect(tableOf(r3.nodes[0]).columns.at(-1)!.type).toBe('integer');
  });
  it('falls back to first column when the parent has no pk', () => {
    const nopk = withData(blankTable('p', { x: 0, y: 0 }, 'parents'), (d) => ({ ...d, columns: d.columns.map((c) => ({ ...c, pk: false })) }));
    const r = createRelation([nopk, orders], [], { childId: 'o', parentId: 'p', parentCol: 'missing' }, gen)!;
    expect(tableOf(r.nodes[1]).columns.at(-1)!.name).toBe('parent_id');
  });
  it('plural naming: ies -> y, ss/us kept', () => {
    const name = (label: string) => {
      const p = blankTable('p', { x: 0, y: 0 }, label);
      return tableOf(createRelation([p, orders], [], { childId: 'o', parentId: 'p' }, gen)!.nodes[1]).columns.at(-1)!.name;
    };
    expect(name('categories')).toBe('category_id');
    expect(name('address')).toBe('address_id');
    expect(name('campus')).toBe('campus_id');
    expect(name('OrderItems')).toBe('order_item_id');
  });
});

describe('createJunction', () => {
  const a = blankTable('a', { x: 0, y: 0 }, 'Posts');
  const b = blankTable('b', { x: 400, y: 100 }, 'tags');
  it('builds a junction with composite pk and two identifying fks', () => {
    const nm = relationEdge('nm', 'a', 'b', { cardinality: 'N:M', identifying: false, optional: false });
    const r = createJunction([a, b], [nm], 'nm', gen)!;
    const j = tableOf(r.nodes.at(-1)!);
    expect(j.label).toBe('posts_tags');
    expect(j.columns.map((c) => [c.name, c.pk])).toEqual([['post_id', true], ['tag_id', true]]);
    expect(r.edges.map((e) => e.id)).not.toContain('nm');
    expect(r.edges).toHaveLength(2);
    expect(r.nodes.at(-1)!.position).toEqual({ x: 200, y: 90 });
  });
  it('self N:M gets a related_ column; invalid input returns null', () => {
    const nm = relationEdge('nm', 'a', 'a', { cardinality: 'N:M', identifying: false, optional: false });
    const r = createJunction([a], [nm], 'nm', gen)!;
    expect(tableOf(r.nodes.at(-1)!).columns.map((c) => c.name)).toEqual(['post_id', 'related_post_id']);
    expect(r.nodes.at(-1)!.position.x).toBe(280);
    expect(createJunction([a], [nm], 'zzz', gen)).toBeNull();
    expect(createJunction([a], [rel('x', 'a', 'a')], 'x', gen)).toBeNull();
    expect(createJunction([a], [relationEdge('nm', 'a', 'gone', { cardinality: 'N:M', identifying: false, optional: false })], 'nm', gen)).toBeNull();
    expect(createJunction([a], [{ id: 'nm', source: 'a', target: 'a' } as DiagramEdge], 'nm', gen)).toBeNull();
  });
  it('tolerates tables without columns', () => {
    const e1 = withData(a, (d) => ({ ...d, columns: [] }));
    const e2 = withData(b, (d) => ({ ...d, columns: [] }));
    const nm = relationEdge('nm', 'a', 'b', { cardinality: 'N:M', identifying: false, optional: false });
    const j = tableOf(createJunction([e1, e2], [nm], 'nm', gen)!.nodes.at(-1)!);
    expect(j.columns.map((c) => c.name)).toEqual(['post_id', 'tag_id']);
    expect(j.columns[0].type).toBe('integer');
  });
});

describe('column editing', () => {
  const d = tableOf(blankTable('a', { x: 0, y: 0 }, 'a'));
  it('addColumn de-duplicates names, removeColumn, patchColumn', () => {
    const d2 = addColumn(addColumn(d, 'name'), 'name');
    expect(d2.columns.map((c) => c.name)).toEqual(['id', 'name', 'name_2', 'name_3']);
    expect(addColumn(d).columns.at(-1)).toMatchObject({ name: 'column', type: 'text', id: 'c2' });
    expect(removeColumn(d2, 'c1').columns.map((c) => c.id)).toEqual(['c0', 'c2', 'c3']);
    expect(patchColumn(d, 'c1', { type: 'int' }).columns[1].type).toBe('int');
    expect(patchColumn(d, 'c1', { type: 'int' }).columns[0]).toBe(d.columns[0]);
  });
  it('moveColumn reorders, clamps, ignores unknown id', () => {
    const d3 = addColumn(addColumn(d, 'x'), 'y');
    expect(moveColumn(d3, 'c0', 2).columns.map((c) => c.id)).toEqual(['c1', 'c2', 'c0', 'c3']);
    expect(moveColumn(d3, 'c3', -5).columns[0].id).toBe('c3');
    expect(moveColumn(d3, 'c0', 99).columns.at(-1)!.id).toBe('c0');
    expect(moveColumn(d3, 'zz', 1)).toBe(d3);
  });
  it('blank table variants and junction', () => {
    const en = tableOf(blankTable('e', { x: 0, y: 0 }, 'e', 'enum'));
    expect(en.columns.map((c) => c.name)).toEqual(['value_1', 'value_2']);
    expect(en.accent).toBe('#8e5bd6');
    const v = tableOf(blankTable('v', { x: 0, y: 0 }, 'v', 'view'));
    expect(v.columns.every((c) => !c.pk)).toBe(true);
    expect(v.accent).toBe('#0f9d8f');
    const j = tableOf(blankJunction('j', { x: 0, y: 0 }));
    expect(j.columns.map((c) => [c.name, c.pk])).toEqual([['a_id', true], ['b_id', true]]);
    expect(j.accent).toBe('#e8710a');
  });
});

describe('junction fold / expand', () => {
  const post = blankTable('p', { x: 0, y: 0 }, 'posts');
  const tag = blankTable('t', { x: 0, y: 0 }, 'tags');
  const nm = relationEdge('nm', 'p', 't', { cardinality: 'N:M', identifying: false, optional: false });
  const { nodes, edges } = createJunction([post, tag], [nm], 'nm', gen)!;
  const jid = nodes.at(-1)!.id;
  it('findJunctions detects a pure junction and the payload variant', () => {
    const f = findJunctions(nodes, edges);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ tableId: jid, a: 'p', b: 't', pure: true });
    const payload = nodes.map((n) => (n.id === jid ? withData(n, (d) => ({ ...d, columns: [...d.columns, { id: 'c9', name: 'qty', type: 'int', pk: false, unique: false, nullable: true }] })) : n));
    expect(findJunctions(payload, edges)[0].pure).toBe(false);
    expect(foldJunctions(payload, edges, gen).folded).toBe(0);
  });
  it('rejects: views/enums, single pk, same parents, N:M/via/self edges, wrong fk count', () => {
    const asKind = (k: 'view' | 'enum') => nodes.map((n) => (n.id === jid ? withData(n, (d) => ({ ...d, tableKind: k })) : n));
    expect(findJunctions(asKind('view'), edges)).toEqual([]);
    expect(findJunctions(asKind('enum'), edges)).toEqual([]);
    expect(findJunctions(nodes.map((n) => (n.id === jid ? withData(n, (d) => ({ ...d, columns: d.columns.map((c, i) => ({ ...c, pk: i === 0 })) })) : n)), edges)).toEqual([]);
    expect(findJunctions(nodes, edges.slice(0, 1))).toEqual([]);
    const samePar = edges.map((e) => ({ ...e, source: 'p' }));
    expect(findJunctions(nodes, samePar)).toEqual([]);
    const viaEdges = edges.map((e) => withRelation(e, { via: 'x' }));
    expect(findJunctions(nodes, viaEdges)).toEqual([]);
    expect(findJunctions([{ ...nodes[0], type: 'group' } as DiagramNode], edges)).toEqual([]);
    const selfEdge = [...edges.slice(0, 1), { ...edges[1], source: jid }];
    expect(findJunctions(nodes, selfEdge)).toEqual([]);
  });
  it('N:1 oriented foreign keys also count', () => {
    const rev = edges.map((e) => reverseRelation(e));
    expect(findJunctions(nodes, rev)).toHaveLength(1);
    expect(findJunctions(nodes, rev)[0]).toMatchObject({ a: 'p', b: 't' });
  });
  it('hidden fk edges count only when the junction itself is hidden', () => {
    const hid = edges.map((e) => ({ ...e, hidden: true }));
    expect(findJunctions(nodes, hid)).toEqual([]);
    expect(findJunctions(nodes.map((n) => (n.id === jid ? { ...n, hidden: true } : n)), hid)).toHaveLength(1);
  });
  it('composite pairs count their columns', () => {
    const j2 = nodes.map((n) => (n.id === jid ? withData(n, (d) => ({ ...d, columns: [...d.columns, { id: 'c2', name: 'x', type: 'int', pk: true, unique: false, nullable: false }] })) : n));
    const es = edges.map((e, i) => (i === 0 ? withRelation(e, { pairs: [{ fromCol: 'c0', toCol: 'c2' }] }) : e));
    expect(findJunctions(j2, es)).toHaveLength(1);
  });
  it('composite pairs on N:1 edges count their from-columns', () => {
    const j2 = nodes.map((n) => (n.id === jid ? withData(n, (d) => ({ ...d, columns: [...d.columns, { id: 'c2', name: 'x', type: 'int', pk: true, unique: false, nullable: false }] })) : n));
    const es = edges.map((e, i) => reverseRelation(i === 0 ? withRelation(e, { pairs: [{ fromCol: 'c0', toCol: 'c2' }] }) : e));
    expect(findJunctions(j2, es)).toHaveLength(1);
  });
  it('show as M:N hides table + fks (and group siblings); expand restores', () => {
    const grouped = edges.map((e) => withRelation(e, { group: 'g' }));
    const extra = relationEdge('sib', 'p', jid, { cardinality: '1:N', identifying: true, optional: false, group: 'g', toCol: 'c0' });
    extra.hidden = true;
    const r = showAsManyToMany(nodes, [...grouped, extra], jid, gen)!;
    expect(r.nodes.find((n) => n.id === jid)!.hidden).toBe(true);
    expect(r.edges.filter((e) => e.hidden && e.id !== 'sib' ? true : e.hidden).map((e) => e.id).sort()).toEqual([...grouped.map((e) => e.id), 'sib'].sort());
    const nmEdge = r.edges.find((e) => e.id === r.edgeId)!;
    expect(relationOf(nmEdge)).toMatchObject({ cardinality: 'N:M', via: jid, name: 'posts_tags' });
    expect(nmEdge.label).toBe('posts_tags');
    const back = expandManyToMany(r.nodes, r.edges, r.edgeId)!;
    expect(back.tableId).toBe(jid);
    expect(back.nodes.find((n) => n.id === jid)!.hidden).toBe(false);
    expect(back.edges.some((e) => e.hidden)).toBe(false);
    expect(back.edges.some((e) => e.id === r.edgeId)).toBe(false);
    expect(showAsManyToMany(nodes, edges, 'p', gen)).toBeNull();
  });
  it('expand rejects missing / non-via edges; foldJunctions folds pure ones', () => {
    expect(expandManyToMany(nodes, edges, 'nope')).toBeNull();
    expect(expandManyToMany(nodes, edges, edges[0].id)).toBeNull();
    const f = foldJunctions(nodes, edges, gen);
    expect(f.folded).toBe(1);
    expect(f.nodes.find((n) => n.id === jid)!.hidden).toBe(true);
  });
});
