import { describe, expect, it } from 'vitest';
import { computeRoutes, createRouteCache, DEFAULT_ROUTING } from './routing';
import { resolveSettings } from './settings';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramEdge, DiagramNode } from '../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const nodes: DiagramNode[] = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, type: 'icon', position: { x: (i % 20) * 200, y: Math.floor(i / 20) * 150 }, width: 100, height: 70, data: { label: `n${i}` } }));
const edges: DiagramEdge[] = Array.from({ length: 450 }, (_, i) => {
  const a = i % 300;
  const b = (a + [1, 20, 21][i % 3] + 300) % 300;
  return { id: `e${i}`, source: `n${a}`, target: `n${b === a ? (b + 1) % 300 : b}`, data: {} };
});
const best = (n: number, f: () => void) => {
  let m = Infinity;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    f();
    m = Math.min(m, performance.now() - t);
  }
  return m;
};

describe('300 nodes / 450 edges (60fps budget: 16ms per frame)', () => {
  it('drag frame: moving one node re-routes incrementally within one frame', () => {
    const cache = createRouteCache();
    computeRoutes(nodes, edges, opts, cache);
    let cur = nodes;
    const ms = best(20, () => {
      cur = cur.map((n) => (n.id === 'n150' ? { ...n, position: { x: n.position.x + 9, y: n.position.y + 5 } } : n));
      computeRoutes(cur, edges, opts, cache);
    });
    expect(ms).toBeLessThan(16);
    expect(cache.reused).toBeGreaterThan(400);
  });
  it('store: a drag position change on a 300-node page stays well under a frame', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    s().loadDiagram({ nodes, edges });
    const ms = best(20, () => s().onNodesChange([{ type: 'position', id: 'n10', position: { x: 5, y: 5 }, dragging: true }]));
    expect(ms).toBeLessThan(8);
  });
  it('first full layout of 450 edges is bounded (per-edge budget)', () => {
    const t = performance.now();
    computeRoutes(nodes, edges, opts);
    expect((performance.now() - t) / edges.length).toBeLessThan(8);
  });
});
