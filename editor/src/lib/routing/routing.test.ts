import { describe, expect, it } from 'vitest';
import { center, countBends, isOrthogonal, nearestSides, nearestT, orthogonalize, pointAtT, polylineIntersectsRects, polylineLength, portPoint, segmentIntersectsRect, simplifyPolyline, type Pt, type Rect, type Side } from './geometry';
import { distributePorts, parallelIndex, parallelOffset } from './ports';
import { routeOrthogonal, smartRoute, stepRoute } from './router';
import { computeHops, curvedRoute, hopPoints, labelPoint, polylineToPath } from './path';
import { addWaypoint, dragSegment, followEndpoints, moveWaypoint, orthogonalFromWaypoints, removeWaypoint, segmentMidpoints, snapWaypoint } from './manual';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from './index';
import { monitoringStack } from '../../templates/monitoringStack';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';
import { bestMs } from '../../test/timing';

const R = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, width: w, height: h });
const P = (x: number, y: number): Pt => ({ x, y });

describe('sides and ports', () => {
  it('nearestSides picks the facing sides', () => {
    expect(nearestSides(R(0, 0), R(300, 0))).toEqual(['right', 'left']);
    expect(nearestSides(R(300, 0), R(0, 0))).toEqual(['left', 'right']);
    expect(nearestSides(R(0, 0), R(0, 300))).toEqual(['bottom', 'top']);
    expect(nearestSides(R(0, 300), R(0, 0))).toEqual(['top', 'bottom']);
    expect(nearestSides(R(0, 0), R(400, 60))).toEqual(['right', 'left']); // mostly horizontal
    expect(nearestSides(R(0, 0), R(40, 400))).toEqual(['bottom', 'top']); // mostly vertical
  });
  it('portPoint', () => {
    const r = R(10, 20, 100, 60);
    expect(portPoint(r, 'top')).toEqual(P(60, 20));
    expect(portPoint(r, 'bottom', 0.25)).toEqual(P(35, 80));
    expect(portPoint(r, 'left')).toEqual(P(10, 50));
    expect(portPoint(r, 'right', 0.75)).toEqual(P(110, 65));
  });
  it('port distribution spreads edges evenly along a shared side, ordered by the other end', () => {
    const rects = new Map<string, Rect>([['a', R(0, 100, 100, 100)], ['b', R(400, 0)], ['c', R(400, 120)], ['d', R(400, 300)]]);
    const mk = (id: string, t: string) => ({ id, source: 'a', target: t, sourceSide: 'right' as Side, targetSide: 'left' as Side });
    const out = distributePorts([mk('e3', 'd'), mk('e1', 'b'), mk('e2', 'c')], rects);
    const ys = ['e1', 'e2', 'e3'].map((id) => out.get(id)!.src.y);
    expect(ys).toEqual([125, 150, 175]); // 1/4, 2/4, 3/4 of the 100px side
    expect(new Set(ys).size).toBe(3);
    for (const id of ['e1', 'e2', 'e3']) expect(out.get(id)!.src.x).toBe(100);
    expect(out.get('e1')!.dst).toEqual(P(400, 30)); // single edge on the target side stays centred
  });
  it('separate sides are distributed independently; a single edge is centred', () => {
    const rects = new Map<string, Rect>([['a', R(0, 0)], ['b', R(300, 0)]]);
    const out = distributePorts([{ id: 'e', source: 'a', target: 'b', sourceSide: 'right', targetSide: 'left' }], rects);
    expect(out.get('e')!.src).toEqual(P(100, 30));
    expect(out.get('e')!.dst).toEqual(P(300, 30));
  });
  it('parallel edges between the same pair get symmetric offsets', () => {
    const idx = parallelIndex([{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'a' }, { id: '3', source: 'a', target: 'b' }, { id: '9', source: 'a', target: 'c' }]);
    expect(idx.get('1')).toEqual({ index: 0, count: 3 });
    expect(idx.get('3')).toEqual({ index: 2, count: 3 });
    expect(idx.get('9')).toEqual({ index: 0, count: 1 });
    expect([0, 1, 2].map((i) => parallelOffset(i, 3))).toEqual([-18, 0, 18]);
    expect([0, 1].map((i) => parallelOffset(i, 2))).toEqual([-9, 9]);
    expect(parallelOffset(0, 1)).toBe(0);
  });
});

describe('geometry helpers', () => {
  it('segment vs rect: interior only (touching a border is fine)', () => {
    const r = R(100, 100, 100, 100);
    expect(segmentIntersectsRect(P(0, 150), P(300, 150), r)).toBe(true);
    expect(segmentIntersectsRect(P(0, 100), P(300, 100), r)).toBe(false); // along the top border
    expect(segmentIntersectsRect(P(100, 0), P(100, 300), r)).toBe(false); // along the left border
    expect(segmentIntersectsRect(P(0, 50), P(300, 50), r)).toBe(false);
    expect(segmentIntersectsRect(P(150, 150), P(160, 160), r)).toBe(true); // fully inside
  });
  it('simplify removes duplicates and collinear points; orthogonalize adds corners', () => {
    expect(simplifyPolyline([P(0, 0), P(0, 0), P(50, 0), P(100, 0), P(100, 50)])).toEqual([P(0, 0), P(100, 0), P(100, 50)]);
    const o = orthogonalize([P(0, 0), P(100, 80)], true);
    expect(isOrthogonal(o)).toBe(true);
    expect(o).toEqual([P(0, 0), P(100, 0), P(100, 80)]);
    expect(countBends(o)).toBe(1);
  });
  it('pointAtT / nearestT / labelPoint are consistent on an L-shaped path', () => {
    const pts = [P(0, 0), P(100, 0), P(100, 100)];
    expect(polylineLength(pts)).toBe(200);
    expect(pointAtT(pts, 0.5).pt).toEqual(P(100, 0));
    expect(pointAtT(pts, 0.25).pt).toEqual(P(50, 0));
    expect(pointAtT(pts, 0.75).pt).toEqual(P(100, 50));
    expect(pointAtT(pts, 0).pt).toEqual(P(0, 0));
    expect(pointAtT(pts, 1).pt).toEqual(P(100, 100));
    expect(nearestT(pts, P(50, -30))).toBeCloseTo(0.25);
    expect(nearestT(pts, P(130, 75))).toBeCloseTo(0.875);
    for (const t of [0.1, 0.4, 0.5, 0.9]) expect(nearestT(pts, pointAtT(pts, t).pt)).toBeCloseTo(t, 5);
    const off = labelPoint(pts, 0.25, 10); // 10px perpendicular to a horizontal segment
    expect(off.x).toBeCloseTo(50);
    expect(Math.abs(off.y)).toBeCloseTo(10);
  });
  it('the label anchor of an orthogonal route lies ON the route (not the straight midpoint)', () => {
    const route = stepRoute({ pt: P(100, 30), side: 'right' }, { pt: P(400, 230), side: 'left' });
    const lp = labelPoint(route, 0.5);
    const onPath = route.slice(1).some((b, i) => {
      const a = route[i];
      const within = lp.x >= Math.min(a.x, b.x) - 1e-6 && lp.x <= Math.max(a.x, b.x) + 1e-6 && lp.y >= Math.min(a.y, b.y) - 1e-6 && lp.y <= Math.max(a.y, b.y) + 1e-6;
      return within && (Math.abs(a.x - b.x) < 1e-6 ? Math.abs(lp.x - a.x) < 1e-6 : Math.abs(lp.y - a.y) < 1e-6);
    });
    expect(onPath).toBe(true);
    const straightMid = P(250, 130);
    // for a Z route the straight midpoint is on the middle vertical segment; for a U/L route it is not: check an L route
    const l = stepRoute({ pt: P(100, 30), side: 'right' }, { pt: P(300, 300), side: 'top' });
    const lp2 = labelPoint(l, 0.5);
    expect(Math.hypot(lp2.x - 200, lp2.y - 165)).toBeGreaterThan(10);
    void straightMid;
  });
});

describe('stepRoute', () => {
  it('is orthogonal, starts and ends at the ports, leaves along the side', () => {
    for (const [a, b, sa, sb] of [[P(100, 30), P(400, 200), 'right', 'left'], [P(50, 60), P(300, 300), 'bottom', 'top'], [P(100, 30), P(300, 300), 'right', 'top'], [P(100, 30), P(20, 300), 'right', 'right']] as const) {
      const r = stepRoute({ pt: a, side: sa }, { pt: b, side: sb });
      expect(isOrthogonal(r)).toBe(true);
      expect(r[0]).toEqual(a);
      expect(r[r.length - 1]).toEqual(b);
    }
    const r = stepRoute({ pt: P(100, 30), side: 'right' }, { pt: P(400, 30), side: 'left' });
    expect(r).toEqual([P(100, 30), P(400, 30)]); // aligned: straight line
  });
});

describe('obstacle-avoiding router', () => {
  const route = (srcR: Rect, sSide: Side, dstR: Rect, dSide: Side, obstacles: Rect[]) =>
    routeOrthogonal({ pt: portPoint(srcR, sSide), side: sSide }, { pt: portPoint(dstR, dSide), side: dSide }, obstacles);
  it('aligned nodes: a straight line, zero bends', () => {
    const r = route(R(0, 0), 'right', R(400, 0), 'left', [])!;
    expect(r).toEqual([P(100, 30), P(400, 30)]);
  });
  it('minimises bends: offset targets need exactly one Z (two bends)', () => {
    const r = route(R(0, 0), 'right', R(400, 200), 'left', [])!;
    expect(isOrthogonal(r)).toBe(true);
    expect(countBends(r)).toBe(2);
  });
  it('routes around an obstacle standing in the way, keeping clear of it', () => {
    const wall = R(200, -100, 40, 260);
    const r = route(R(0, 0), 'right', R(400, 0), 'left', [wall])!;
    expect(r).not.toBeNull();
    expect(isOrthogonal(r)).toBe(true);
    expect(polylineIntersectsRects(r, [wall])).toBe(false);
    expect(countBends(r)).toBeGreaterThan(0);
    // padding: the path keeps ~12px away from the wall
    for (const p of r) expect(!(p.x > wall.x - 11 && p.x < wall.x + wall.width + 11 && p.y > wall.y - 11 && p.y < wall.y + wall.height + 11)).toBe(true);
  });
  it('returns null when the target is walled in; smartRoute then falls back to the step route', () => {
    const dst = R(400, 0);
    const walls = [R(330, -80, 30, 220), R(500, -80, 30, 220), R(330, -80, 200, 30), R(330, 110, 200, 30)];
    const src = { pt: portPoint(R(0, 0), 'right'), side: 'right' as Side };
    const d = { pt: portPoint(dst, 'left'), side: 'left' as Side };
    expect(routeOrthogonal(src, d, walls)).toBeNull();
    const s = smartRoute(src, d, walls);
    expect(s.routed).toBe(false);
    expect(isOrthogonal(s.points)).toBe(true);
  });
  it('gives up (null) when the time budget is exceeded', () => {
    let t = 0;
    const obstacles = [...Array.from({ length: 30 }, (_, i) => R(120 + (i % 6) * 40, -400 + Math.floor(i / 6) * 150, 20, 120)), R(500, -60, 20, 160)];
    const r = routeOrthogonal({ pt: P(100, 30), side: 'right' }, { pt: P(900, 30), side: 'left' }, obstacles, { budgetMs: 1, now: () => (t += 5) });
    expect(r).toBeNull();
  });
  it('is fast enough for typical diagrams (well under the 8ms budget per edge)', () => {
    const obstacles = Array.from({ length: 20 }, (_, i) => R(150 + (i % 5) * 170, 20 + Math.floor(i / 5) * 140, 100, 70));
    expect(bestMs(() => void routeOrthogonal({ pt: P(100, 55), side: 'right' }, { pt: P(1000, 450), side: 'left' }, obstacles))).toBeLessThan(8);
  });
});

describe('property: routes never cross node rectangles', () => {
  // small deterministic PRNG so failures are reproducible
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const layout = (rand: () => number, n: number): Rect[] => {
    const rects: Rect[] = [];
    let guard = 0;
    while (rects.length < n && guard++ < 500) {
      const r = R(Math.round(rand() * 1100), Math.round(rand() * 700), 80 + Math.round(rand() * 60), 50 + Math.round(rand() * 40));
      // keep nodes at least 40px apart so a corridor always exists
      if (!rects.some((o) => r.x < o.x + o.width + 40 && r.x + r.width + 40 > o.x && r.y < o.y + o.height + 40 && r.y + r.height + 40 > o.y)) rects.push(r);
    }
    return rects;
  };
  it('300 random layouts: orthogonal, ends on the ports, never through any node', () => {
    const rand = rng(12345);
    let routed = 0;
    for (let k = 0; k < 300; k++) {
      const rects = layout(rand, 9);
      const ai = Math.floor(rand() * rects.length);
      let bi = Math.floor(rand() * rects.length);
      if (bi === ai) bi = (bi + 1) % rects.length;
      const [sa, sb] = nearestSides(rects[ai], rects[bi]);
      const src = { pt: portPoint(rects[ai], sa), side: sa };
      const dst = { pt: portPoint(rects[bi], sb), side: sb };
      const others = rects.filter((_, i) => i !== ai && i !== bi);
      const r = routeOrthogonal(src, dst, others, { budgetMs: 1000 });
      if (!r) continue; // allowed: caller falls back to the step route
      routed++;
      expect(isOrthogonal(r), `layout ${k}`).toBe(true);
      expect(r[0]).toEqual(src.pt);
      expect(r[r.length - 1]).toEqual(dst.pt);
      expect(polylineIntersectsRects(r, others), `layout ${k} crosses another node`).toBe(false);
      expect(polylineIntersectsRects(r, [rects[ai], rects[bi]]), `layout ${k} crosses its own nodes`).toBe(false);
    }
    expect(routed).toBeGreaterThan(250); // the router succeeds in the vast majority of layouts
  });
});

describe('line jumps and path building', () => {
  const h = [P(0, 100), P(200, 100)];
  const v = [P(100, 0), P(100, 200)];
  it('detects proper crossings only', () => {
    expect(hopPoints(h, v)).toEqual([P(100, 100)]);
    expect(hopPoints(v, h)).toEqual([]); // the hop is on the horizontal edge
    expect(hopPoints(h, [P(200, 0), P(200, 200)])).toEqual([]); // touching at an endpoint is not a crossing
    expect(hopPoints(h, [P(100, 120), P(100, 300)])).toEqual([]);
  });
  it('computeHops assigns the hop to the horizontal edge', () => {
    const hops = computeHops(new Map([['a', h], ['b', v]]));
    expect(hops.get('a')).toEqual([P(100, 100)]);
    expect(hops.has('b')).toBe(false);
  });
  it('polylineToPath: sharp corners by default, rounded with radius, arc where it hops', () => {
    const pts = [P(0, 0), P(100, 0), P(100, 100)];
    expect(polylineToPath(pts)).toBe('M0,0 L100,0 L100,100');
    expect(polylineToPath(pts, { radius: 10 })).toContain('Q100,0');
    expect(polylineToPath(h, { hops: [P(100, 100)] })).toContain('A5,5');
    expect(polylineToPath(h)).not.toContain('A');
  });
  it('curved routes give a bezier path and sampled points; waypoints bend it through them', () => {
    const c = curvedRoute({ pt: P(0, 0), side: 'right' }, { pt: P(300, 200), side: 'left' });
    expect(c.d.startsWith('M0,0 C')).toBe(true);
    expect(c.points[0]).toEqual(P(0, 0));
    expect(c.points[c.points.length - 1].x).toBeCloseTo(300);
    const w = curvedRoute({ pt: P(0, 0), side: 'right' }, { pt: P(300, 0), side: 'left' }, [P(150, 120)]);
    expect(w.points.some((p) => Math.hypot(p.x - 150, p.y - 120) < 1)).toBe(true);
  });
});

describe('manual editing', () => {
  const route = [P(0, 0), P(100, 0), P(100, 100), P(300, 100)];
  it('segment midpoints', () => {
    expect(segmentMidpoints(route).map((m) => m.pt)).toEqual([P(50, 0), P(100, 50), P(200, 100)]);
    expect(segmentMidpoints(route).map((m) => m.horizontal)).toEqual([true, false, true]);
  });
  it('dragging an interior vertical segment moves it sideways and keeps every corner a right angle', () => {
    const out = dragSegment(route, 1, P(60, 999)); // the perpendicular component only: dx
    expect(isOrthogonal(out)).toBe(true);
    expect(out).toEqual([P(0, 0), P(160, 0), P(160, 100), P(300, 100)]);
  });
  it('dragging a segment that touches an endpoint keeps the endpoint fixed (inserts a connector)', () => {
    const out = dragSegment(route, 0, P(0, 40)); // first segment is horizontal: dy
    expect(out[0]).toEqual(P(0, 0));
    expect(out[out.length - 1]).toEqual(P(300, 100));
    expect(isOrthogonal(out)).toBe(true);
    const last = dragSegment(route, 2, P(0, -30));
    expect(last[last.length - 1]).toEqual(P(300, 100));
    expect(isOrthogonal(last)).toBe(true);
  });
  it('property: any sequence of segment drags stays orthogonal with fixed endpoints', () => {
    let pts = [P(0, 0), P(120, 0), P(120, 150), P(260, 150), P(260, 60), P(400, 60)];
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
    for (let i = 0; i < 100; i++) {
      pts = dragSegment(pts, Math.floor(Math.abs(rand()) * 2 * (pts.length - 1)), P(rand() * 80, rand() * 80));
      expect(isOrthogonal(pts)).toBe(true);
      expect(pts[0]).toEqual(P(0, 0));
      expect(pts[pts.length - 1]).toEqual(P(400, 60));
    }
  });
  it('waypoint add / move / delete', () => {
    let w = [P(10, 10), P(50, 50)];
    w = addWaypoint(w, 1, P(30, 80));
    expect(w).toEqual([P(10, 10), P(30, 80), P(50, 50)]);
    w = moveWaypoint(w, 1, P(31, 81));
    expect(w[1]).toEqual(P(31, 81));
    w = removeWaypoint(w, 1);
    expect(w).toEqual([P(10, 10), P(50, 50)]);
    expect(addWaypoint(w, 99, P(0, 0))).toHaveLength(3);
  });
  it('orthogonal route from stored waypoints leaves along the source side and stays orthogonal', () => {
    const o = orthogonalFromWaypoints({ pt: P(0, 0), side: 'right' }, { pt: P(300, 200), side: 'left' }, [P(150, 80)]);
    expect(isOrthogonal(o)).toBe(true);
    expect(o[0]).toEqual(P(0, 0));
    expect(o[o.length - 1]).toEqual(P(300, 200));
    expect(o[1].y).toBe(0); // first leg horizontal
  });
  it('snapping to grid and to alignment with other points', () => {
    expect(snapWaypoint(P(103, 98), { grid: 20 })).toEqual(P(100, 100));
    expect(snapWaypoint(P(103, 98), { align: [P(100, 55)], tol: 6 })).toEqual(P(100, 98));
    expect(snapWaypoint(P(103, 98), { align: [P(100, 100)], grid: 20, tol: 6 })).toEqual(P(100, 100));
  });
  it('followEndpoints keeps waypoints in proportion when the nodes move', () => {
    const w = followEndpoints([P(50, 25)], P(0, 0), P(100, 50), P(0, 0), P(200, 100));
    expect(w).toEqual([P(100, 50)]);
    expect(followEndpoints([P(10, 10)], P(0, 0), P(100, 0), P(50, 50), P(250, 50))[0].x).toBe(70);
  });
});

describe('computeRoutes (integration)', () => {
  const edgeDefaults = resolveSettings(undefined, undefined).edge;
  const opts = { ...DEFAULT_ROUTING, edgeDefaults };
  const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });
  const e = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source, target, data });

  it('floating ports: the nearest side is chosen and updates when a node moves', () => {
    const edges = [e('e', 'a', 'b')];
    const right = computeRoutes([n('a', 0, 0), n('b', 400, 0)], edges, opts).get('e')!;
    expect([right.src.side, right.dst.side]).toEqual(['right', 'left']);
    const below = computeRoutes([n('a', 0, 0), n('b', 0, 400)], edges, opts).get('e')!;
    expect([below.src.side, below.dst.side]).toEqual(['bottom', 'top']);
  });
  it('a pinned side (drop on a handle) is respected', () => {
    const r = computeRoutes([n('a', 0, 0), n('b', 400, 0)], [e('e', 'a', 'b', { pinSource: 'bottom', pinTarget: 'bottom' })], opts).get('e')!;
    expect([r.src.side, r.dst.side]).toEqual(['bottom', 'bottom']);
    expect(isOrthogonal(r.points)).toBe(true);
  });
  it('several edges on one side are spread, parallel edges do not overlap', () => {
    const nodes = [n('a', 0, 100), n('b', 400, 0), n('c', 400, 150), n('d', 400, 300)];
    const rs = computeRoutes(nodes, [e('1', 'a', 'b'), e('2', 'a', 'c'), e('3', 'a', 'd')], opts);
    const ys = ['1', '2', '3'].map((id) => rs.get(id)!.src.pt.y);
    expect(new Set(ys).size).toBe(3);
    const par = computeRoutes([n('a', 0, 0), n('b', 400, 0)], [e('x', 'a', 'b', { lineType: 'straight' }), e('y', 'a', 'b', { lineType: 'straight' })], opts);
    expect(par.get('x')!.points[0]).not.toEqual(par.get('y')!.points[0]);
  });
  it('orthogonal routes avoid unrelated nodes and groups', () => {
    const nodes = [n('a', 0, 0), n('b', 600, 0), n('wall', 280, -100, { width: 40, height: 260 }), { id: 'g', type: 'group', position: { x: 100, y: 300 }, width: 300, height: 200, data: { label: 'g' } } as DiagramNode];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(polylineIntersectsRects(r.points, [{ x: 280, y: -100, width: 40, height: 260 }])).toBe(false);
    expect(r.routed).toBe(true);
  });
  it('edges to nodes inside a group may cross that group', () => {
    const nodes = [n('a', 0, 100), { id: 'g', type: 'group', position: { x: 300, y: 0 }, width: 300, height: 300, data: { label: 'g' } } as DiagramNode, n('in', 40, 100, { parentId: 'g' })];
    const r = computeRoutes(nodes, [e('e', 'a', 'in')], opts).get('e')!;
    expect(r.routed).toBe(true);
    expect(isOrthogonal(r.points)).toBe(true);
  });
  it('manual routes are kept when "keep manual routes" is on, and reset to auto when the flag is cleared', () => {
    const nodes = [n('a', 0, 0), n('b', 400, 200)];
    const manual = e('e', 'a', 'b', { manual: true, waypoints: [P(200, -80), P(350, -80)] });
    const kept = computeRoutes(nodes, [manual], opts).get('e')!;
    expect(kept.manual).toBe(true);
    expect(kept.points.some((p) => Math.abs(p.y + 80) < 1e-6)).toBe(true);
    expect(isOrthogonal(kept.points)).toBe(true);
    const reset = computeRoutes(nodes, [{ ...manual, data: { ...manual.data, manual: false, waypoints: undefined } }], opts).get('e')!;
    expect(reset.manual).toBe(false);
    expect(reset.points.some((p) => Math.abs(p.y + 80) < 1e-6)).toBe(false);
    const ignored = computeRoutes(nodes, [manual], { ...opts, keepManual: false }).get('e')!;
    expect(ignored.points.some((p) => Math.abs(p.y + 80) < 1e-6)).toBe(false);
  });
  it('line jumps toggle adds arcs where orthogonal edges cross', () => {
    const nodes = [n('a', 0, 100), n('b', 500, 100), n('c', 250, -200), n('d', 250, 400)];
    const edges = [e('h', 'a', 'b'), e('v', 'c', 'd')];
    const on = computeRoutes(nodes, edges, { ...opts, jumps: true });
    const off = computeRoutes(nodes, edges, { ...opts, jumps: false });
    expect([...on.values()].some((r) => r.d.includes('A'))).toBe(true);
    expect([...off.values()].some((r) => r.d.includes('A'))).toBe(false);
  });
  it('step-rounded uses the corner radius; straight and curved are not orthogonal', () => {
    const nodes = [n('a', 0, 0), n('b', 400, 200)];
    expect(computeRoutes(nodes, [e('e', 'a', 'b', { lineType: 'step-rounded', cornerRadius: 12 })], opts).get('e')!.d).toContain('Q');
    expect(computeRoutes(nodes, [e('e', 'a', 'b', { lineType: 'straight' })], opts).get('e')!.orthogonal).toBe(false);
    expect(computeRoutes(nodes, [e('e', 'a', 'b', { lineType: 'curved' })], opts).get('e')!.d).toContain('C');
  });
  it('label position follows labelT along the real route and skips hidden endpoints', () => {
    const nodes = [n('a', 0, 0), n('b', 400, 200)];
    const r1 = computeRoutes(nodes, [e('e', 'a', 'b', { labelT: 0.25 })], opts).get('e')!;
    const r2 = computeRoutes(nodes, [e('e', 'a', 'b', { labelT: 0.75 })], opts).get('e')!;
    expect(r1.labelPt).not.toEqual(r2.labelPt);
    expect(computeRoutes([n('a', 0, 0), n('b', 400, 0, { hidden: true })], [e('e', 'a', 'b')], opts).size).toBe(0);
  });
  it('center helper', () => expect(center(R(0, 0, 100, 60))).toEqual(P(50, 30)));
});

describe('tight layouts', () => {
  const edgeDefaults = resolveSettings(undefined, undefined).edge;
  const opts = { ...DEFAULT_ROUTING, edgeDefaults };
  const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 120, height: 96, data: { label: id } });
  it('a 14px gap between nodes (stub would land inside the neighbour) is still routed by shrinking the padding', () => {
    const nodes = [n('above', 100, 0), n('a', 100, 110), n('b', 500, 400)];
    const r = computeRoutes(nodes, [{ id: 'e', source: 'a', target: 'b', data: { pinSource: 'top', pinTarget: 'left' } }], opts).get('e')!;
    expect(r.routed).toBe(true);
    expect(polylineIntersectsRects(r.points, [{ x: 100, y: 0, width: 120, height: 96 }])).toBe(false);
  });
  it('when the nearest sides are blocked by a neighbour, other sides are tried', () => {
    // destination's left side is wedged against a neighbour 4px away: its stub is unusable, so another side must be picked
    const nodes = [n('src', 0, 0), n('wall', 520, 0), n('dst', 644, 0)];
    const rs = computeRoutes(nodes, [{ id: 'e', source: 'src', target: 'dst', data: {} }], opts);
    const r = rs.get('e')!;
    expect(r.routed).toBe(true);
    expect(polylineIntersectsRects(r.points, [{ x: 520, y: 0, width: 120, height: 96 }])).toBe(false);
    expect(isOrthogonal(r.points)).toBe(true);
  });
  it('the monitoring template routes every edge around nodes (no fallbacks)', () => {
    const t = monitoringStack();
    const rs = computeRoutes(t.nodes, t.edges, opts);
    expect([...rs.values()].filter((r) => !r.routed)).toHaveLength(0);
    const leaf = t.nodes.filter((x) => x.type === 'icon');
    // no route passes through a leaf node other than its own endpoints
    for (const e of t.edges) {
      const r = rs.get(e.id)!;
      const others = leaf.filter((x) => x.id !== e.source && x.id !== e.target).map((x) => rectOf(t.nodes, x));
      expect(polylineIntersectsRects(r.points, others), e.id).toBe(false);
    }
  });
});
