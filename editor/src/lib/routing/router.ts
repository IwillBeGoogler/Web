import { MIN_TRACK_GAP } from './bundle';
import { EPS, countBends, inflate, isHorizontalSide, segmentIntersectsRect, sideVector, simplifyPolyline, type Port, type Pt, type Rect } from './geometry';

export const DEFAULT_PAD = 12;
export const BEND_PENALTY = 60;
/** cost factor for travelling along a preferred (bundled) track */
export const BUNDLE_DISCOUNT = 0.3;
export const DEFAULT_BUDGET_MS = 8;
/** half-width (px) of the soft band on each side of an expanded container border, and its extra cost factor for parallel segments */
export const GROUP_BAND = 10;
export const GROUP_BAND_COST = 1;
/** extra cost factor for running parallel to (within MIN_TRACK_GAP of) a segment of another edge: later edges pick a free corridor / their own track */
export const OCCUPIED_COST = 10;
/** extra cost factor for a segment inside a gap between two obstacles that already holds as many tracks as fit (capacity = floor((gap - 2 * clearance) / MIN_TRACK_GAP) + 1) */
export const FULL_CORRIDOR_COST = 6;
const TRACK_CLEARANCE = 10;

/** The classic 3-segment orthogonal route (what smoothstep does): fast, no obstacle awareness. */
export function stepRoute(src: Port, dst: Port, stub = DEFAULT_PAD): Pt[] {
  const sv = sideVector(src.side);
  const dv = sideVector(dst.side);
  const a = { x: src.pt.x + sv.x * stub, y: src.pt.y + sv.y * stub };
  const b = { x: dst.pt.x + dv.x * stub, y: dst.pt.y + dv.y * stub };
  const hs = isHorizontalSide(src.side);
  const hd = isHorizontalSide(dst.side);
  let mid: Pt[];
  if (hs && hd) {
    const mx = (a.x + b.x) / 2;
    mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
  } else if (!hs && !hd) {
    const my = (a.y + b.y) / 2;
    mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
  } else if (hs) mid = [{ x: b.x, y: a.y }];
  else mid = [{ x: a.x, y: b.y }];
  return simplifyPolyline([src.pt, a, ...mid, b, dst.pt]);
}

interface Node {
  x: number;
  y: number;
}

class Heap {
  private a: { k: number; f: number }[] = [];
  push(k: number, f: number) {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0].k;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

export interface RouteOptions {
  /** segments of same-preset edges already routed: travelling along them is cheaper (bundling), their tracks join the search grid */
  prefer?: { horizontal: boolean; c: number; lo: number; hi: number }[];
  /** segments of edges routed earlier (any preset): running closer than MIN_TRACK_GAP alongside them costs extra, and tracks at that distance join the grid */
  occupied?: { horizontal: boolean; c: number; lo: number; hi: number }[];
  pad?: number;
  /** length of the straight leg out of / into a port (default `pad`); lets a long arrowhead sit on a leg without inflating obstacles */
  stub?: number;
  /** per-end override of `stub` (staggered legs of edges sharing a node side) */
  srcStub?: number;
  dstStub?: number;
  /** extra cost per bend (default BEND_PENALTY) */
  bendPenalty?: number;
  /** cost factor for running along an obstacle's padded border (0 = off): lines prefer the middle of a corridor */
  borderPenalty?: number;
  /** add grid lines in the middle of every corridor between two obstacles */
  corridors?: boolean;
  budgetMs?: number;
  /** expanded group / cluster rects: running parallel to their border inside +-GROUP_BAND costs extra (crossing it perpendicularly is free) */
  bands?: Rect[];
  /** huge diagrams: one attempt with the given padding (no 12 -> 6 -> 2px retries), so an unroutable edge costs one budget, not three */
  fast?: boolean;
  now?: () => number;
}

/**
 * Orthogonal route that avoids obstacles: A* over a sparse grid built from obstacle edges (inflated by `pad`),
 * with a bend penalty so straight lines win. Returns null if no route is found or the time budget is exceeded
 * (callers then fall back to `stepRoute`).
 */
export function routeOrthogonal(src: Port, dst: Port, obstacles: Rect[], opts: RouteOptions = {}): Pt[] | null {
  const pad = opts.pad ?? DEFAULT_PAD;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const t0 = now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const stub = opts.stub ?? pad;
  const bendCost = opts.bendPenalty ?? BEND_PENALTY;
  const borderCost = opts.borderPenalty ?? 0;
  const sv = sideVector(src.side);
  const dv = sideVector(dst.side);
  // facing, aligned ports (even closer than two stubs): a plain straight line, as long as nothing stands in between
  if (sv.x === -dv.x && sv.y === -dv.y) {
    const along = (dst.pt.x - src.pt.x) * sv.x + (dst.pt.y - src.pt.y) * sv.y; // distance in the exit direction
    const aligned = sv.x !== 0 ? Math.abs(src.pt.y - dst.pt.y) < EPS : Math.abs(src.pt.x - dst.pt.x) < EPS;
    if (aligned && along > 0 && !obstacles.some((r) => segmentIntersectsRect(src.pt, dst.pt, r))) return [src.pt, dst.pt];
  }
  const ss = opts.srcStub ?? stub, ds = opts.dstStub ?? stub;
  const s: Node = { x: src.pt.x + sv.x * ss, y: src.pt.y + sv.y * ss };
  const g: Node = { x: dst.pt.x + dv.x * ds, y: dst.pt.y + dv.y * ds };

  // only obstacles near the corridor matter
  const box = { minX: Math.min(s.x, g.x) - 160, maxX: Math.max(s.x, g.x) + 160, minY: Math.min(s.y, g.y) - 160, maxY: Math.max(s.y, g.y) + 160 };
  const obs = obstacles
    .map((r) => inflate(r, pad))
    .filter((r) => r.x < box.maxX && r.x + r.width > box.minX && r.y < box.maxY && r.y + r.height > box.minY);

  // preferred tracks that run through the corridor: their coordinates become grid lines
  const prefer = (opts.prefer ?? []).filter((p) => (p.horizontal ? p.c > box.minY && p.c < box.maxY && p.hi > box.minX && p.lo < box.maxX : p.c > box.minX && p.c < box.maxX && p.hi > box.minY && p.lo < box.maxY)).slice(0, 24);
  const occ = (opts.occupied ?? []).filter((p) => (p.horizontal ? p.c > box.minY && p.c < box.maxY && p.hi > box.minX && p.lo < box.maxX : p.c > box.minX && p.c < box.maxX && p.hi > box.minY && p.lo < box.maxY)).slice(0, 32);
  const xsSet = new Set<number>([s.x, g.x, (s.x + g.x) / 2]);
  const ysSet = new Set<number>([s.y, g.y, (s.y + g.y) / 2]);
  for (const p of prefer) {
    (p.horizontal ? ysSet : xsSet).add(p.c);
    (p.horizontal ? xsSet : ysSet).add(p.lo).add(p.hi); // entry / exit points of the shared track
  }
  for (const p of occ) (p.horizontal ? ysSet : xsSet).add(p.c - MIN_TRACK_GAP).add(p.c + MIN_TRACK_GAP); // free tracks right next to a used one
  const nearOcc = (a: Node, b: Node) =>
    occ.some((p) => (p.horizontal ? Math.abs(a.y - b.y) < EPS && Math.abs(a.y - p.c) < MIN_TRACK_GAP - EPS && Math.min(Math.max(a.x, b.x), p.hi) - Math.max(Math.min(a.x, b.x), p.lo) > 2 : Math.abs(a.x - b.x) < EPS && Math.abs(a.x - p.c) < MIN_TRACK_GAP - EPS && Math.min(Math.max(a.y, b.y), p.hi) - Math.max(Math.min(a.y, b.y), p.lo) > 2));
  /** the segment runs in a gap (< 200px) between two obstacles that already holds as many parallel tracks as fit */
  const fullCorridor = (a: Node, b: Node) => {
    const h = Math.abs(a.y - b.y) < EPS;
    const c = h ? a.y : a.x, lo = h ? Math.min(a.x, b.x) : Math.min(a.y, b.y), hi = h ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    let t = -Infinity, u = Infinity;
    for (const r of obs) {
      const [c0, c1, l0, l1] = h ? [r.y, r.y + r.height, r.x, r.x + r.width] : [r.x, r.x + r.width, r.y, r.y + r.height];
      if (l1 <= lo + EPS || l0 >= hi - EPS) continue;
      if (c1 <= c + EPS) t = Math.max(t, c1);
      else if (c0 >= c - EPS) u = Math.min(u, c0);
    }
    if (!(u - t < 200)) return false;
    const cap = Math.floor((u - t + 2 * pad - 2 * TRACK_CLEARANCE) / MIN_TRACK_GAP) + 1;
    const used = new Set<number>();
    for (const p of occ) if (p.horizontal === h && p.c > t - EPS && p.c < u + EPS && Math.min(p.hi, hi) - Math.max(p.lo, lo) > 2) used.add(Math.round(p.c));
    return used.size >= cap;
  };
  const onPrefer = (a: Node, b: Node) =>
    prefer.some((p) => (p.horizontal ? Math.abs(a.y - p.c) < EPS && Math.abs(b.y - p.c) < EPS && Math.min(a.x, b.x) >= p.lo - EPS && Math.max(a.x, b.x) <= p.hi + EPS : Math.abs(a.x - p.c) < EPS && Math.abs(b.x - p.c) < EPS && Math.min(a.y, b.y) >= p.lo - EPS && Math.max(a.y, b.y) <= p.hi + EPS));
  for (const r of obs) {
    xsSet.add(r.x);
    xsSet.add(r.x + r.width);
    ysSet.add(r.y);
    ysSet.add(r.y + r.height);
  }
  if (opts.corridors) {
    // a grid line through the middle of every free corridor, so a line can run between two tables instead of along one
    for (const [set, lo, hi] of [[xsSet, 'x', 'width'], [ysSet, 'y', 'height']] as const) {
      const sorted = [...set].sort((a, b) => a - b);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const gap = sorted[i + 1] - sorted[i];
        if (gap > 14 && gap < 420 && obs.some((r) => r[lo] + r[hi] === sorted[i] || Math.abs(r[lo] + r[hi] - sorted[i]) < EPS)) set.add(Math.round((sorted[i] + sorted[i + 1]) / 2));
      }
    }
  }
  const bands = (opts.bands ?? []).filter((r) => r.x - GROUP_BAND < box.maxX && r.x + r.width + GROUP_BAND > box.minX && r.y - GROUP_BAND < box.maxY && r.y + r.height + GROUP_BAND > box.minY);
  // grid lines just outside each band, so a line can leave the border zone
  for (const r of bands)
    for (const o of [-GROUP_BAND - 1, GROUP_BAND + 1]) {
      xsSet.add(r.x + o).add(r.x + r.width + o);
      ysSet.add(r.y + o).add(r.y + r.height + o);
    }
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  const W = xs.length;
  const H = ys.length;
  const blocked = (x: number, y: number) => obs.some((r) => x > r.x + EPS && x < r.x + r.width - EPS && y > r.y + EPS && y < r.y + r.height - EPS);
  const segFree = (a: Node, b: Node) => !obs.some((r) => segmentIntersectsRect(a, b, r));

  /** a segment lying on the padded border of an obstacle (hugging a table) */
  const alongBorder = (a: Node, b: Node) =>
    obs.some((r) =>
      Math.abs(a.y - b.y) < EPS
        ? (Math.abs(a.y - r.y) < EPS || Math.abs(a.y - (r.y + r.height)) < EPS) && Math.max(a.x, b.x) > r.x + EPS && Math.min(a.x, b.x) < r.x + r.width - EPS
        : (Math.abs(a.x - r.x) < EPS || Math.abs(a.x - (r.x + r.width)) < EPS) && Math.max(a.y, b.y) > r.y + EPS && Math.min(a.y, b.y) < r.y + r.height - EPS);

  /** a segment running parallel to a container border inside its band */
  const inBand = (a: Node, b: Node) =>
    bands.some((r) =>
      Math.abs(a.y - b.y) < EPS
        ? (Math.abs(a.y - r.y) <= GROUP_BAND || Math.abs(a.y - (r.y + r.height)) <= GROUP_BAND) && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width
        : (Math.abs(a.x - r.x) <= GROUP_BAND || Math.abs(a.x - (r.x + r.width)) <= GROUP_BAND) && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height);

  const idx = (i: number, j: number) => j * W + i;
  const sI = xs.findIndex((x) => Math.abs(x - s.x) < EPS);
  const sJ = ys.findIndex((y) => Math.abs(y - s.y) < EPS);
  const gI = xs.findIndex((x) => Math.abs(x - g.x) < EPS);
  const gJ = ys.findIndex((y) => Math.abs(y - g.y) < EPS);
  if (blocked(s.x, s.y) || blocked(g.x, g.y)) return null;

  // directions: 0 right, 1 down, 2 left, 3 up
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const startDir = Math.abs(sv.x) > 0 ? (sv.x > 0 ? 0 : 2) : sv.y > 0 ? 1 : 3;
  const endDir = Math.abs(dv.x) > 0 ? (dv.x > 0 ? 0 : 2) : dv.y > 0 ? 1 : 3; // direction the route must arrive moving opposite to
  const N = W * H * 4;
  const best = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const state = (i: number, j: number, d: number) => idx(i, j) * 4 + d;
  const startState = state(sI, sJ, startDir);
  best[startState] = 0;
  const hScale = prefer.length ? BUNDLE_DISCOUNT : 1; // keeps the heuristic admissible when bundled tracks are cheaper
  heap.push(startState, (Math.abs(xs[gI] - xs[sI]) + Math.abs(ys[gJ] - ys[sJ])) * hScale);
  let goal = -1;
  let steps = 0;
  while (heap.size) {
    if ((++steps & 127) === 0 && now() - t0 > budget) return null;
    const cur = heap.pop()!;
    const d = cur & 3;
    const cell = cur >> 2;
    const i = cell % W;
    const j = Math.floor(cell / W);
    if (i === gI && j === gJ) {
      // the stub may be reached from any side except through the destination node itself (travelling outward)
      if (d !== endDir || (sI === gI && sJ === gJ)) {
        goal = cur;
        break;
      }
    }
    const base = best[cur];
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turns
      const ni = i + DX[nd];
      const nj = j + DY[nd];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const a = { x: xs[i], y: ys[j] };
      const b = { x: xs[ni], y: ys[nj] };
      if (blocked(b.x, b.y) || !segFree(a, b)) continue;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const along = borderCost && alongBorder(a, b) ? len * borderCost : 0;
      const band = bands.length && inBand(a, b) ? len * GROUP_BAND_COST : 0;
      const cost = base + (prefer.length && onPrefer(a, b) ? len * BUNDLE_DISCOUNT : len) + along + band + (occ.length && nearOcc(a, b) ? len * OCCUPIED_COST : 0) + (occ.length && fullCorridor(a, b) ? len * FULL_CORRIDOR_COST : 0) + (nd === d ? 0 : bendCost);
      const ns = state(ni, nj, nd);
      if (cost < best[ns]) {
        best[ns] = cost;
        prev[ns] = cur;
        heap.push(ns, cost + (Math.abs(xs[gI] - b.x) + Math.abs(ys[gJ] - b.y)) * hScale);
      }
    }
  }
  if (goal < 0) return null;
  const pts: Pt[] = [];
  for (let c = goal; c >= 0; c = prev[c]) {
    const cell = c >> 2;
    pts.push({ x: xs[cell % W], y: ys[Math.floor(cell / W)] });
  }
  pts.reverse();
  return simplifyPolyline([src.pt, ...pts, dst.pt]);
}

/**
 * Obstacle-avoiding route with graceful fallback to the plain step route. In tight layouts the stub / padding is
 * reduced step by step (12 -> 8 -> 6 -> 4 -> 2px) before giving up.
 */
export function smartRoute(src: Port, dst: Port, obstacles: Rect[], opts: RouteOptions = {}): { points: Pt[]; routed: boolean } {
  const pad = opts.pad ?? DEFAULT_PAD;
  for (const p of (opts.fast ? [pad] : [pad, Math.min(pad, 8), Math.min(pad, 6), Math.min(pad, 4), Math.min(pad, 2)]).filter((v, i, a) => a.indexOf(v) === i)) {
    const r = routeOrthogonal(src, dst, obstacles, { ...opts, pad: p });
    if (r) return { points: r, routed: true };
  }
  return { points: stepRoute(src, dst, opts.stub ?? pad), routed: false };
}

export { countBends };
