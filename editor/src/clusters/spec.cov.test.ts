import { describe, expect, it } from 'vitest';
import { ClusterBuilder } from './builder';
import { bool, comp, defineSpecProfile, grp, lead, minRule, num, oddRule, primary, sel, when, withExporter, type ClusterSpec } from './spec';
import { text } from './specs/fields';
import { defineParams } from './profiles/types';

type P = Record<string, unknown>;
const base = (over: Partial<ClusterSpec<P>> = {}): ClusterSpec<P> => ({
  id: 't', tech: 't', label: 'Test', iconId: 'redis', accent: '#123456', category: 'x', topologies: ['a'], roles: ['primary'],
  fields: [num('n', 'N', 1, 6, 3), num('m', 'M', 1, 4, 2), sel('mode', 'Mode', [['a', 'A'], ['b', 'B']], 'a'), bool('flag', 'Flag', false)],
  groups: [grp('g', 'Group', [comp('node', 'node', (p) => p.n as number, { role: primary, port: 80, sub: (i) => (i === 0 ? 'first' : undefined) }), comp('side', 'side', (p) => p.m as number, { show: (p) => !!p.flag })])],
  ...over,
});

describe('spec helpers', () => {
  it('role helpers', () => {
    expect(primary(0)).toBe('primary');
    expect(primary(2)).toBe('replica');
    expect(lead(0)).toBe('leader');
    expect(lead(1)).toBe('follower');
  });
  it('rules', () => {
    const odd = oddRule<P>('nodes', (p) => p.n as number);
    expect(odd({ n: 4 })).toMatch(/Even number of nodes \(4\)/);
    expect(odd({ n: 3 })).toBeUndefined();
    expect(odd({ n: 1 })).toBeUndefined();
    const min = minRule<P>(3, (p) => p.n as number, 'too few');
    expect(min({ n: 2 })).toBe('too few');
    expect(min({ n: 3 })).toBeUndefined();
    expect(when<P>((p) => p.flag === true, 'flagged')({ flag: true })).toBe('flagged');
    expect(when<P>(() => true, (p) => `n=${p.n}`)({ n: 5 })).toBe('n=5');
    expect(when<P>(() => false, 'x')({})).toBeUndefined();
  });
  it('field builders keep or omit showIf', () => {
    const f = num('a', 'A', 0, 1, 0, () => true);
    expect(f.showIf).toBeTypeOf('function');
    expect('showIf' in num('a', 'A', 0, 1, 0)).toBe(false);
    expect('showIf' in sel('a', 'A', [[1, '1']], 1)).toBe(false);
    expect(sel('a', 'A', [[1, '1']], 1, () => false).showIf).toBeTypeOf('function');
    expect('showIf' in bool('a', 'A', true)).toBe(false);
    expect(bool('a', 'A', true, () => false).showIf).toBeTypeOf('function');
    expect(text('t', 'T', 'x')).toEqual({ key: 't', type: 'text', label: 'T', default: 'x' });
    expect(text('t', 'T', 'x', () => true).showIf).toBeTypeOf('function');
  });
  it('defineParams builds a schema for every field type with defaults', () => {
    const { schema, defaults } = defineParams<P>([
      num('n', 'N', 1, 5, 2), bool('b', 'B', true), text('t', 'T', 'hi'), sel('s', 'S', [['x', 'X'], ['y', 'Y']], 'x'),
      { key: 'topics', type: 'topics', label: 'Topics', default: [{ name: 'a', partitions: 1, rf: 1 }] },
    ]);
    expect(schema.parse({})).toEqual(defaults);
    expect(schema.safeParse({ n: 9 }).success).toBe(false);
    expect(schema.safeParse({ s: 'z' }).success).toBe(false);
    expect(schema.safeParse({ topics: [{ name: '', partitions: 1, rf: 1 }] }).success).toBe(false);
  });
});

describe('defineSpecProfile', () => {
  it('generates rows with roles, ports, sub-titles and a hidden component', () => {
    const prof = defineSpecProfile(base());
    const g = prof.generate({ ...prof.defaults, n: 2 }, 'c');
    expect(g.nodes[0]).toMatchObject({ id: 'c', type: 'cluster' });
    const n1 = g.nodes.find((n) => n.id === 'c-node-1')!;
    expect(n1.data).toMatchObject({ label: 'node-1 :80', role: 'primary', subtitle: 'first' });
    expect(g.nodes.find((n) => n.id === 'c-node-2')!.data.subtitle).toBeUndefined();
    expect(g.nodes.some((n) => n.id.startsWith('c-side'))).toBe(false);
    expect(prof.summarize({ ...prof.defaults, n: 1 })).toBe('1 node');
    expect(prof.summarize({ ...prof.defaults, n: 3, flag: true, m: 2 })).toBe('3 nodes · 2 sides');
    const solo = prof.generate({ ...prof.defaults, n: 1 }, 'c');
    expect(solo.nodes.find((n) => n.id === 'c-node-1')!.data.label).toBe('node :80');
  });
  it('auto summary adds the AZ count; hidden groups and empty groups are skipped', () => {
    const prof = defineSpecProfile(base({
      fields: [num('n', 'N', 1, 6, 4), num('azs', 'AZ', 1, 3, 2), bool('flag', 'F', false)],
      groups: [grp('hidden', 'H', [comp('x', 'x', 1)], { show: () => false }), grp('empty', 'E', [comp('y', 'y', 0)]), grp('g', 'G', [comp('node', 'node', (p) => p.n as number)], { azSpread: true })],
    }));
    expect(prof.summarize(prof.defaults)).toBe('4 nodes · 2 AZ');
    const g = prof.generate(prof.defaults, 'c');
    expect(g.nodes.filter((n) => n.type === 'group').map((n) => n.id)).toEqual(['c-g-g', 'c-g-g-az1', 'c-g-g-az2']);
    expect(g.nodes.find((n) => n.id === 'c-node-2')!.parentId).toBe('c-g-g-az2');
  });
  it('lays groups out in columns or rows, with ring and wrapping rows', () => {
    const groups = [
      grp('r', 'Ring', [comp('a', 'a', 4), comp('b', 'b', 2)], { layout: 'ring' }),
      grp('w', 'Wide', [comp('c', 'c', 9)], { maxCols: 4 }),
      grp('f', 'Fn', [comp('d', 'd', 2)], { layout: () => 'ring' }),
    ];
    const col = defineSpecProfile(base({ fields: [], groups, arrange: 'columns' })).generate({}, 'q');
    const row = defineSpecProfile(base({ fields: [], groups })).generate({}, 'q');
    expect(col.size.width).toBeGreaterThan(row.size.width);
    expect(col.size.height).toBeLessThan(row.size.height);
    expect(col.nodes.filter((n) => n.parentId === 'q-g-w')).toHaveLength(9);
    expect(row.nodes.filter((n) => n.parentId === 'q-g-r').length).toBe(6);
  });
  it('every link mode wires the expected edges and picks facing handles', () => {
    const mk = (mode: ClusterSpec<P>['links'] extends (infer L)[] | undefined ? L extends { mode: infer M } ? M : never : never, extra: object = {}) =>
      defineSpecProfile(base({
        fields: [],
        groups: [grp('g', 'G', [comp('a', 'a', 3), comp('b', 'b', 2)])],
        links: [{ from: 'a', to: 'b', mode, ...extra } as never],
      })).generate({}, 'q').edges.map((e) => `${e.source.slice(2)}>${e.target.slice(2)}`);
    expect(mk('first-to-all')).toEqual(['a-1>b-1', 'a-1>b-2']);
    expect(mk('all-to-first')).toEqual(['a-1>b-1', 'a-2>b-1', 'a-3>b-1']);
    expect(mk('pair')).toEqual(['a-1>b-1', 'a-2>b-2', 'a-3>b-1']);
    expect(mk('first-to-first')).toEqual(['a-1>b-1']);
    expect(mk('all-to-all')).toHaveLength(6);
    const chain = defineSpecProfile(base({ fields: [], groups: [grp('g', 'G', [comp('a', 'a', 3)])], links: [{ from: 'a', to: 'a', mode: 'chain' }, { from: 'a', to: 'a', mode: 'ring' }, { from: 'a', to: 'a', mode: 'mesh' }] })).generate({}, 'q').edges.map((e) => `${e.source.slice(2)}>${e.target.slice(2)}`);
    expect(chain).toEqual(['a-1>a-2', 'a-2>a-3', 'a-1>a-2', 'a-2>a-3', 'a-3>a-1', 'a-1>a-2', 'a-1>a-3', 'a-2>a-3']);
  });
  it('links carry label, kind, replMode (static or computed), skip hidden rules and missing endpoints', () => {
    const prof = defineSpecProfile(base({
      fields: [bool('flag', 'F', false)],
      groups: [grp('g', 'G', [comp('a', 'a', 2)])],
      links: [
        { from: 'a', to: 'a', mode: 'chain', label: 'repl', kind: 'replication', replMode: 'sync' },
        { from: 'a', to: 'a', mode: 'chain', kind: 'replication', replMode: (p: P) => (p.flag ? 'async' : 'sync') },
        { from: 'a', to: 'a', mode: 'chain', show: (p: P) => !!p.flag },
        { from: 'a', to: 'missing', mode: 'chain' },
        { from: 'missing', to: 'a', mode: 'chain' },
      ],
    }));
    const edges = prof.generate({ flag: false }, 'q').edges;
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ label: 'repl', data: { generated: true, kind: 'replication', replMode: 'sync' } });
    expect(edges[1].label).toBeUndefined();
    expect(prof.generate({ flag: true }, 'q').edges).toHaveLength(3);
    expect(prof.generate({ flag: true }, 'q').edges[1].data).toMatchObject({ replMode: 'async' });
  });
  it('handles face the other node on all four sides', () => {
    const prof = defineSpecProfile(base({ fields: [], groups: [grp('g', 'G', [comp('a', 'a', 8)], { maxCols: 2 })], links: [{ from: 'a', to: 'a', mode: 'chain' }] }));
    const g = prof.generate({}, 'q');
    const handles = new Set(g.edges.map((e) => `${e.sourceHandle}>${e.targetHandle}`));
    expect([...handles].sort()).toEqual(['left>right', 'right>left']);
    const col = defineSpecProfile(base({ fields: [], groups: [grp('g', 'G', [comp('a', 'a', 3)], { maxCols: 1 })], links: [{ from: 'a', to: 'a', mode: 'chain' }, { from: 'a', to: 'a', mode: 'all-to-first' }] })).generate({}, 'q');
    expect(new Set(col.edges.map((e) => `${e.sourceHandle}>${e.targetHandle}`))).toEqual(new Set(['bottom>top', 'top>bottom']));
  });
  it('title, topology (static and computed) and rules end up on the cluster node', () => {
    const prof = defineSpecProfile(base({ title: (p) => `T${p.n}`, topology: (p) => `topo${p.n}`, rules: [minRule(5, (p) => p.n as number, 'small'), oddRule('n', (p) => p.n as number)], summarize: () => 'custom' }));
    const root = prof.generate({ n: 4 }, 'c').nodes.find((n) => n.id === 'c')!;
    expect(root.data).toMatchObject({ label: 'T4', topology: 'topo4', subtitle: 'custom' });
    expect(root.data.warnings).toHaveLength(2);
    const stat = defineSpecProfile(base({ topology: 'fixed' })).generate({ n: 3 }, 'c').nodes[0];
    expect(stat.data).toMatchObject({ label: 'Test', topology: 'fixed' });
    expect(defineSpecProfile(base()).generate({ n: 3 }, 'c').nodes[0].data.topology).toBeUndefined();
  });
  it('withExporter adds a toggle, an external node and a dashed scrape link, and extends custom summaries', () => {
    const prof = defineSpecProfile(withExporter(base(), { target: 'node', port: 9100 }));
    expect(prof.fields.some((f) => f.key === 'exporter')).toBe(true);
    const off = prof.generate({ ...prof.defaults, exporter: false }, 'c');
    expect(off.nodes.some((n) => n.id.startsWith('c-exporter'))).toBe(false);
    const on = prof.generate({ ...prof.defaults, exporter: true }, 'c');
    const ex = on.nodes.find((n) => n.id === 'c-exporter-1')!;
    expect(ex.data).toMatchObject({ label: 'exporter :9100', iconId: 'prometheus' });
    expect(on.edges.find((e) => e.label === 'scrape')).toMatchObject({ source: 'c-exporter-1', target: 'c-node-1', data: { strokeStyle: 'dashed' } });
    expect(prof.summarize({ ...prof.defaults, exporter: true })).toMatch(/ · exporter$/);
    expect(prof.summarize({ ...prof.defaults, exporter: false })).not.toMatch(/exporter/);
    const custom = defineSpecProfile(withExporter(base({ summarize: () => 'mine', externals: [comp('lb', 'lb', 1)] }), { target: 'node', port: 1, label: 'metrics', iconId: 'grafana' }));
    expect(custom.summarize({ ...custom.defaults, exporter: true })).toBe('mine · exporter');
    const g = custom.generate({ ...custom.defaults, exporter: true }, 'c');
    expect(g.nodes.find((n) => n.id === 'c-exporter-1')!.data).toMatchObject({ label: 'metrics :1', iconId: 'grafana' });
    expect(g.nodes.some((n) => n.id === 'c-lb-1')).toBe(true);
  });
});

describe('ClusterBuilder', () => {
  const mk = () => new ClusterBuilder('c', { label: 'L', iconId: 'redis', accent: '#000', profileId: 'x', params: {}, warnings: [] });
  it('root omits optional subtitle/topology; id() of the empty key is the cluster', () => {
    const b = mk().begin({ width: 10, height: 10 });
    expect(b.id('')).toBe('c');
    expect(b.nodes[0].data).not.toHaveProperty('subtitle');
    expect(b.nodes[0].data).not.toHaveProperty('topology');
    const withOpts = new ClusterBuilder('c', { label: 'L', subtitle: 's', topology: 't', iconId: 'redis', accent: '#000', profileId: 'x', params: {}, warnings: [] }).begin({ width: 1, height: 1 });
    expect(withOpts.nodes[0].data).toMatchObject({ subtitle: 's', topology: 't' });
  });
  it('same-row edges: neighbours go side to side, farther ones fan out under the row, direction follows x', () => {
    const b = mk().begin({ width: 500, height: 200 });
    b.group('', 'g', 'G', { x: 0, y: 0 }, { width: 500, height: 150 });
    for (let i = 0; i < 3; i++) b.member('g', `m${i}`, `m${i}`, { x: i * 150, y: 40 }, { iconId: 'redis' });
    b.member('g', 'low', 'low', { x: 0, y: 140 }, { iconId: 'redis', role: 'replica' });
    b.member(null, 'free', 'free', { x: 0, y: 0 }, { iconId: 'redis' });
    const bt = { sourceHandle: 'bottom', targetHandle: 'top' };
    b.edge('m0', 'm1', bt).edge('m0', 'm2', bt).edge('m2', 'm1', bt).edge('m1', 'm0', bt).edge('m0', 'low', bt).edge('m0', 'free', bt).edge('m0', 'ghost', bt).edge('m0', 'm1', { ...bt, data: { pinSource: 'top' } }).edge('m0', 'm1', { label: 'x' });
    const g = b.done({ width: 500, height: 200 });
    const h = g.edges.map((e) => `${e.sourceHandle}>${e.targetHandle}`);
    expect(h).toEqual(['right>left', 'bottom>bottom', 'left>right', 'left>right', 'bottom>top', 'bottom>top', 'bottom>top', 'bottom>top', 'right>left']);
    expect(g.edges[0].data).toMatchObject({ pinSource: 'right', pinTarget: 'left' });
    expect(g.edges[1].data).toMatchObject({ pinSource: 'bottom', pinTarget: 'bottom' });
    expect(g.edges[8].label).toBe('x');
    expect(g.nodes.find((n) => n.id === 'c-low')!.height).toBe(96 + 20);
    expect(g.rootId).toBe('c');
  });
});
