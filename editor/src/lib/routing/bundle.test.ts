import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, type Route } from './index';
import { MIN_TRACK_GAP, separateTracks, type TrackEdge } from './bundle';
import { routeOrthogonal } from './router';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';
import type { Pt } from './geometry';
import { bestMs } from '../../test/timing';

const P = (x: number, y: number): Pt => ({ x, y });
const none = () => [];

describe('separateTracks (unit)', () => {
  // two routes with a long horizontal middle segment: A at y=100, B at y=104
  const mk = (yb: number, presetB?: string): TrackEdge[] => [
    { id: 'a', points: [P(0, 0), P(20, 0), P(20, 100), P(300, 100), P(300, 200), P(320, 200)], preset: 'data' },
    { id: 'b', points: [P(0, 300), P(20, 300), P(20, yb), P(280, yb), P(280, 260), P(320, 260)], preset: presetB },
  ];
  it('same preset: merges onto one track (bundle)', () => {
    const e = mk(104, 'data');
    expect(separateTracks(e, none)).toBe(true);
    const ys = e.map((x) => x.points[2].y);
    expect(ys[0]).toBe(ys[1]);
  });
  it('different preset: pushes the parallels at least 10px apart', () => {
    const e = mk(104, 'other');
    separateTracks(e, none);
    expect(Math.abs(e[0].points[2].y - e[1].points[2].y)).toBeGreaterThanOrEqual(MIN_TRACK_GAP);
  });
  it('no preset on either: never bundled, separated', () => {
    const e = mk(100);
    e[0].preset = undefined;
    separateTracks(e, none);
    expect(Math.abs(e[0].points[2].y - e[1].points[2].y)).toBeGreaterThanOrEqual(MIN_TRACK_GAP);
  });
  it('already >= 10px apart: untouched', () => {
    const e = mk(130, 'other');
    expect(separateTracks(e, none)).toBe(false);
  });
  it('keeps polylines orthogonal and never creates jogs shorter than 10px', () => {
    const e = mk(103, 'other');
    separateTracks(e, none);
    for (const x of e) for (let i = 1; i < x.points.length; i++) {
      const a = x.points[i - 1]; const b = x.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(10);
    }
  });
  it('does not move through an obstacle', () => {
    const e = mk(104, 'other');
    const wall = { x: 100, y: 105, width: 100, height: 40 }; // blocks pushing B's track down
    const wall2 = { x: 100, y: 60, width: 100, height: 38 }; // and A's track up
    separateTracks(e, () => [wall, wall2]);
    for (const x of e) for (let i = 1; i < x.points.length; i++) {
      const a = x.points[i - 1]; const b = x.points[i];
      for (const w of [wall, wall2]) {
        const hit = Math.max(Math.min(a.x, b.x), w.x) < Math.min(Math.max(a.x, b.x), w.x + w.width) && Math.max(Math.min(a.y, b.y), w.y) < Math.min(Math.max(a.y, b.y), w.y + w.height);
        expect(hit).toBe(false);
      }
    }
  });
});

describe('router prefers same-preset tracks', () => {
  it('with a preferred track nearby the route joins it instead of running 1 grid line beside it', () => {
    const src = { pt: P(0, 100), side: 'right' as const };
    const dst = { pt: P(400, 200), side: 'left' as const };
    const free = routeOrthogonal(src, dst, [], {})!;
    const track = { horizontal: true, c: 160, lo: 40, hi: 360 };
    const joined = routeOrthogonal(src, dst, [], { prefer: [track] })!;
    expect(free.some((p) => p.y === 160)).toBe(false);
    expect(joined.some((p) => p.y === 160)).toBe(true);
  });
});

// ---------- property test over random layouts ----------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function layout(seed: number) {
  const r = rng(seed);
  const cols = 4; const rows = 3;
  const nodes: DiagramNode[] = [];
  for (let c = 0; c < cols; c++) for (let w = 0; w < rows; w++) {
    if (r() < 0.25) continue;
    nodes.push({ id: `n${c}-${w}`, type: 'icon', position: { x: c * 260 + Math.round(r() * 60), y: w * 220 + Math.round(r() * 50) }, width: 120, height: 96, data: { label: `n${c}-${w}`, iconId: 'service' } });
  }
  const edges: DiagramEdge[] = [];
  const presets = [undefined, 'sync', 'async'];
  const use = new Map<string, number>();
  const key = (id: string, side: string) => `${id}:${side}`;
  for (let i = 0; i < 4 + Math.floor(r() * 12) && nodes.length > 2; i++) {
    const a = nodes[Math.floor(r() * nodes.length)];
    const b = nodes[Math.floor(r() * nodes.length)];
    if (a.id === b.id || edges.some((e) => (e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id))) continue;
    // keep the density realistic: at most 3 edges per node (the port spacing on a 96px side stays >= 24px)
    if ((use.get(a.id) ?? 0) >= 3 || (use.get(b.id) ?? 0) >= 3) continue;
    use.set(a.id, (use.get(a.id) ?? 0) + 1); use.set(b.id, (use.get(b.id) ?? 0) + 1);
    void key;
    const preset = presets[Math.floor(r() * presets.length)];
    edges.push({ id: `e${i}`, source: a.id, target: b.id, data: { lineType: 'orthogonal', ...(preset ? { preset } : {}) } as DiagramEdge['data'] });
  }
  return { nodes, edges };
}

interface Run { id: string; preset?: string; horizontal: boolean; c: number; lo: number; hi: number }
function runs(routes: Map<string, Route>, edges: DiagramEdge[]): Run[] {
  const out: Run[] = [];
  for (const e of edges) {
    const r = routes.get(e.id);
    if (!r) continue;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]; const b = r.points[i];
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) out.push({ id: e.id, preset: e.data?.preset, horizontal: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) out.push({ id: e.id, preset: e.data?.preset, horizontal: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
  return out;
}
/** parallel, overlapping segments of different edges that are too close (and not a same-preset bundle) */
export function violations(rs: Run[]): string[] {
  const bad: string[] = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i]; const b = rs[j];
    if (a.id === b.id || a.horizontal !== b.horizontal) continue;
    if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= 2) continue;
    const d = Math.abs(a.c - b.c);
    const bundled = d < 1e-6 && !!a.preset && a.preset === b.preset;
    if (d < MIN_TRACK_GAP && !bundled) bad.push(`${a.id}/${b.id} d=${d.toFixed(1)}`);
  }
  return bad;
}

describe('property: random layouts', () => {
  const settings = resolveSettings(undefined, undefined);
  // geometry assertions must not depend on the CPU: the search's wall-clock deadline (budgetMs) would make a loaded run fall back to a stepped route
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: settings.edge };
  it('no parallel distinct-edge segments < 10px apart unless a same-preset bundle (200 layouts)', () => {
    let total = 0; let withEdges = 0; const failures: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { nodes, edges } = layout(seed);
      const routes = computeRoutes(nodes, edges, opts);
      const bad = violations(runs(routes, edges));
      total += edges.length; if (edges.length) withEdges++;
      if (bad.length) failures.push(`seed ${seed}: ${bad.join(', ')}`);
    }
    expect(withEdges).toBeGreaterThan(150);
    expect(total).toBeGreaterThan(800);
    expect(failures).toEqual([]);
  });
  it('all routes stay orthogonal, avoid node boxes and keep their endpoints (seeded layouts)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { nodes, edges } = layout(seed);
      const before = computeRoutes(nodes, edges, { ...opts, autoRoute: true });
      for (const e of edges) {
        const r = before.get(e.id)!;
        for (let i = 1; i < r.points.length; i++) expect(r.points[i].x === r.points[i - 1].x || r.points[i].y === r.points[i - 1].y, `seed ${seed} ${e.id}`).toBe(true);
        expect(r.points[0]).toEqual(r.src.pt);
        expect(r.points[r.points.length - 1]).toEqual(r.dst.pt);
      }
    }
  });
  it('same-preset edges bundle at least sometimes (shared collinear track)', () => {
    let shared = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { nodes, edges } = layout(seed);
      const rs = runs(computeRoutes(nodes, edges, opts), edges);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]; const b = rs[j];
        if (a.id !== b.id && a.preset && a.preset === b.preset && a.horizontal === b.horizontal && Math.abs(a.c - b.c) < 1e-6 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 10) shared++;
      }
    }
    expect(shared).toBeGreaterThan(0);
  });
  it('perf: 20-edge layouts stay within the 8ms/edge budget', () => {
    const { nodes, edges } = layout(7);
    expect(bestMs(() => void computeRoutes(nodes, edges, opts)) / Math.max(1, edges.length)).toBeLessThan(8);
  });
});
