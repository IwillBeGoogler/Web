import { EPS, dist, isHorizontalSide, pointAtT, polylineLength, sideVector, type Port, type Pt } from './geometry';

/** Proper crossings between a horizontal segment of `a` and a vertical segment of `b` (never at shared endpoints). */
export function hopPoints(a: Pt[], b: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < a.length; i++) {
    const h0 = a[i - 1];
    const h1 = a[i];
    if (Math.abs(h0.y - h1.y) > EPS) continue; // not horizontal
    for (let j = 1; j < b.length; j++) {
      const v0 = b[j - 1];
      const v1 = b[j];
      if (Math.abs(v0.x - v1.x) > EPS) continue; // not vertical
      const x = v0.x;
      const y = h0.y;
      const inH = x > Math.min(h0.x, h1.x) + EPS && x < Math.max(h0.x, h1.x) - EPS;
      const inV = y > Math.min(v0.y, v1.y) + EPS && y < Math.max(v0.y, v1.y) - EPS;
      if (inH && inV) out.push({ x, y });
    }
  }
  return out;
}

/** Line-jump positions per edge: the horizontal edge hops over the vertical one. */
export function computeHops(routes: Map<string, Pt[]>): Map<string, Pt[]> {
  const ids = [...routes.keys()];
  const out = new Map<string, Pt[]>();
  for (const a of ids)
    for (const b of ids) {
      if (a === b) continue;
      const pts = hopPoints(routes.get(a)!, routes.get(b)!);
      if (pts.length) out.set(a, [...(out.get(a) ?? []), ...pts]);
    }
  return out;
}

export interface PathOptions {
  /** corner radius (0 = sharp, like smoothstep with borderRadius 0) */
  radius?: number;
  /** points where horizontal segments should hop (small arcs) */
  hops?: Pt[];
  hopRadius?: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** SVG path for an orthogonal polyline with optional rounded corners and line jumps. */
export function polylineToPath(pts: Pt[], opts: PathOptions = {}): string {
  if (!pts.length) return '';
  const r = opts.radius ?? 0;
  const hr = opts.hopRadius ?? 5;
  const hops = opts.hops ?? [];
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const next = pts[i + 1];
    const prevLen = i > 1 ? dist(pts[i - 2], a) : Infinity;
    const len = dist(a, b);
    // start / end of the straight part of this segment after corner rounding
    const rs = i > 1 && r > 0 ? Math.min(r, prevLen / 2, len / 2) : 0;
    const re = next && r > 0 ? Math.min(r, len / 2, dist(b, next) / 2) : 0;
    const ux = len < EPS ? 0 : (b.x - a.x) / len;
    const uy = len < EPS ? 0 : (b.y - a.y) / len;
    const sx = a.x + ux * rs;
    const sy = a.y + uy * rs;
    const ex = b.x - ux * re;
    const ey = b.y - uy * re;
    if (rs > 0) d += ` L${f(sx)},${f(sy)}`; // (corner curve was emitted by the previous iteration)
    const horizontal = Math.abs(a.y - b.y) < EPS;
    if (horizontal && hops.length) {
      const here = hops
        .filter((h) => Math.abs(h.y - a.y) < EPS && h.x > Math.min(sx, ex) + hr + 1 && h.x < Math.max(sx, ex) - hr - 1)
        .sort((p, q) => (ux > 0 ? p.x - q.x : q.x - p.x));
      let last = -Infinity;
      for (const h of here) {
        if (Math.abs(h.x - last) < hr * 2 + 2) continue;
        last = h.x;
        d += ` L${f(h.x - ux * hr)},${f(a.y)} A${hr},${hr} 0 0 ${ux > 0 ? 1 : 0} ${f(h.x + ux * hr)},${f(a.y)}`;
      }
    }
    if (next && re > 0) {
      const nux = (next.x - b.x) / (dist(b, next) || 1);
      const nuy = (next.y - b.y) / (dist(b, next) || 1);
      d += ` L${f(ex)},${f(ey)} Q${f(b.x)},${f(b.y)} ${f(b.x + nux * re)},${f(b.y + nuy * re)}`;
    } else d += ` L${f(b.x)},${f(b.y)}`;
  }
  return d;
}

/** control-handle length of a curved segment: half the segment, never more than 120px (keeps arcs tight, no overshoot) */
export const curveHandle = (segLen: number): number => Math.min(segLen * 0.5, 120);

/**
 * Smooth cubic beziers between two ports. Tangents leave / arrive perpendicular to the port sides, interior waypoints
 * get a Catmull-Rom style tangent, and every handle is at most min(0.5 * segment, 120px) long so the curve cannot
 * overshoot into a loop or hook near an endpoint. Returns the path and sampled points.
 */
export function curvedRoute(src: Port, dst: Port, waypoints: Pt[] = [], offset = 0): { d: string; points: Pt[] } {
  const sv = sideVector(src.side);
  const dv = sideVector(dst.side);
  const l0 = dist(src.pt, dst.pt) || 1;
  const o = { x: (-(dst.pt.y - src.pt.y) / l0) * offset, y: ((dst.pt.x - src.pt.x) / l0) * offset };
  const s = { x: src.pt.x + o.x, y: src.pt.y + o.y };
  const t = { x: dst.pt.x + o.x, y: dst.pt.y + o.y };
  const P = [s, ...waypoints, t];
  const unit = (a: Pt, b: Pt): Pt => {
    const l = dist(a, b);
    return l < EPS ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  // direction of travel at every point: out of the source side, into the target side
  const dirs: Pt[] = P.map((_, i) => (i === 0 ? sv : i === P.length - 1 ? { x: -dv.x, y: -dv.y } : unit(P[i - 1], P[i + 1])));
  let d = `M${f(P[0].x)},${f(P[0].y)}`;
  const pts: Pt[] = [P[0]];
  for (let i = 0; i < P.length - 1; i++) {
    const p1 = P[i];
    const p2 = P[i + 1];
    const k = curveHandle(dist(p1, p2));
    const c1 = { x: p1.x + dirs[i].x * k, y: p1.y + dirs[i].y * k };
    const c2 = { x: p2.x - dirs[i + 1].x * k, y: p2.y - dirs[i + 1].y * k };
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
    for (let n = 1; n <= 12; n++) pts.push(cubic(p1, c1, c2, p2, n / 12));
  }
  return { d, points: pts };
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Label anchor: a point on the real path at fraction t, shifted perpendicular by `offset`. */
export function labelPoint(points: Pt[], t = 0.5, offset = 0): Pt {
  const { pt, angle } = pointAtT(points, t);
  return offset ? { x: pt.x - Math.sin(angle) * offset, y: pt.y + Math.cos(angle) * offset } : pt;
}

/** labels never sit closer than this to a bend (px) */
export const LABEL_BEND_CLEARANCE = 8;

/** index i of the longest segment points[i] -> points[i+1] (first one wins a tie) */
export function longestSegment(points: Pt[]): number {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i], points[i + 1]);
    if (l > bestLen + EPS) {
      bestLen = l;
      best = i;
    }
  }
  return best;
}

/**
 * Where an edge label goes. No stored position (`t` undefined): the middle of the LONGEST straight segment.
 * A stored position is kept, but pushed >= LABEL_BEND_CLEARANCE away from the bends of its segment
 * (a segment too short for that gets its middle). `offset` shifts perpendicular to the segment.
 */
export function labelAnchor(points: Pt[], t?: number, offset = 0): Pt {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  let seg: number;
  let at: number; // distance along the segment
  if (t === undefined) {
    seg = longestSegment(points);
    at = dist(points[seg], points[seg + 1]) / 2;
  } else {
    const total = polylineLength(points);
    let want = Math.max(0, Math.min(1, t)) * total;
    seg = points.length - 2;
    at = dist(points[seg], points[seg + 1]);
    for (let i = 0; i < points.length - 1; i++) {
      const l = dist(points[i], points[i + 1]);
      if (want <= l || i === points.length - 2) {
        seg = i;
        at = Math.min(want, l);
        break;
      }
      want -= l;
    }
  }
  const a = points[seg];
  const b = points[seg + 1];
  const len = dist(a, b);
  if (len > EPS) {
    const lo = len >= 2 * LABEL_BEND_CLEARANCE ? LABEL_BEND_CLEARANCE : len / 2;
    const hi = len >= 2 * LABEL_BEND_CLEARANCE ? len - LABEL_BEND_CLEARANCE : len / 2;
    at = Math.max(lo, Math.min(hi, at));
  }
  const k = len < EPS ? 0 : at / len;
  const pt = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  if (!offset) return pt;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return { x: pt.x - Math.sin(angle) * offset, y: pt.y + Math.cos(angle) * offset };
}

export { isHorizontalSide };
