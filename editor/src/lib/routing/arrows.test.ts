import { describe, expect, it } from 'vitest';
import { CARD_GAP, ATTACH_GAP, computeRoutes, DEFAULT_ROUTING, portRectOf, rectOf } from './index';
import { distributePorts, PORT_MIN_GAP } from './ports';
import { ensureEndSegments, MIN_END_SEGMENT, type Pt, type Rect } from './geometry';
import { labelAnchor, LABEL_BEND_CLEARANCE, longestSegment } from './path';
import { arrowMetrics, shortenEnds } from '../arrow';
import { resolveSettings } from '../settings';
import { labelPlacement } from './labelSide';
import type { DiagramEdge, DiagramNode } from '../../types';

const settings = resolveSettings(undefined, undefined);
// geometry assertions must not depend on the CPU: the search's wall-clock deadline (budgetMs) would make a loaded run fall back to a stepped route
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: settings.edge, nodeDefaults: settings.node };
const icon = (id: string, x: number, y: number, data: Partial<DiagramNode['data']> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, data: { label: id, iconId: 'service', ...data } });
const card = (id: string, x: number, y: number, w = 200, h = 100): DiagramNode => ({ id, type: 'card', position: { x, y }, width: w, height: h, data: { label: id } });
const shape = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 60, data: { label: id, shape: 'rect' } });
const e = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source, target, data });
const last = (p: Pt[]) => p[p.length - 1];

describe('3a. attach to the CARD bounds with a 3px gap', () => {
  it('card nodes: line starts / ends CARD_GAP (3px) outside the card edge', () => {
    expect(CARD_GAP).toBe(3);
    const nodes = [card('a', 0, 0), card('b', 500, 0)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points[0].x).toBeCloseTo(200 + 3, 5);
    expect(last(r.points).x).toBeCloseTo(500 - 3, 5);
    expect(r.src.pt.x).toBeCloseTo(203, 5);
  });
  it('top / bottom sides of a card too', () => {
    const nodes = [card('a', 0, 0), card('b', 0, 400)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points[0].y).toBeCloseTo(100 + 3, 5);
    expect(last(r.points).y).toBeCloseTo(400 - 3, 5);
  });
  it('shapes get the same 3px gap', () => {
    const nodes = [shape('a', 0, 0), shape('b', 400, 0)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points[0].x).toBeCloseTo(103, 5);
    expect(last(r.points).x).toBeCloseTo(397, 5);
  });
  it('an icon node with a visible card (filled background) attaches to the whole card, not the glyph', () => {
    const nodes = [icon('a', 0, 0, { background: 'filled' }), icon('b', 500, 0, { background: 'filled' })];
    const full = rectOf(nodes, nodes[0]);
    expect(portRectOf(nodes, nodes[0], settings.node)).toEqual(full);
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points[0].x).toBeCloseTo(full.x + full.width + 3, 5);
    expect(last(r.points).x).toBeCloseTo(500 - 3, 5);
  });
  it('a bordered icon node counts as a card; the global "filled" default too', () => {
    const n = icon('a', 0, 0, { border: true });
    expect(portRectOf([n], n, settings.node)).toEqual(rectOf([n], n));
    const t = icon('t', 0, 0);
    expect(portRectOf([t], t, { ...settings.node, background: 'filled' })).toEqual(rectOf([t], t));
  });
  it('transparent icon nodes keep the glyph-box attach (4px)', () => {
    const nodes = [icon('a', 0, 0), icon('b', 400, 0)];
    const A = portRectOf(nodes, nodes[0], settings.node);
    expect(A.width).toBe(48);
    const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
    expect(r.points[0].x).toBeCloseTo(A.x + A.width + ATTACH_GAP, 5);
  });
});

describe('3b. refined arrowhead geometry', () => {
  it('the visible line ends at the arrowhead base, the tip stays on the attach point', () => {
    const nodes = [card('a', 0, 0), card('b', 500, 0)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b', { strokeWidth: 1.5 })], opts).get('e')!;
    expect(last(r.points).x).toBeCloseTo(497, 5); // tip
    const len = arrowMetrics(1.5, 'M').length;
    expect(r.endCut).toBeCloseTo(len, 5);
    expect(r.startCut).toBe(0); // no start arrow by default
    // path data ends `len` px before the tip
    const end = r.d.match(/L([\d.]+),([\d.]+)$/)!;
    expect(Number(end[1])).toBeCloseTo(497 - len, 1);
  });
  it('size setting S/M/L changes the cut; arrows none cuts nothing', () => {
    const nodes = [card('a', 0, 0), card('b', 500, 0)];
    const cut = (arrowSize: 'S' | 'M' | 'L', arrows: 'end' | 'none' = 'end') => computeRoutes(nodes, [e('e', 'a', 'b')], { ...opts, edgeDefaults: { ...opts.edgeDefaults, arrowSize, arrows } }).get('e')!.endCut;
    expect(cut('S')).toBeLessThan(cut('M'));
    expect(cut('L')).toBeGreaterThan(cut('M'));
    expect(cut('M', 'none')).toBe(0);
  });
  it('cut scales with stroke width', () => {
    const nodes = [card('a', 0, 0), card('b', 500, 0)];
    const thin = computeRoutes(nodes, [e('e', 'a', 'b', { strokeWidth: 1.5 })], opts).get('e')!.endCut;
    const thick = computeRoutes(nodes, [e('e', 'a', 'b', { strokeWidth: 3 })], opts).get('e')!.endCut;
    expect(thick).toBeCloseTo(thin * 2, 5);
  });
  it('shortenEnds stays consistent with arrowMetrics', () => {
    const out = shortenEnds([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0, arrowMetrics(1.5).length);
    expect(last(out).x).toBeCloseTo(92, 5);
  });
});

describe('3c. last segment into a target is >= 16px and perpendicular', () => {
  const ends = (pts: Pt[]) => ({ a: pts[pts.length - 2], b: pts[pts.length - 1] });
  it('ensureEndSegments pushes a tiny final hook out to MIN_END_SEGMENT', () => {
    expect(MIN_END_SEGMENT).toBe(16);
    const pts: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 200, y: 80 }, { x: 200, y: 20 }, { x: 208, y: 20 }];
    const out = ensureEndSegments(pts, 16);
    const { a, b } = ends(out);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(16 - 1e-6);
    expect(b).toEqual({ x: 208, y: 20 }); // the attach point never moves
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out.every((p, i) => i === 0 || p.x === out[i - 1].x || p.y === out[i - 1].y)).toBe(true);
  });
  it('also fixes the start; leaves good paths and short paths alone', () => {
    const good: Pt[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 50 }, { x: 100, y: 50 }];
    expect(ensureEndSegments(good, 16)).toEqual(good);
    const two: Pt[] = [{ x: 0, y: 0 }, { x: 8, y: 0 }];
    expect(ensureEndSegments(two, 16)).toEqual(two);
    const startHook: Pt[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 60 }, { x: 100, y: 60 }];
    const out = ensureEndSegments(startHook, 16);
    expect(Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y)).toBeGreaterThanOrEqual(16 - 1e-6);
  });
  it('every routed edge ends with a perpendicular segment of >= 16px (layout sweep)', () => {
    const bad: string[] = [];
    for (const dx of [0, 30, 80, 150, 300]) {
      for (const dy of [-200, -90, -40, 0, 40, 90, 200]) {
        const nodes = [card('a', 400, 400), card('b', 400 + dx + 260, 400 + dy)];
        const r = computeRoutes(nodes, [e('e', 'a', 'b')], opts).get('e')!;
        const { a, b } = ends(r.points);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const horizontal = Math.abs(a.y - b.y) < 1e-6;
        const sideHorizontal = r.dst.side === 'left' || r.dst.side === 'right';
        if (len < 16 - 1e-6 || horizontal !== sideHorizontal) bad.push(`${dx},${dy}:${len.toFixed(1)}:${r.dst.side}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('3d. ports on one side: >= 12px apart, centred as a group', () => {
  const rect = (w: number, h: number): Rect => ({ x: 0, y: 0, width: w, height: h });
  const fan = (n: number, w: number, h: number) => {
    const rects = new Map<string, Rect>([['a', rect(w, h)]]);
    const es = [];
    for (let i = 0; i < n; i++) {
      rects.set(`t${i}`, { x: 400, y: i * 120 - 200, width: 40, height: 40 });
      es.push({ id: `e${i}`, source: 'a', target: `t${i}`, sourceSide: 'right' as const, targetSide: 'left' as const });
    }
    const out = distributePorts(es, rects);
    return es.map((x) => out.get(x.id)!.src.y).sort((p, q) => p - q);
  };
  it('PORT_MIN_GAP is 12', () => expect(PORT_MIN_GAP).toBe(12));
  it('on a 48px glyph side 4 ports are >= 12px apart', () => {
    const ys = fan(4, 48, 48);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12 - 1e-6);
  });
  it('the group is centred on the side', () => {
    for (const n of [1, 2, 3, 4]) {
      const ys = fan(n, 48, 48);
      expect((ys[0] + ys[n - 1]) / 2).toBeCloseTo(24, 5);
    }
  });
  it('roomy sides keep the even spread', () => {
    const ys = fan(3, 48, 200);
    expect(ys[1] - ys[0]).toBeCloseTo(50, 5);
  });
});

describe('3e. edge labels sit on the longest straight segment, centred, clear of bends', () => {
  const L: Pt[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 200 }, { x: 100, y: 200 }];
  it('longestSegment', () => {
    expect(longestSegment(L)).toBe(1);
  });
  it('default anchor = middle of the longest segment', () => {
    expect(labelAnchor(L)).toEqual({ x: 40, y: 100 });
    expect(labelAnchor([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 });
  });
  it('a user position is kept but pushed >= 8px away from a bend', () => {
    expect(LABEL_BEND_CLEARANCE).toBe(8);
    const near = labelAnchor(L, 40 / 340 + 0.001); // right at the first bend
    expect(Math.hypot(near.x - 40, near.y - 0)).toBeGreaterThanOrEqual(8 - 1e-6);
    const far = labelAnchor(L, 0.5);
    expect(far.x).toBe(40);
  });
  it('computeRoutes: labelPt is on the longest segment, >= 8px from every bend', () => {
    const nodes = [card('a', 0, 0), card('b', 500, 300)];
    const r = computeRoutes(nodes, [e('e', 'a', 'b', {}), e('e2', 'b', 'a', { pinSource: 'top', pinTarget: 'top' })], opts);
    for (const route of r.values()) {
      const seg = longestSegment(route.points);
      const a = route.points[seg];
      const b = route.points[seg + 1];
      expect(route.labelPt.x).toBeCloseTo((a.x + b.x) / 2, 5);
      expect(route.labelPt.y).toBeCloseTo((a.y + b.y) / 2, 5);
      for (const p of route.points.slice(1, -1)) expect(Math.hypot(route.labelPt.x - p.x, route.labelPt.y - p.y)).toBeGreaterThanOrEqual(8 - 1e-6);
    }
  });
  it('chip is centred on the line (also on vertical segments) with the background knock-out', () => {
    expect(labelPlacement(L, { x: 40, y: 100 }).anchor).toBe('center');
    expect(labelPlacement(L, { x: 40, y: 100 }, 'left').anchor).toBe('left'); // explicit side still honoured
  });
});
