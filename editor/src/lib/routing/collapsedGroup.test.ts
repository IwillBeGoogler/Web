import { describe, expect, it } from 'vitest';
import { computeRoutes, createRouteCache, DEFAULT_ROUTING, portRectOf, rectOf } from './index';
import { segmentIntersectsRect, type Pt, type Rect } from './geometry';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const cl = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'cluster', parentId: 'g', position: { x, y }, width: 190, height: 100, data: { collapsed: true, label: id } } as unknown as DiagramNode);
const mk = (iconPos: { x: number; y: number }, parent: boolean): DiagramNode[] => [
  { id: 'g', type: 'group', position: { x: 100, y: 50 }, width: 700, height: 580, data: { label: 'Digital Ocean' } } as unknown as DiagramNode,
  cl('pg', 40, 40), cl('or', 230, 40), cl('mo', 40, 160), cl('yb', 230, 160), cl('my', 40, 280), cl('va', 230, 280),
  { id: 'deb', type: 'icon', ...(parent ? { parentId: 'g' } : {}), position: iconPos, width: 160, height: 70, data: { label: 'Debezium' } } as unknown as DiagramNode,
];
const ids = ['pg', 'or', 'mo', 'yb', 'my', 'va'];
const edges: DiagramEdge[] = ids.map((t) => ({ id: `e-${t}`, source: 'deb', target: t, data: {} }) as unknown as DiagramEdge);

const near = (p: Pt, r: Rect, tol = 8) => p.x >= r.x - tol && p.x <= r.x + r.width + tol && p.y >= r.y - tol && p.y <= r.y + r.height + tol;

function check(nodes: DiagramNode[], routes: ReturnType<typeof computeRoutes>) {
  for (const t of ids) {
    const r = routes.get(`e-${t}`)!;
    const sr = portRectOf(nodes, nodes.find((n) => n.id === 'deb')!), tr = portRectOf(nodes, nodes.find((n) => n.id === t)!);
    expect(near(r.points[0], sr), `${t} start`).toBe(true);
    expect(near(r.points[r.points.length - 1], tr), `${t} end`).toBe(true);
    for (const o of ids.filter((x) => x !== t)) {
      const orect = rectOf(nodes, nodes.find((n) => n.id === o)!);
      for (let i = 0; i < r.points.length - 1; i++) expect(segmentIntersectsRect(r.points[i], r.points[i + 1], orect), `${t} crosses ${o}`).toBe(false);
    }
  }
}

describe('icon inside group with collapsed clusters', () => {
  for (const [name, pos, parent] of [['below, inside', { x: 200, y: 450 }, true], ['below left', { x: 40, y: 430 }, true], ['below right', { x: 420, y: 400 }, true], ['below tight', { x: 230, y: 395 }, true], ['beside, inside', { x: 450, y: 200 }, true], ['outside right', { x: 860, y: 250 }, false]] as const)
    it(name, () => {
      const nodes = mk(pos, parent);
      check(nodes, computeRoutes(nodes, edges, opts));
      // incremental: drag the icon through the cache, result must equal a cold compute
      const cache = createRouteCache();
      computeRoutes(nodes, edges, opts, cache);
      const moved = nodes.map((n) => (n.id === 'deb' ? { ...n, position: { x: pos.x + 20, y: pos.y + 10 } } : n));
      check(moved, computeRoutes(moved, edges, opts, cache));
    });
});

describe('collapsed cluster ports', () => {
  it('right / bottom ports sit on the outer edge of the stack layers', () => {
    const c = cl('pg', 40, 40);
    const full = rectOf([c], c);
    expect(portRectOf([c], c)).toEqual(full);
    const icon = { id: 'i', type: 'icon', position: { x: 600, y: 40 }, width: 160, height: 70, data: { label: 'i' } } as unknown as DiagramNode;
    const e = { id: 'e', source: 'pg', target: 'i', data: { pinSource: 'right' } } as unknown as DiagramEdge;
    const r = computeRoutes([c, icon], [e], opts).get('e')!;
    expect(r.points[0].x).toBeGreaterThanOrEqual(full.x + full.width);
    const e2 = { id: 'e2', source: 'pg', target: 'i', data: { pinSource: 'bottom' } } as unknown as DiagramEdge;
    const r2 = computeRoutes([c, icon], [e2], opts).get('e2')!;
    expect(r2.points[0].y).toBeGreaterThanOrEqual(full.y + full.height);
  });
});
