import { EPS, segmentIntersectsRect, type Pt, type Rect } from './geometry';
import { RectGrid } from './spatial';

/** Minimum gap (px) between parallel tracks of different edges. */
export const MIN_TRACK_GAP = 10;
/** A moved segment never leaves a neighbouring segment shorter than this (that would be a visible jog). */
const MIN_NEIGHBOUR = 10;
/** Shared stretches shorter than this are not worth bundling / separating (corner touches). */
const MIN_OVERLAP = 2;

export interface TrackEdge {
  id: string;
  points: Pt[];
  /** edge style preset; edges with the same (defined) preset may share a track */
  preset?: string;
  /** allowed range of the port point's coordinate ALONG its node side (lets an end segment slide along the side) */
  srcSpan?: [number, number];
  dstSpan?: [number, number];
  /** an end leg never gets shorter than this when a neighbouring segment moves (crow's-foot ends need room) */
  minEnd?: number;
}

interface Seg {
  /** index of the first point */
  k: number;
  horizontal: boolean;
  /** fixed coordinate (y for horizontal, x for vertical) */
  c: number;
  lo: number;
  hi: number;
}

const segsOf = (pts: Pt[]): Seg[] => {
  const out: Seg[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) out.push({ k, horizontal: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) out.push({ k, horizontal: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
  }
  return out;
};

/** which end of a route (if any) a segment touches */
const endOf = (pts: Pt[], s: Seg): 'src' | 'dst' | null => (pts.length < 3 ? null : s.k === 0 ? 'src' : s.k === pts.length - 2 ? 'dst' : null);
const spanOf = (e: TrackEdge, s: Seg): [number, number] | undefined => { const end = endOf(e.points, s); return end === 'src' ? e.srcSpan : end === 'dst' ? e.dstSpan : undefined; };
const movable = (e: TrackEdge, s: Seg) => (s.k >= 1 && s.k + 1 <= e.points.length - 2) || !!spanOf(e, s);

/** Move the interior segment `s` of `pts` to coordinate `to`; null when it would leave a stub / jog, reverse a neighbour or hit an obstacle. */
function moved(e: TrackEdge, s: Seg, to: number, obstacles: Rect[]): Pt[] | null {
  const pts = e.points;
  const span = spanOf(e, s);
  if (span && (to < span[0] - EPS || to > span[1] + EPS)) return null;
  const next = pts.map((p) => ({ ...p }));
  const axis = s.horizontal ? 'y' : 'x';
  next[s.k][axis] = to;
  next[s.k + 1][axis] = to;
  for (const n of [s.k - 1, s.k + 1]) {
    if (n < 0 || n + 1 > pts.length - 1) continue;
    const before = pts[n + 1][axis] - pts[n][axis];
    const after = next[n + 1][axis] - next[n][axis];
    const isEnd = n === 0 || n + 1 === pts.length - 1;
    if (Math.abs(after) < Math.max(MIN_NEIGHBOUR, isEnd ? e.minEnd ?? 0 : 0) || Math.sign(after) !== Math.sign(before)) return null;
  }
  for (let i = Math.max(0, s.k - 1); i <= Math.min(pts.length - 2, s.k + 1); i++) for (const r of obstacles) if (segmentIntersectsRect(next[i], next[i + 1], r)) return null;
  return next;
}

/** How many other edges' parallel, overlapping segments (closer than minGap, not a legal bundle) the segment `k` of `pts` would clash with. */
function conflictsOf(e: TrackEdge, pts: Pt[], k: number, all: Iterable<TrackEdge>, minGap: number): number {
  const mine = segsOf(pts).find((x) => x.k === k);
  if (!mine) return 0;
  let n = 0;
  for (const o of all) {
    if (o.id === e.id) continue;
    for (const so of segsOf(o.points)) {
      if (so.horizontal !== mine.horizontal) continue;
      const d = Math.abs(so.c - mine.c);
      if (d >= minGap || (d < EPS && !!e.preset && e.preset === o.preset)) continue;
      if (Math.min(so.hi, mine.hi) - Math.max(so.lo, mine.lo) > MIN_OVERLAP) n++;
    }
  }
  return n;
}

/**
 * Track separation for orthogonal routes (mutates `edges[i].points`, returns true when anything moved):
 *  - parallel, overlapping segments of edges with the same defined preset are merged onto one track (a bundle);
 *  - otherwise parallel segments closer than `minGap` (including exactly overlapping ones) are pushed apart to `minGap`.
 * Only interior segments move (end segments are pinned to their ports); a move that would create a jog, flip a neighbour
 * or cross an obstacle is skipped.
 */
export function separateTracks(edges: TrackEdge[], obstaclesFor: (id: string) => Rect[], minGap = MIN_TRACK_GAP, passes = 6, only?: Set<string>): boolean {
  let any = false;
  const bb = (pts: Pt[]) => pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    const boxes = edges.map((e) => bb(e.points));
    // candidate pairs through a bucket grid over the (gap-inflated) bounding boxes; with `only`, a pair needs at least one edge in it
    const CELL = 240;
    const cells = new Map<string, number[]>();
    edges.forEach((_, i) => {
      const b = boxes[i];
      for (let cx = Math.floor((b.x0 - minGap) / CELL); cx <= Math.floor((b.x1 + minGap) / CELL); cx++)
        for (let cy = Math.floor((b.y0 - minGap) / CELL); cy <= Math.floor((b.y1 + minGap) / CELL); cy++) {
          const k = `${cx},${cy}`;
          const l = cells.get(k);
          if (l) l.push(i); else cells.set(k, [i]);
        }
    });
    // conflicts only matter with edges nearby: query the same boxes instead of scanning every edge
    const boxGrid = new RectGrid<number>(CELL);
    edges.forEach((_, i) => boxGrid.insert(i, { x: boxes[i].x0 - minGap, y: boxes[i].y0 - minGap, width: boxes[i].x1 - boxes[i].x0 + 2 * minGap, height: boxes[i].y1 - boxes[i].y0 + 2 * minGap }));
    const neighbours = (pts: Pt[]): TrackEdge[] => {
      const b = bb(pts);
      return boxGrid.query({ x: b.x0 - minGap, y: b.y0 - minGap, width: b.x1 - b.x0 + 2 * minGap, height: b.y1 - b.y0 + 2 * minGap }).map((i) => edges[i]);
    };
    const pairs = new Set<number>();
    for (const l of cells.values()) for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      if (only && !only.has(edges[l[x]].id) && !only.has(edges[l[y]].id)) continue;
      pairs.add(l[x] * edges.length + l[y]);
    }
    for (const key of [...pairs].sort((a, b) => a - b)) {
        const i = Math.floor(key / edges.length);
        const j = key % edges.length;
        const A = edges[i];
        const B = edges[j];
        const ba = boxes[i];
        const bj = boxes[j];
        if (ba.x1 + minGap < bj.x0 || bj.x1 + minGap < ba.x0 || ba.y1 + minGap < bj.y0 || bj.y1 + minGap < ba.y0) continue;
        const bundle = !!A.preset && A.preset === B.preset;
        let did = false;
        for (const sa of segsOf(A.points)) {
          for (const sb of segsOf(B.points)) {
            if (did) break;
            if (sa.horizontal !== sb.horizontal) continue;
            const d = Math.abs(sa.c - sb.c);
            if (d >= minGap || (d < EPS && bundle)) continue;
            if (Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo) <= MIN_OVERLAP) continue;
            const ma = movable(A, sa);
            const mb = movable(B, sb);
            if (!ma && !mb) continue;
            // 1. bundle: snap the movable one onto the other's track
            const tryBundle = () => {
              if (!bundle) return false;
              if (ma) { const n = moved(A, sa, sb.c, obstaclesFor(A.id)); if (n) { A.points = n; return true; } }
              if (mb) { const n = moved(B, sb, sa.c, obstaclesFor(B.id)); if (n) { B.points = n; return true; } }
              return false;
            };
            // 2. separate: push the movable one away; try 1x..4x the gap on both sides and take the spot with the fewest new conflicts
            const trySeparate = () => {
              const order: [TrackEdge, Seg, Seg, boolean][] = [[B, sb, sa, mb], [A, sa, sb, ma]];
              for (const [E, mine, other, can] of order) {
                if (!can) continue;
                const dir = Math.sign(mine.c - other.c) || 1;
                let best: { pts: Pt[]; score: number } | null = null;
                for (const m of [1, 2, 3, 4]) for (const sign of [dir, -dir]) {
                  const to = other.c + sign * minGap * m;
                  const n = moved(E, mine, to, obstaclesFor(E.id));
                  if (!n) continue;
                  if (conflictsOf(E, n, mine.k, neighbours(n), 2.5)) continue; // never land on top of another edge's track
                  const score = conflictsOf(E, n, mine.k, neighbours(n), minGap) * 1000 + Math.abs(to - mine.c);
                  if (!best || score < best.score) best = { pts: n, score };
                }
                if (best) { E.points = best.pts; return true; }
              }
              return false;
            };
            did = tryBundle() || trySeparate();
            if (did) { changed = true; any = true; }
          }
          if (did) break;
        }
        if (did) { boxes[i] = bb(A.points); boxes[j] = bb(B.points); }
    }
    if (!changed) break;
  }
  return any;
}

/** Segments of already routed same-preset edges, as preferred (cheaper) tracks for the next edge. */
export interface PreferredSeg { horizontal: boolean; c: number; lo: number; hi: number }
export const preferredSegs = (pts: Pt[]): PreferredSeg[] => segsOf(pts).map(({ horizontal, c, lo, hi }) => ({ horizontal, c, lo, hi }));
