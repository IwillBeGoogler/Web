import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { emptyPrivate, isPrivateSticky, mergePrivate, scrubDoc, splitPrivate } from '@core/privateStickies';
import { pageToSchema } from '@core/schema/fromPage';
import { generatorFor, seedoraYaml, toYaml } from '@core/schema/seedora';
import { DIALECTS, emptySchema } from '@core/schema/types';
import { yamlDocuments } from '@core/infra/yamlish';
import { dedupeEdges, imageBase, slug, urlHosts } from '@core/infra/util';
import { finalizeModel } from '@core/infra/finalize';
import { infraToPage } from '@core/infra/toPage';
import { InfraError, type InfraModel, type InfraRes } from '@core/infra/types';
import type { CDoc, CEdge, CNode } from '@core/types';

const n = (id: string, data: any = {}, type = 'icon'): CNode => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } });
const e = (id: string, source: string, target: string, extra: any = {}): CEdge => ({ id, source, target, ...extra });
const st = (id: string, data: any = {}) => n(id, { private: true, ...data }, 'sticky');

describe('privateStickies', () => {
  it('detects private stickies', () => {
    expect(isPrivateSticky(st('a'))).toBe(true);
    expect(isPrivateSticky(n('a', { private: true }))).toBe(false);
    expect(isPrivateSticky(n('a', {}, 'sticky'))).toBe(false);
    expect(isPrivateSticky({ type: 'sticky' })).toBe(false);
    expect(emptyPrivate()).toEqual({ nodes: [], edges: [] });
  });
  it('splitPrivate returns same page when none', () => {
    const page = { nodes: [n('a')], edges: [] as CEdge[] };
    const r = splitPrivate(page);
    expect(r.shared).toBe(page);
    expect(r.priv).toEqual({ nodes: [], edges: [] });
  });
  it('splitPrivate separates stickies and attached edges', () => {
    const page = { nodes: [n('a'), n('b'), st('s')], edges: [e('1', 'a', 'b'), e('2', 's', 'a'), e('3', 'b', 's')] };
    const r = splitPrivate(page);
    expect(r.shared.nodes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.shared.edges.map((x) => x.id)).toEqual(['1']);
    expect(r.priv.nodes.map((x) => x.id)).toEqual(['s']);
    expect(r.priv.edges.map((x) => x.id)).toEqual(['2', '3']);
  });
  it('mergePrivate', () => {
    const page = { nodes: [n('a')], edges: [e('1', 'a', 'a')] };
    expect(mergePrivate(page, emptyPrivate())).toBe(page);
    // shared node with same id wins, edge duplicates / dangling dropped -> nothing new
    expect(mergePrivate(page, { nodes: [st('a')], edges: [e('1', 'a', 'a'), e('x', 'a', 'zz')] })).toBe(page);
    const m = mergePrivate(page, { nodes: [st('s')], edges: [e('2', 's', 'a'), e('3', 's', 'gone')] });
    expect(m.nodes.map((x) => x.id)).toEqual(['a', 's']);
    expect(m.edges.map((x) => x.id)).toEqual(['1', '2']);
    // edges only
    const m2 = mergePrivate({ nodes: [n('a'), n('b')], edges: [] }, { nodes: [], edges: [e('9', 'a', 'b')] });
    expect(m2.edges.map((x) => x.id)).toEqual(['9']);
  });
  it('scrubDoc groups by owner', () => {
    const doc: CDoc = {
      activePageId: 'p1',
      pages: [
        { id: 'p1', name: 'one', nodes: [n('a'), st('s1', { authorId: 'u1' }), st('s2', { authorId: 'ghost' }), st('s3')], edges: [e('1', 'a', 's1'), e('2', 's2', 's3'), e('3', 'a', 'a')] },
        { id: 'p2', name: 'two', nodes: [n('b')], edges: [] },
      ],
    };
    const r = scrubDoc(doc, { isUser: (id) => id === 'u1', fallbackOwner: 'owner' });
    expect(r.removed).toBe(3);
    expect(r.doc.pages[0].nodes.map((x) => x.id)).toEqual(['a']);
    expect(r.doc.pages[1]).toBe(doc.pages[1]);
    expect([...r.byUser.keys()].sort()).toEqual(['owner', 'u1']);
    expect(r.byUser.get('u1')!.nodes[0].data.authorId).toBe('u1');
    expect(r.byUser.get('u1')!.nodes[0]).toBe(doc.pages[0].nodes[1]);
    expect(r.byUser.get('owner')!.nodes.map((x) => x.data.authorId)).toEqual(['owner', 'owner']);
    expect(r.byUser.get('u1')!.edges.map((x) => x.id)).toEqual(['1']);
    expect(r.byUser.get('owner')!.edges.map((x) => x.id)).toEqual(['2']);
  });
  it('scrubDoc without stickies returns same doc', () => {
    const doc: CDoc = { activePageId: 'p', pages: [{ id: 'p', name: 'p', nodes: [n('a')], edges: [] }] };
    const r = scrubDoc(doc, { isUser: () => true, fallbackOwner: 'o' });
    expect(r.doc).toBe(doc);
    expect(r.removed).toBe(0);
  });
  it('scrubDoc: edge with only target owner', () => {
    const doc: CDoc = { activePageId: 'p', pages: [{ id: 'p', name: 'p', nodes: [n('a'), st('s', { authorId: 'u' })], edges: [e('1', 'a', 's')] }] };
    const r = scrubDoc(doc, { isUser: () => true, fallbackOwner: 'o' });
    expect(r.byUser.get('u')!.edges).toHaveLength(1);
  });
});

describe('schema fromPage', () => {
  const table = (id: string, label: string, columns: any[], extra: any = {}) => n(id, { label, columns, ...extra }, 'table');
  it('maps tables, enums, views, indexes, checks', () => {
    const page = {
      nodes: [
        table('t1', 'users', [{ id: 'c1', name: 'id', type: 'int', pk: true }, { id: 'c2', name: 'email', type: 'text' }], { schema: 'public', comment: 'hi', indexes: [{ name: 'ix', columns: ['email'], unique: true }, { columns: ['id'] }], checks: [{ name: 'k', expr: 'id>0' }] }),
        table('t2', 'v_users', [], { tableKind: 'view' }),
        table('t3', 'role', [{ name: 'admin' }, { name: 'user' }], { tableKind: 'enum' }),
        table('t4', 'bare', undefined as any, { columns: undefined }),
        n('x'),
      ],
      edges: [],
    };
    const s = pageToSchema(page);
    expect(s.enums).toEqual([{ name: 'role', values: ['admin', 'user'] }]);
    expect(s.tables.map((t) => [t.name, t.kind])).toEqual([['users', 'table'], ['v_users', 'view'], ['bare', 'table']]);
    expect(s.tables[0]).toMatchObject({ id: 't1', schema: 'public', comment: 'hi', indexes: [{ name: 'ix', columns: ['email'], unique: true }, { columns: ['id'], unique: false }], checks: [{ name: 'k', expr: 'id>0' }] });
    expect(s.tables[0].indexes[1]).not.toHaveProperty('name');
    expect(s.tables[1]).not.toHaveProperty('schema');
    expect(s.tables[2].columns).toEqual([]);
    expect(pageToSchema({ nodes: [table('t4', 'bare', [], { enums: undefined })], edges: [] }).enums).toEqual([]);
    const en = pageToSchema({ nodes: [n('q', { label: 'q' }, 'table')], edges: [] });
    expect(en.tables[0].indexes).toEqual([]);
    const en2 = pageToSchema({ nodes: [n('q', { label: 'q', tableKind: 'enum' }, 'table')], edges: [] });
    expect(en2.enums[0].values).toEqual([]);
  });
  it('folds edge relations into fks', () => {
    const parent = table('p', 'users', [{ id: 'pc', name: 'id', type: 'int', pk: true }]);
    const child = table('c', 'posts', [{ id: 'cc', name: 'user_id', type: 'int' }, { id: 'dd', name: 'other', type: 'int', fk: { table: 'z', column: 'z' } }]);
    const rel = (extra: any, src = 'p', tgt = 'c') => e('r', src, tgt, { data: { relation: { fromCol: 'pc', toCol: 'cc', ...extra } } });
    const mk = (edge: CEdge, nodes = [parent, child, n('i')]) => pageToSchema({ nodes, edges: [edge] });
    expect(mk(rel({})).tables[1].columns[0].fk).toEqual({ table: 'users', column: 'id' });
    expect(mk(rel({ toCol: 'dd' })).tables[1].columns[1].fk).toEqual({ table: 'z', column: 'z' });
    expect(mk(rel({ toCol: undefined })).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({ fromCol: undefined })).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(e('r', 'p', 'c')).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({}, 'nope', 'c')).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({}, 'i', 'c')).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({}, 'p', 'i')).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({ fromCol: 'nocol' })).tables[1].columns[0].fk).toBeUndefined();
    expect(mk(rel({ toCol: 'nocol' })).tables[1].columns[0].fk).toBeUndefined();
    const noCols = { ...child, data: { label: 'posts' } };
    expect(mk(rel({}), [parent, noCols]).tables[1].columns).toEqual([]);
    const dupLabel = table('c2', 'posts', [{ id: 'cc', name: 'user_id', type: 'int' }]);
    const bare = { ...child, id: 'c3', data: { label: 'posts' } };
    expect(pageToSchema({ nodes: [parent, dupLabel, bare], edges: [e('r', 'p', 'c3', { data: { relation: { fromCol: 'pc', toCol: 'cc' } } })] }).tables[1].columns[0].fk).toBeUndefined();
    const noPcols = { ...parent, data: { label: 'users' } };
    expect(mk(rel({}), [noPcols, child]).tables[1].columns[0].fk).toBeUndefined();
  });
  it('schema types', () => {
    expect(DIALECTS).toEqual(['postgres', 'mysql', 'sqlite']);
    expect(emptySchema()).toEqual({ tables: [], enums: [] });
  });
});

describe('seedora', () => {
  const col = (name: string, type: string, extra: any = {}) => ({ name, type, pk: false, unique: false, nullable: true, ...extra });
  const g = (name: string, type: string, extra: any = {}, enums: any[] = []) => generatorFor(col(name, type, extra), 't', enums).generator;
  it('generatorFor rules', () => {
    expect(generatorFor(col('x', 'int', { fk: { table: 'a', column: 'id' } }), 't')).toEqual({ generator: 'reference', table: 'a', column: 'id' });
    expect(generatorFor(col('x', 'Role'), 't', [{ name: 'role', values: ['a'] }])).toEqual({ generator: 'enum', values: ['a'] });
    expect(generatorFor(col('x', "enum('a','it''s')"), 't')).toEqual({ generator: 'enum', values: ['a', "it's"] });
    expect(g('id', 'int', { pk: true, generated: 'identity' })).toBe('sequence');
    expect(g('id', 'int', { pk: true, generated: 'autoincrement' })).toBe('sequence');
    expect(g('id', 'uuid')).toBe('uuid');
    expect(g('a', 'boolean')).toBe('boolean');
    expect(g('is_x', 'text')).toBe('boolean');
    expect(g('email', 'text')).toBe('email');
    expect(g('first_name', 'text')).toBe('first_name');
    expect(g('given_name', 'text')).toBe('first_name');
    expect(g('last_name', 'text')).toBe('last_name');
    expect(g('surname', 'text')).toBe('last_name');
    expect(g('name', 'text')).toBe('full_name');
    expect(g('username', 'text')).toBe('username');
    expect(g('phone', 'text')).toBe('phone');
    expect(g('website', 'text')).toBe('url');
    expect(g('country', 'text')).toBe('country');
    expect(g('city', 'text')).toBe('city');
    expect(g('street', 'text')).toBe('address');
    expect(g('zip', 'text')).toBe('postal_code');
    expect(g('x', 'jsonb')).toBe('json');
    expect(g('x', 'timestamp')).toBe('timestamp');
    expect(g('created_at', 'text')).toBe('timestamp');
    expect(g('x', 'date')).toBe('date');
    expect(g('birthday', 'text')).toBe('date');
    expect(g('x', 'time')).toBe('time');
    expect(g('price', 'numeric(10,2)')).toBe('money');
    expect(g('x', 'float')).toBe('decimal');
    expect(g('total', 'int')).toBe('money');
    expect(g('x', 'bigint')).toBe('integer');
    expect(g('x', 'serial')).toBe('integer');
    expect(g('bio', 'text')).toBe('text');
    expect(g('x', 'varchar(10)')).toBe('word');
    expect(g('x', 'blob')).toBe('text');
  });
  it('toYaml shapes', () => {
    const v = { a: 1, b: 'x y', c: 'yes', d: [], e: {}, f: [1, 'two', { k: 'v', l: [1, 2] }, [3, 4], [], {}], g: { h: null, i: undefined, j: true }, 'k l': { m: [{ n: 1 }] }, s: 'a:b', arr: [[1], { x: [] }] };
    const text = toYaml(v);
    expect(YAML.parse(text)).toEqual({ ...v, g: { h: null, i: null, j: true } });
    expect(toYaml([])).toBe('[]');
    expect(toYaml({})).toBe('{}');
    expect(toYaml('plain')).toBe('plain');
    expect(toYaml(null)).toBe('null');
    expect(toYaml([{ a: { b: 1 } }], 1)).toContain('- a:');
    expect(toYaml({ x: [[]] })).toBe('x:\n  - []');
  });
  it('seedoraYaml', () => {
    const schema = {
      enums: [{ name: 'role', values: ['a', 'b'] }],
      tables: [
        { name: 'posts', kind: 'table' as const, columns: [col('id', 'int', { pk: true, nullable: false, generated: 'identity' }), col('user_id', 'int', { fk: { table: 'users', column: 'id' } }), col('self', 'int', { fk: { table: 'posts', column: 'id' } }), col('ext', 'int', { fk: { table: 'elsewhere', column: 'id' } })], indexes: [], checks: [] },
        { schema: 'pub', name: 'users', columns: [col('id', 'int', { pk: true, default: '1' }), col('v', 'int', { generated: 'as (1)' }), col('role', 'role')], indexes: [], checks: [{ name: 'c', expr: 'id>0' }, { expr: 'id<9' }] },
        { name: 'v', kind: 'view' as const, columns: [], indexes: [], checks: [] },
        { name: 'cyc_a', columns: [col('b', 'int', { fk: { table: 'cyc_b', column: 'id' } })], indexes: [], checks: [] },
        { name: 'cyc_b', columns: [col('a', 'int', { fk: { table: 'cyc_a', column: 'id' } })], indexes: [], checks: [] },
      ],
    };
    const text = seedoraYaml(schema, { rows: 10, seed: 7 });
    expect(text.startsWith('# seedora.yaml')).toBe(true);
    const y = YAML.parse(text);
    expect(y.seed.seed).toBe(7);
    expect(y.seed.order.slice(0, 2)).toEqual(['users', 'posts']);
    expect(y.seed.order).not.toContain('v');
    expect(y.seed.tables.users.rows).toBe(10);
    expect(y.seed.tables.posts.rows).toBe(50);
    expect(y.enums).toEqual({ role: ['a', 'b'] });
    const users = y.tables.find((t: any) => t.name === 'users');
    expect(users.schema).toBe('pub');
    expect(users.checks).toEqual([{ name: 'c', expr: 'id>0' }, { name: '', expr: 'id<9' }]);
    expect(users.columns[0]).toMatchObject({ has_default: true, nullable: false, generated: false });
    expect(users.columns[1]).toMatchObject({ generated: true, has_default: true });
    expect(users.primary_key).toEqual(['id']);
    const y2 = YAML.parse(seedoraYaml({ tables: [], enums: [] }));
    expect(y2.seed.seed).toBe(1);
    expect(y2.enums).toBeUndefined();
  });
});

describe('infra yamlish', () => {
  it('parses multi docs, skips empties, converts CFN tags', () => {
    const docs = yamlDocuments('a: 1\n---\n---\n{}\n---\n- x\n---\nb: !Ref X\nc: !GetAtt [A, B]\nd: !Join\n  sep: "-"\n', 'f.yml');
    expect(docs).toEqual([{ a: 1 }, ['x'], { b: { Ref: 'X' }, c: { 'Fn::GetAtt': ['A', 'B'] }, d: { 'Fn::Join': { sep: '-' } } }]);
    expect(yamlDocuments('', 'f')).toEqual([]);
  });
  it('syntax error names file, doc and line', () => {
    expect(() => yamlDocuments('a: [\n', 'f.yml')).toThrow(InfraError);
    expect(() => yamlDocuments('a: 1\n---\nb: [1\nc: 2\n', 'f.yml')).toThrow(/f\.yml: YAML syntax error in document 2/);
    try { yamlDocuments('a: 1\n b: 2\n', 'g.yml'); expect.unreachable(); } catch (x: any) { expect(x.message).toMatch(/^g\.yml: YAML syntax error/); expect(x.name).toBe('InfraError'); }
  });
});

describe('infra util', () => {
  it('slug', () => { expect(slug('Hello World!')).toMatch(/^hello/); });
  it('urlHosts', () => {
    expect(urlHosts('http://api:8080/x postgres://u:p@db/x cache:6379 api.ns.svc.cluster.local:80')).toEqual(['api', 'db', 'cache', 'api.ns.svc.cluster.local']);
    expect(urlHosts('nothing')).toEqual([]);
  });
  it('imageBase', () => {
    expect(imageBase('ghcr.io/acme/Web:1.4.2@sha256:abc')).toBe('web');
    expect(imageBase('redis')).toBe('redis');
  });
  it('dedupeEdges', () => {
    const r = dedupeEdges([{ from: 'a', to: 'b', label: 'x' }, { from: 'a', to: 'b', label: 'y' }, { from: 'a', to: 'b', label: 'x' }, { from: 'a', to: 'b' }, { from: 'a', to: 'a' }, { from: 'c', to: 'b', label: 'z' }, { from: 'q', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'c', label: 'k' }], new Set(['a', 'b', 'c']));
    expect(r).toEqual([{ from: 'a', to: 'b', label: 'x, y' }, { from: 'c', to: 'b', label: 'z' }, { from: 'a', to: 'c', label: 'k' }]);
    expect(dedupeEdges([{ from: 'q', to: 'b' }])).toHaveLength(1);
  });
});

const R = (id: string, extra: Partial<InfraRes> = {}): InfraRes => ({ id, type: 't', kind: '', name: id, ...extra });
describe('finalizeModel', () => {
  it('contracts hidden, drops group edges, prunes empty groups, reparents', () => {
    const m: InfraModel = {
      format: 'terraform', warnings: ['w'],
      resources: [
        R('a', { groupOf: 'g2' }), R('b'), R('h', { hidden: true }), R('g1', { group: true, groupOf: 'gX' }), R('g2', { group: true, groupOf: 'g1', groupKind: 'vpc' }),
        R('gHidden', { group: true, hidden: true }), R('m', { groupOf: 'gHidden' }), R('empty', { group: true }), R('emptyParent', { group: true }), R('emptyChild', { group: true, groupOf: 'emptyParent' }),
        R('gp', { group: true }), R('k', { groupOf: 'gHidden2' }), R('gHidden2', { hidden: true, groupOf: 'gp' }), R('h2', { hidden: true }), R('c'),
      ],
      edges: [{ from: 'a', to: 'h', label: 'x' }, { from: 'h', to: 'b' }, { from: 'h', to: 'a' }, { from: 'a', to: 'g2' }, { from: 'a', to: 'nope' }, { from: 'b', to: 'm' }, { from: 'b', to: 'h2' }, { from: 'h2', to: 'c', label: 'L' }],
    };
    const r = finalizeModel(m);
    expect(r.edges).toHaveLength(3);
    expect(r.edges).toEqual(expect.arrayContaining([{ from: 'a', to: 'b', label: 'x' }, { from: 'b', to: 'm' }, { from: 'b', to: 'c', label: 'L' }]));
    const ids = r.resources.map((x) => x.id);
    expect(ids).toEqual(['a', 'b', 'g1', 'g2', 'm', 'gp', 'k', 'c']);
    expect(r.resources.find((x) => x.id === 'm')!.groupOf).toBeUndefined();
    expect(r.resources.find((x) => x.id === 'k')!.groupOf).toBe('gp');
    expect(r.resources.find((x) => x.id === 'g1')!.groupOf).toBeUndefined();
    expect(r.warnings).toEqual(['w']);
  });
  it('empty group chain removed and member parent cleared', () => {
    const r = finalizeModel({ format: 'compose', warnings: [], edges: [], resources: [R('gp', { group: true }), R('gc', { group: true, groupOf: 'gp' })] });
    expect(r.resources).toEqual([]);
  });
});

describe('infraToPage', () => {
  it('nests groups, icons, labels edges', () => {
    const model: InfraModel = {
      format: 'terraform', warnings: [],
      resources: [
        R('web', { subtitle: 't3.micro', groupOf: 'sub', type: 'aws_instance' }),
        R('sub', { group: true, groupKind: 'subnet-public', groupOf: 'vpc' }),
        R('vpc', { group: true, groupKind: 'vpc' }),
        R('ns', { group: true, groupKind: 'network' }),
        R('mod', { group: true }),
        R('db', { type: 'aws_db_instance', groupOf: 'missing' }),
      ],
      edges: [{ from: 'web', to: 'db', label: 'sql' }, { from: 'db', to: 'web' }],
    };
    const p = infraToPage(model, { name: 'N', id: 'pid' });
    expect(p.id).toBe('pid');
    expect(p.name).toBe('N');
    const by = (id: string) => p.nodes.find((x) => x.id === id)!;
    expect(by('web').parentId).toBe('sub');
    expect(by('sub').parentId).toBe('vpc');
    expect(by('db').parentId).toBeUndefined();
    expect(by('web').data.subtitle).toBe('t3.micro');
    expect(by('web').type).toBe('icon');
    expect(by('vpc').type).toBe('group');
    expect(by('vpc').data.groupIcon).toBeTruthy();
    expect(by('ns').data.groupIcon).toBeUndefined();
    expect(by('mod').data.groupIcon).toBeUndefined();
    expect(p.nodes.indexOf(by('vpc'))).toBeLessThan(p.nodes.indexOf(by('sub')));
    expect(p.edges.map((x) => x.id)).toEqual(['e-web-db', 'e-db-web']);
    expect(p.edges[0].label).toBe('sql');
    expect(p.edges[1]).not.toHaveProperty('label');
    expect(infraToPage({ ...model, resources: [R('x')], edges: [] }).name).toBe('Imported infrastructure');
    expect(infraToPage({ ...model, resources: [R('x')], edges: [] }).id).toBe('page-1');
  });
});
