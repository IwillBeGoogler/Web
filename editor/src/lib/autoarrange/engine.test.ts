import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { arrangeNodes, detectAlgo, type ArrangeOptions } from './engine';
import { absolutePosition, nodeSize } from '../graph';

const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}, data: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type: 'icon', position: { x, y }, width: 120, height: 96, data: { label: id, ...data }, ...extra }) as DiagramNode;
const e = (id: string, source: string, target: string, data: Record<string, unknown> = {}): DiagramEdge => ({ id, source, target, data }) as DiagramEdge;

function apply(nodes: DiagramNode[], res: ReturnType<typeof arrangeNodes>): DiagramNode[] {
  return nodes.map((x) => { const p = res.get(x.id); return p ? { ...x, position: { x: p.x, y: p.y }, ...(p.width ? { width: p.width, height: p.height } : {}) } : x; });
}
const rect = (all: DiagramNode[], x: DiagramNode) => { const p = absolutePosition(all, x); const s = nodeSize(x); return { x: p.x, y: p.y, w: s.width, h: s.height }; };
const overlap = (a: ReturnType<typeof rect>, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function expectNoOverlap(all: DiagramNode[]) {
  const leaves = all.filter((x) => x.type !== 'group' && x.type !== 'cluster');
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) expect(overlap(rect(all, leaves[i]), rect(all, leaves[j])), `${leaves[i].id} x ${leaves[j].id}`).toBe(false);
}
const flow = (): { nodes: DiagramNode[]; edges: DiagramEdge[] } => ({
  nodes: ['web', 'api', 'auth', 'orders', 'db', 'cache', 'queue', 'worker', 'note'].map((id, i) => n(id, 7 + (i % 2), 7)),
  edges: [e('1', 'web', 'api'), e('2', 'api', 'auth'), e('3', 'api', 'orders'), e('4', 'orders', 'db'), e('5', 'auth', 'db'), e('6', 'api', 'cache'), e('7', 'orders', 'queue'), e('8', 'queue', 'worker'), e('9', 'worker', 'db')],
});
const base: Partial<ArrangeOptions> = { algo: 'layered' };

describe('auto arrange engine', () => {
  it('separates stacked nodes, snaps to the grid, keeps sizes', () => {
    const { nodes, edges } = flow();
    const res = arrangeNodes(nodes, edges, base);
    const out = apply(nodes, res);
    expectNoOverlap(out);
    for (const x of out) { expect(x.position.x % 20).toBe(0); expect(x.position.y % 20).toBe(0); expect(nodeSize(x)).toEqual({ width: 120, height: 96 }); }
  });
  it('is deterministic', () => {
    const { nodes, edges } = flow();
    expect([...arrangeNodes(nodes, edges, base)]).toEqual([...arrangeNodes(nodes, edges, base)]);
  });
  it('flows left to right / top to bottom along the edges', () => {
    const { nodes, edges } = flow();
    const lr = apply(nodes, arrangeNodes(nodes, edges, { ...base, direction: 'LR' }));
    const x = (id: string) => lr.find((q) => q.id === id)!.position.x;
    expect(x('web')).toBeLessThan(x('api'));
    expect(x('api')).toBeLessThan(x('orders'));
    expect(x('orders')).toBeLessThan(x('db'));
    const tb = apply(nodes, arrangeNodes(nodes, edges, { ...base, direction: 'TB' }));
    const y = (id: string) => tb.find((q) => q.id === id)!.position.y;
    expect(y('web')).toBeLessThan(y('api'));
    expect(y('api')).toBeLessThan(y('db'));
  });
  it('roomy spacing is wider than compact', () => {
    const { nodes, edges } = flow();
    const span = (s: 'compact' | 'roomy') => { const o = apply(nodes, arrangeNodes(nodes, edges, { ...base, spacing: s })); return Math.max(...o.map((q) => q.position.x)); };
    expect(span('roomy')).toBeGreaterThan(span('compact'));
  });
  it('locked nodes stay and others avoid them', () => {
    const { nodes, edges } = flow();
    const locked = nodes.map((q) => (q.id === 'db' ? { ...q, position: { x: 400, y: 100 }, data: { ...q.data, locked: true } } : q));
    const res = arrangeNodes(locked, edges, base);
    expect(res.has('db')).toBe(false);
    expectNoOverlap(apply(locked, res));
  });
  it('groups lay out children inside and contain them', () => {
    const nodes = [n('g', 0, 0, { type: 'group', width: 50, height: 50 }), n('a', 0, 0, { parentId: 'g' }), n('b', 0, 0, { parentId: 'g' }), n('c', 0, 0, { parentId: 'g' }), n('x', 500, 0), n('y', 500, 0)];
    const edges = [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'x', 'g'), e('4', 'g', 'y')];
    const out = apply(nodes, arrangeNodes(nodes, edges, base));
    expectNoOverlap(out);
    const g = rect(out, out.find((q) => q.id === 'g')!);
    for (const id of ['a', 'b', 'c']) { const r = rect(out, out.find((q) => q.id === id)!); expect(r.x).toBeGreaterThanOrEqual(g.x); expect(r.y).toBeGreaterThanOrEqual(g.y); expect(r.x + r.w).toBeLessThanOrEqual(g.x + g.w); expect(r.y + r.h).toBeLessThanOrEqual(g.y + g.h); }
  });
  it('cluster members keep primary first', () => {
    const nodes = [n('c', 0, 0, { type: 'cluster' }), n('r1', 0, 0, { parentId: 'c' }, { role: 'replica' }), n('r2', 0, 0, { parentId: 'c' }, { role: 'replica' }), n('p', 0, 0, { parentId: 'c' }, { role: 'primary' })];
    const out = apply(nodes, arrangeNodes(nodes, [], { algo: 'auto' }));
    const p = out.find((q) => q.id === 'p')!.position;
    expect(p).toEqual({ x: 20, y: 60 });
    expectNoOverlap(out);
  });
  it('disconnected nodes become a compact grid', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => n(`s${i}`, 3, 3));
    const out = apply(nodes, arrangeNodes(nodes, [], { algo: 'auto' }));
    expectNoOverlap(out);
    expect(detectAlgo(nodes, [])).toBe('grid');
    expect(new Set(out.map((q) => q.position.y)).size).toBeGreaterThan(1);
  });
  it('UML: superclass above subclasses', () => {
    const cls = (id: string) => n(id, 0, 0, { type: 'class' });
    const nodes = [cls('Animal'), cls('Dog'), cls('Cat'), cls('Owner')];
    const edges = [e('1', 'Dog', 'Animal', { uml: { kind: 'inheritance' } }), e('2', 'Cat', 'Animal', { uml: { kind: 'inheritance' } }), e('3', 'Owner', 'Dog', { uml: { kind: 'association' } })];
    const out = apply(nodes, arrangeNodes(nodes, edges, { algo: 'auto' }));
    const y = (id: string) => out.find((q) => q.id === id)!.position.y;
    expect(y('Animal')).toBeLessThan(y('Dog'));
    expect(y('Animal')).toBeLessThan(y('Cat'));
    expectNoOverlap(out);
  });
  it('ERD: referenced table sits before the table that references it', () => {
    const t = (id: string) => n(id, 0, 0, { type: 'table' });
    const nodes = [t('orders'), t('users'), t('items')];
    const edges = [e('1', 'users', 'orders', { relation: { cardinality: '1:N' } }), e('2', 'orders', 'items', { relation: { cardinality: '1:N' } })];
    const out = apply(nodes, arrangeNodes(nodes, edges, { algo: 'auto' }));
    const x = (id: string) => out.find((q) => q.id === id)!.position.x;
    expect(x('users')).toBeLessThan(x('orders'));
    expect(x('orders')).toBeLessThan(x('items'));
  });
  it('selection: only selected nodes move', () => {
    const { nodes, edges } = flow();
    const res = arrangeNodes(nodes, edges, { ...base, selection: ['web', 'api', 'auth'] });
    for (const id of res.keys()) expect(['web', 'api', 'auth']).toContain(id);
    const out = apply(nodes, res);
    const sel = out.filter((q) => ['web', 'api', 'auth'].includes(q.id));
    for (const a of sel) for (const b of out) if (a !== b && !(sel.includes(b) && sel.indexOf(b) < sel.indexOf(a))) expect(overlap(rect(out, a), rect(out, b)), `${a.id} x ${b.id}`).toBe(false);
  });
  it('selected group: arranges inside and grows it', () => {
    const nodes = [n('g', 0, 0, { type: 'group', width: 50, height: 50 }), n('a', 0, 0, { parentId: 'g' }), n('b', 0, 0, { parentId: 'g' }), n('z', 100, 100)];
    const res = arrangeNodes(nodes, [e('1', 'a', 'b')], { ...base, selection: ['g'] });
    expect(res.get('g')!.width).toBeGreaterThan(50);
    expectNoOverlap(apply(nodes, res));
  });
});

describe('generated clusters stay intact in page layouts', () => {
  it('a profile cluster moves as one block: its members are not re-laid out', () => {
    const nodes = [n('c', 0, 0, { type: 'cluster' }, { profileId: 'postgresql' }), n('a', 10, 10, { parentId: 'c' }), n('b', 200, 10, { parentId: 'c' }), n('x', 900, 0)];
    const r = arrangeNodes(nodes, []);
    expect(r.has('a')).toBe(false);
    expect(r.has('b')).toBe(false);
  });
  it('compacts a hub + 6 collapsed spokes from mixed parents inside their own parents (no reparenting)', () => {
    const card = { width: 232, height: 132 };
    const grp = n('g', 0, 0, { type: 'group', width: 1200, height: 1200 });
    const hub = n('hub', 40, 400, { type: 'cluster', parentId: 'g', ...card }, { collapsed: true });
    const spokes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => n(id, 1300 + (i % 2) * 250, 100 + Math.floor(i / 2) * 200, { type: 'cluster', ...card }, { collapsed: true }));
    const nodes = [grp, hub, ...spokes];
    const edges = spokes.map((s) => e(`e_${s.id}`, 'hub', s.id));
    const sel = ['hub', ...spokes.map((s) => s.id)];
    const out = apply(nodes, arrangeNodes(nodes, edges, { algo: 'layered', direction: 'LR', spacing: 'compact', snap: 20, selection: sel }));
    for (const q of out) expect(q.parentId).toBe(nodes.find((x) => x.id === q.id)!.parentId);
    expectNoOverlap(out);
    // the root spokes form their own partition anchored at their original top-left; the lone hub stays in g
    const sp = spokes.map((s) => rect(out, out.find((x) => x.id === s.id)!));
    expect(Math.min(...sp.map((q) => q.x))).toBe(1300);
    expect(Math.min(...sp.map((q) => q.y))).toBe(100);
    expect(out.find((x) => x.id === 'hub')!.parentId).toBe('g');
  });
  it('two groups with a hub each, all selected: parents unchanged, children inside, no overlap', () => {
    const mk = (g: string, gx: number) => [
      n(g, gx, 0, { type: 'group', width: 300, height: 200 }),
      ...['h', 'a', 'b', 'c'].map((k, i) => n(`${g}${k}`, 20 + (i % 2) * 140, 60 + Math.floor(i / 2) * 100, { parentId: g })),
    ];
    const nodes = [...mk('hz', 0), ...mk('do', 700)];
    const edges = ['hz', 'do'].flatMap((g) => ['a', 'b', 'c'].map((k) => e(`${g}${k}`, `${g}h`, `${g}${k}`)));
    const res = arrangeNodes(nodes, edges, { algo: 'layered', direction: 'LR', spacing: 'compact', snap: 20, selection: nodes.filter((x) => x.parentId).map((x) => x.id) });
    const out = apply(nodes, res);
    for (const q of out) expect(q.parentId).toBe(nodes.find((x) => x.id === q.id)!.parentId);
    expectNoOverlap(out);
    for (const q of out.filter((x) => x.parentId)) {
      const p = rect(out, out.find((x) => x.id === q.parentId)!);
      const r = rect(out, q);
      expect(r.x).toBeGreaterThanOrEqual(p.x); expect(r.y).toBeGreaterThanOrEqual(p.y);
      expect(r.x + r.w).toBeLessThanOrEqual(p.x + p.w); expect(r.y + r.h).toBeLessThanOrEqual(p.y + p.h);
    }
    for (const g of ['hz', 'do']) expect(out.find((x) => x.id === g)!.position).toEqual(nodes.find((x) => x.id === g)!.position);
  });
});
