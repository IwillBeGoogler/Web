import { describe, expect, it } from 'vitest';
import { layoutClasses, GAP_X, GAP_Y } from './layout';
import { blankClass } from './geometry';
import { umlEdge } from './edges';
import type { DiagramEdge, DiagramNode } from '../../types';
import { nodeSize } from '../graph';

const cls = (id: string, kind: 'class' | 'interface' = 'class') => blankClass(id, { x: 0, y: 0 }, kind, id);
const rect = (n: DiagramNode, p: { x: number; y: number }) => ({ ...p, ...nodeSize(n) });

function run(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const pos = layoutClasses(nodes, edges);
  return { pos, r: (id: string) => rect(nodes.find((n) => n.id === id)!, pos.get(id)!) };
}
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('UML class layout', () => {
  const nodes = ['Animal', 'Dog', 'Cat', 'Puppy', 'Owner', 'Vet'].map((i) => cls(i));
  const edges = [
    umlEdge('e1', 'Dog', 'Animal', { kind: 'inheritance' }),
    umlEdge('e2', 'Cat', 'Animal', { kind: 'inheritance' }),
    umlEdge('e3', 'Puppy', 'Dog', { kind: 'inheritance' }),
    umlEdge('e4', 'Owner', 'Dog', { kind: 'association' }),
    umlEdge('e5', 'Owner', 'Vet', { kind: 'association' }),
  ];
  const { r, pos } = run(nodes, edges);

  it('puts every parent above its children, with room for relation labels', () => {
    for (const [c, p] of [['Dog', 'Animal'], ['Cat', 'Animal'], ['Puppy', 'Dog']]) expect(r(p).y + r(p).height + GAP_Y).toBeLessThanOrEqual(r(c).y);
  });
  it('siblings share a row', () => {
    expect(r('Dog').y).toBe(r('Cat').y);
  });
  it('places associated classes side by side (same row) instead of stacking them', () => {
    expect(r('Owner').y).toBe(r('Dog').y);
    expect(r('Vet').y).toBe(r('Owner').y);
  });
  it('never overlaps and keeps the horizontal gap', () => {
    const ids = nodes.map((n) => n.id);
    for (const a of ids) for (const b of ids) if (a < b) {
      expect(overlap(r(a), r(b)), `${a}/${b}`).toBe(false);
      if (r(a).y === r(b).y) expect(Math.max(r(b).x - (r(a).x + r(a).width), r(a).x - (r(b).x + r(b).width))).toBeGreaterThanOrEqual(GAP_X);
    }
  });
  it('centres a parent over its children', () => {
    const mid = (id: string) => r(id).x + r(id).width / 2;
    const kids = (mid('Dog') + mid('Cat')) / 2;
    expect(Math.abs(mid('Animal') - kids)).toBeLessThan(r('Animal').width);
  });
  it('is deterministic and honours the origin', () => {
    const again = layoutClasses(nodes, edges);
    expect([...again]).toEqual([...pos]);
    const moved = layoutClasses(nodes, edges, { origin: { x: 500, y: 300 } });
    expect(Math.min(...[...moved.values()].map((p) => p.x))).toBe(500);
    expect(Math.min(...[...moved.values()].map((p) => p.y))).toBe(300);
  });
  it('realization (interface above implementation) and cycles do not break it', () => {
    const ns = [cls('Repo', 'interface'), cls('SqlRepo'), cls('A'), cls('B')];
    const es = [umlEdge('r', 'SqlRepo', 'Repo', { kind: 'realization' }), umlEdge('x', 'A', 'B', { kind: 'inheritance' }), umlEdge('y', 'B', 'A', { kind: 'inheritance' })];
    const l = run(ns, es);
    expect(l.r('Repo').y).toBeLessThan(l.r('SqlRepo').y);
    expect(l.pos.size).toBe(4);
  });
  it('separate diagrams do not overlap and a lone class still gets a place', () => {
    const ns = [cls('A'), cls('B'), cls('C'), cls('D'), cls('Solo')];
    const es = [umlEdge('1', 'B', 'A', { kind: 'inheritance' }), umlEdge('2', 'D', 'C', { kind: 'inheritance' })];
    const l = run(ns, es);
    const ids = ns.map((n) => n.id);
    for (const a of ids) for (const b of ids) if (a < b) expect(overlap(l.r(a), l.r(b))).toBe(false);
  });
  it('ignores non-class nodes', () => {
    const t = { id: 't', type: 'text', position: { x: 0, y: 0 }, data: { label: 'x' } } as DiagramNode;
    expect(layoutClasses([t, cls('A')], []).has('t')).toBe(false);
  });
});

describe('wide rows wrap', () => {
  it('a hub with many associated classes does not make one endless row', () => {
    const hub = cls('Hub');
    const sats = Array.from({ length: 12 }, (_, i) => cls(`Sat${i}`));
    const es = sats.map((s, i) => umlEdge(`e${i}`, 'Hub', s.id, { kind: 'association', directed: true }));
    const l = run([hub, ...sats], es);
    const right = Math.max(...[hub, ...sats].map((n) => l.r(n.id).x + l.r(n.id).width));
    const left = Math.min(...[hub, ...sats].map((n) => l.r(n.id).x));
    expect(right - left).toBeLessThanOrEqual(1600);
    const all = [hub, ...sats];
    for (const a of all) for (const b of all) if (a.id < b.id) expect(overlap(l.r(a.id), l.r(b.id))).toBe(false);
  });
});
