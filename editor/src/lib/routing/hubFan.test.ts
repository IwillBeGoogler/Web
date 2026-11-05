import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from './index';
import { segmentIntersectsRect, type Rect } from './geometry';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const W = 232, H = 132;
const cl = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'cluster', parentId: 'g', position: { x, y }, width: W, height: H, data: { collapsed: true, label: id } } as unknown as DiagramNode);
const CLEAR = 12;
const inf = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d });

/** hub left of a 2x3 grid of collapsed clusters (gaps 40px), all in one group */
function build(gap: number) {
  const ids = ['pg', 'or', 'mo', 'yb', 'my', 'va'];
  const nodes: DiagramNode[] = [
    { id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 40 + 2 * W + gap + 40, height: 60 + 3 * H + 2 * gap + 200, data: { label: 'G' } } as unknown as DiagramNode,
    ...ids.map((id, i) => cl(id, 40 + (i % 2) * (W + gap), 60 + Math.floor(i / 2) * (H + gap))),
    { id: 'deb', type: 'icon', parentId: 'g', position: { x: 40 + (W + gap) / 2 - 80, y: 60 + 3 * H + 2 * gap + 100 }, width: 160, height: 70, data: { label: 'Debezium' } } as unknown as DiagramNode,
  ];
  const edges = ids.map((t) => ({ id: `e-${t}`, source: 'deb', target: t, data: {} }) as unknown as DiagramEdge);
  return { nodes, edges, ids };
}

describe('hub fan-out to sibling cards', () => {
  for (const gap of [40, 60]) {
    it(`no edge enters another card or its 12px clearance (gap ${gap})`, () => {
      const { nodes, edges, ids } = build(gap);
      const routes = computeRoutes(nodes, edges, opts);
      for (const t of ids) {
        const pts = routes.get(`e-${t}`)!.points;
        for (const o of ids.filter((x) => x !== t)) {
          const r = inf(rectOf(nodes, nodes.find((n) => n.id === o)!), CLEAR - 1);
          for (let i = 0; i < pts.length - 1; i++) expect(segmentIntersectsRect(pts[i], pts[i + 1], r), `${t} too close to ${o}`).toBe(false);
        }
      }
    });
    // a 40px gap leaves a 16px channel after clearance: too narrow for three tracks, only checked for 60
    if (gap >= 60) it(`parallel segments of different edges keep apart (gap ${gap})`, () => {
      const { nodes, edges } = build(gap);
      const routes = [...computeRoutes(nodes, edges, opts).values()];
      const segs = routes.map((r) => r.points.slice(0, -1).map((a, i) => ({ a, b: r.points[i + 1] })));
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) for (const s of segs[i]) for (const t of segs[j]) {
        const h = Math.abs(s.a.y - s.b.y) < 1e-6 && Math.abs(t.a.y - t.b.y) < 1e-6;
        const v = Math.abs(s.a.x - s.b.x) < 1e-6 && Math.abs(t.a.x - t.b.x) < 1e-6;
        if (!h && !v) continue;
        const ax = h ? 'x' : 'y', cx = h ? 'y' : 'x';
        const ov = Math.min(Math.max(s.a[ax], s.b[ax]), Math.max(t.a[ax], t.b[ax])) - Math.max(Math.min(s.a[ax], s.b[ax]), Math.min(t.a[ax], t.b[ax]));
        if (ov > 20) expect(Math.abs(s.a[cx] - t.a[cx])).toBeGreaterThanOrEqual(9);
      }
    });
  }
});
