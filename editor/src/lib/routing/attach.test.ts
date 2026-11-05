import { describe, expect, it } from 'vitest';
import { ATTACH_GAP, computeRoutes, DEFAULT_ROUTING, MIN_SEGMENT, portRectOf, rectOf } from './index';
import { dist, polylineIntersectsRects, removeShortSegments, isOrthogonal } from './geometry';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';

// geometry assertions must not depend on the CPU: the search's wall-clock deadline (budgetMs) would make a loaded run fall back to a stepped route
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: resolveSettings(undefined, undefined).edge };
/** auto-sized icon node (like every palette / template icon): no explicit width/height */
const icon = (id: string, x: number, y: number, data: Partial<DiagramNode['data']> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, data: { label: id, iconId: 'service', ...data } });
const box = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 60, data: { label: id, shape: 'rect' } });
const e = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source, target, data });

describe('attachment to the icon box', () => {
  it('icon nodes attach to the 48px glyph, not the whole 120x96 label block', () => {
    const n = icon('a', 100, 200);
    expect(portRectOf([n], n)).toEqual({ x: 100 + 36, y: 200 + 6, width: 48, height: 48 });
    expect(rectOf([n], n)).toMatchObject({ width: 120, height: 96 });
    const sized = { ...n, width: 100, height: 60 };
    expect(portRectOf([sized], sized)).toEqual(rectOf([sized], sized)); // explicit size: the node itself
    expect(portRectOf([{ ...n, data: { ...n.data, iconSize: 64 } }], { ...n, data: { ...n.data, iconSize: 64 } }).width).toBe(64);
  });
  it('the route starts and ends on the icon box edge, +-4px (arrow tip touches the icon, no floating gap)', () => {
    const nodes = [icon('a', 0, 0), icon('b', 400, 0)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    const A = portRectOf(nodes, nodes[0]);
    const B = portRectOf(nodes, nodes[1]);
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    expect(first.x).toBeCloseTo(A.x + A.width + ATTACH_GAP, 5);
    expect(last.x).toBeCloseTo(B.x - ATTACH_GAP, 5);
    expect(Math.abs(first.x - (A.x + A.width))).toBeLessThanOrEqual(4);
    expect(Math.abs(last.x - B.x)).toBeLessThanOrEqual(4);
    expect(first.y).toBeCloseTo(A.y + A.height / 2, 5); // centre of the ICON, not of the label block
  });
  it('top and bottom: top touches the glyph; bottom clears the caption', () => {
    const nodes = [icon('a', 0, 0), icon('b', 0, 400)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    const full = rectOf(nodes, nodes[0]);
    expect(r.points[0].y).toBeCloseTo(full.y + full.height + ATTACH_GAP, 5); // below the label
    expect(r.points[r.points.length - 1].y).toBeCloseTo(portRectOf(nodes, nodes[1]).y - ATTACH_GAP, 5);
  });
});

describe('nearly aligned ports', () => {
  it('|dy| < 12: a perfectly straight 2-point line (the attach point slides along the side instead of a jog)', () => {
    for (const dy of [3, 8, 11]) {
      const nodes = [icon('a', 0, 0), icon('b', 400, dy)];
      const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
      expect(r.points, `dy ${dy}`).toHaveLength(2);
      expect(r.points[0].y).toBe(r.points[1].y);
    }
  });
  it('the same for plain boxes and for vertical alignment', () => {
    const h = computeRoutes([box('a', 0, 0), box('b', 400, 9)], [e('e', 'a', 'b')], opts).get('e')!;
    expect(h.points).toHaveLength(2);
    const v = computeRoutes([icon('a', 0, 0), icon('b', 7, 400)], [e('e', 'a', 'b')], opts).get('e')!;
    expect(v.points).toHaveLength(2);
    expect(v.points[0].x).toBe(v.points[1].x);
  });
  it('clearly offset nodes still get a proper Z route (not forced straight)', () => {
    const r = computeRoutes([icon('a', 0, 0), icon('b', 400, 90)], [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points.length).toBeGreaterThan(2);
  });
});

describe('no tiny segments', () => {
  it('removeShortSegments slides a short interior jog away and never moves the end points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 4 }, { x: 200, y: 4 }, { x: 200, y: 100 }, { x: 300, y: 100 }];
    const out = removeShortSegments(pts, 10);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    expect(isOrthogonal(out)).toBe(true);
    for (let i = 0; i < out.length - 1; i++) expect(dist(out[i], out[i + 1])).toBeGreaterThanOrEqual(10);
  });
  it('property: over 300 random layouts of icons no routed orthogonal segment is shorter than 10px', () => {
    let seed = 4242;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const nodes: DiagramNode[] = [];
      for (let i = 0; i < 8; i++) {
        const c = icon(`n${i}`, Math.round(rand() * 1000), Math.round(rand() * 700));
        const r = rectOf([c], c);
        if (nodes.some((o) => { const q = rectOf([o], o); return r.x < q.x + q.width + 30 && r.x + r.width + 30 > q.x && r.y < q.y + q.height + 30 && r.y + r.height + 30 > q.y; })) continue;
        nodes.push(c);
      }
      if (nodes.length < 3) continue;
      const edges = [e('1', nodes[0].id, nodes[1].id), e('2', nodes[1].id, nodes[2].id), e('3', nodes[0].id, nodes[2].id)];
      const rs = computeRoutes(nodes, edges, opts);
      for (const ed of edges) {
        const r = rs.get(ed.id)!;
        if (!r.routed || r.points.length <= 2) continue;
        checked++;
        for (let i = 0; i < r.points.length - 1; i++) expect(dist(r.points[i], r.points[i + 1]), `layout ${k} edge ${ed.id} seg ${i}`).toBeGreaterThanOrEqual(MIN_SEGMENT - 1e-6);
        const others = nodes.filter((n) => n.id !== ed.source && n.id !== ed.target).map((n) => rectOf(nodes, n));
        expect(polylineIntersectsRects(r.points, others)).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});
