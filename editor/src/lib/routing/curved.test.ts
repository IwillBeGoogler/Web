import { describe, expect, it } from 'vitest';
import { curvedRoute } from './path';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from './index';
import { sideVector, type Pt, type Side } from './geometry';
import { resolveSettings } from '../settings';
import { JUNCTION_SIZE } from '../junction';
import { monitoringMedium } from '../../templates/monitoringMedium';

const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const segs = (d: string) => {
  const n = nums(d);
  const out: { p0: Pt; c1: Pt; c2: Pt; p1: Pt }[] = [];
  let cur = { x: n[0], y: n[1] };
  for (let i = 2; i + 5 < n.length + 0; i += 6) {
    const s = { p0: cur, c1: { x: n[i], y: n[i + 1] }, c2: { x: n[i + 2], y: n[i + 3] }, p1: { x: n[i + 4], y: n[i + 5] } };
    out.push(s);
    cur = s.p1;
  }
  return out;
};
const len = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const port = (x: number, y: number, side: Side) => ({ pt: { x, y }, side });

describe('curved edges: smooth, bounded, no hooks', () => {
  it('tangents leave and arrive along the port normals', () => {
    const [s] = segs(curvedRoute(port(0, 0, 'right'), port(400, 200, 'left')).d);
    const sv = sideVector('right');
    expect((s.c1.x - s.p0.x) / len(s.c1, s.p0)).toBeCloseTo(sv.x, 5);
    expect((s.c1.y - s.p0.y)).toBeCloseTo(0, 5);
    // arrival: p1 - c2 points INTO the node (opposite of the target side normal)
    expect(s.p1.x - s.c2.x).toBeGreaterThan(0);
    expect(s.p1.y - s.c2.y).toBeCloseTo(0, 5);
  });
  it('control distance is min(0.5 * distance, 120px)', () => {
    const far = segs(curvedRoute(port(0, 0, 'right'), port(1500, 40, 'left')).d)[0];
    expect(len(far.c1, far.p0)).toBeCloseTo(120, 0);
    expect(len(far.p1, far.c2)).toBeCloseTo(120, 0);
    const near = segs(curvedRoute(port(0, 0, 'right'), port(100, 0, 'left')).d)[0];
    expect(len(near.c1, near.p0)).toBeCloseTo(50, 0);
  });
  it('with waypoints: every control stays within half its segment (no overshoot loop) and ends keep the port normals', () => {
    const wps = [{ x: 1200, y: 205 }, { x: 340, y: 205 }];
    const ss = segs(curvedRoute(port(1280, 100, 'left'), port(300, 420, 'bottom'), wps).d);
    expect(ss.length).toBe(3);
    for (const s of ss) {
      const l = len(s.p0, s.p1);
      expect(len(s.c1, s.p0)).toBeLessThanOrEqual(Math.min(0.5 * l, 120) + 0.5);
      expect(len(s.c2, s.p1)).toBeLessThanOrEqual(Math.min(0.5 * l, 120) + 0.5);
    }
    expect(ss[0].c1.x).toBeLessThan(ss[0].p0.x); // leaves the left side going left
    const last = ss[ss.length - 1];
    expect(last.p1.y - last.c2.y).toBeLessThan(0); // arrives at the bottom port moving up (into the node)
  });
  it('no sample point doubles back at the endpoint (monotone approach)', () => {
    const { points } = curvedRoute(port(0, 0, 'bottom'), port(300, 500, 'top'));
    const tail = points.slice(-4);
    for (let i = 1; i < tail.length; i++) expect(tail[i].y).toBeGreaterThanOrEqual(tail[i - 1].y);
  });
});

describe('curved junction edges', () => {
  const settings = resolveSettings({ edge: { lineType: 'curved' } }, undefined);
  // geometry assertions must not depend on the CPU: the search's wall-clock deadline (budgetMs) would make a loaded run fall back to a stepped route
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: settings.edge, nodeDefaults: settings.node };
  it('every curved edge end at a junction sits on the junction centre', () => {
    const d = monitoringMedium();
    const routes = computeRoutes(d.nodes, d.edges, opts);
    let checked = 0;
    for (const j of d.nodes.filter((n) => n.type === 'junction')) {
      const r = rectOf(d.nodes, j);
      const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      for (const e of d.edges) {
        const rt = routes.get(e.id);
        if (!rt) continue;
        expect(rt.lineType).toBe('curved');
        if (e.source === j.id) { expect(len(rt.points[0], c)).toBeLessThanOrEqual(0.5); checked++; }
        if (e.target === j.id) { expect(len(rt.points[rt.points.length - 1], c)).toBeLessThanOrEqual(0.5); checked++; }
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
  it('all template edges follow the global curved style (no hardcoded lineType)', () => {
    const d = monitoringMedium();
    const routes = computeRoutes(d.nodes, d.edges, opts);
    for (const e of d.edges) expect(routes.get(e.id)?.lineType, e.id).toBe('curved');
  });
  it('"Keep buses orthogonal" option keeps junction edges orthogonal, others curved', () => {
    const d = monitoringMedium();
    const kept = { ...opts, edgeDefaults: { ...opts.edgeDefaults, keepBusesOrthogonal: true } };
    const routes = computeRoutes(d.nodes, d.edges, kept);
    const isJ = (id: string) => d.nodes.find((n) => n.id === id)?.type === 'junction';
    for (const e of d.edges) expect(routes.get(e.id)?.lineType, e.id).toBe(isJ(e.source) || isJ(e.target) ? 'orthogonal' : 'curved');
  });
  it('JUNCTION_SIZE sanity', () => expect(JUNCTION_SIZE).toBe(10));
});
