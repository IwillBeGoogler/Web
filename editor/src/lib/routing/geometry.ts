export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Port {
  pt: Pt;
  side: Side;
}

export const EPS = 1e-6;
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
export const center = (r: Rect): Pt => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const inflate = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 });
export const sideVector = (s: Side): Pt => (s === 'top' ? { x: 0, y: -1 } : s === 'bottom' ? { x: 0, y: 1 } : s === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 });
export const opposite = (s: Side): Side => (s === 'top' ? 'bottom' : s === 'bottom' ? 'top' : s === 'left' ? 'right' : 'left');
export const isHorizontalSide = (s: Side) => s === 'left' || s === 'right';
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/** Which sides should an edge between two rects attach to? Horizontal separation wins when it dominates. */
export function nearestSides(a: Rect, b: Rect): [Side, Side] {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const nx = Math.abs(dx) / ((a.width + b.width) / 2 || 1);
  const ny = Math.abs(dy) / ((a.height + b.height) / 2 || 1);
  // side by side (no horizontal overlap): flows read left to right, so horizontal wins a near tie
  const apart = a.x + a.width <= b.x || b.x + b.width <= a.x;
  if (nx * (apart ? 1.25 : 1) >= ny) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Point on a rect side; t is the position along the side (0..1, 0.5 = middle). */
export function portPoint(r: Rect, side: Side, t = 0.5): Pt {
  switch (side) {
    case 'top': return { x: r.x + r.width * t, y: r.y };
    case 'bottom': return { x: r.x + r.width * t, y: r.y + r.height };
    case 'left': return { x: r.x, y: r.y + r.height * t };
    default: return { x: r.x + r.width, y: r.y + r.height * t };
  }
}

/** Does the open segment ab pass through the INTERIOR of r (touching the border is allowed)? */
export function segmentIntersectsRect(a: Pt, b: Pt, r: Rect): boolean {
  const minX = r.x + EPS;
  const maxX = r.x + r.width - EPS;
  const minY = r.y + EPS;
  const maxY = r.y + r.height - EPS;
  if (minX >= maxX || minY >= maxY) return false;
  // Liang-Barsky clipping against the (slightly shrunk) rect
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > EPS;
}

export function polylineIntersectsRects(points: Pt[], rects: Rect[]): boolean {
  for (let i = 1; i < points.length; i++) for (const r of rects) if (segmentIntersectsRect(points[i - 1], points[i], r)) return true;
  return false;
}

/** Remove duplicate and collinear points. */
export function simplifyPolyline(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || !same(out[out.length - 1], p)) out.push(p);
  const res: Pt[] = [];
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (i === 0 || i === out.length - 1) {
      res.push(p);
      continue;
    }
    const a = res[res.length - 1];
    const b = out[i + 1];
    const collinear = (Math.abs(a.x - p.x) < EPS && Math.abs(p.x - b.x) < EPS) || (Math.abs(a.y - p.y) < EPS && Math.abs(p.y - b.y) < EPS);
    if (!collinear) res.push(p);
  }
  return res;
}

export const polylineLength = (pts: Pt[]): number => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/** Point at fraction t (0..1) of the polyline length, plus the local direction angle (radians). */
export function pointAtT(pts: Pt[], t: number): { pt: Pt; angle: number } {
  if (pts.length === 0) return { pt: { x: 0, y: 0 }, angle: 0 };
  if (pts.length === 1) return { pt: pts[0], angle: 0 };
  const total = polylineLength(pts);
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (want <= len || i === pts.length - 1) {
      const k = len < EPS ? 0 : Math.min(1, want / len);
      return { pt: { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }, angle: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) };
    }
    want -= len;
  }
  return { pt: pts[pts.length - 1], angle: 0 };
}

/** Fraction (0..1) of the point on the polyline closest to p. */
export function nearestT(pts: Pt[], p: Pt): number {
  const total = polylineLength(pts);
  if (total < EPS) return 0.5;
  let best = { d: Infinity, at: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = dist(a, b);
    const k = len < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const d = dist(p, q);
    if (d < best.d) best = { d, at: acc + len * k };
    acc += len;
  }
  return best.at / total;
}

/** Make consecutive points axis-aligned by inserting corner points where needed. */
export function orthogonalize(pts: Pt[], firstHorizontal?: boolean): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [pts[0]];
  let horizontal = firstHorizontal;
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) {
      const h = horizontal ?? Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      out.push(h ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      horizontal = !h;
    } else {
      horizontal = Math.abs(a.y - b.y) < EPS ? false : true;
    }
    out.push(b);
  }
  return simplifyPolyline(out);
}

/** True when every consecutive pair shares an x or a y. */
export const isOrthogonal = (pts: Pt[]): boolean => pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 1e-6 || Math.abs(p.y - pts[i - 1].y) < 1e-6);
export const countBends = (pts: Pt[]): number => Math.max(0, simplifyPolyline(pts).length - 2);

/**
 * Remove visible "jogs": an interior orthogonal segment shorter than `min` is merged away by sliding its shorter
 * neighbour onto the other one (the end points never move). Segments touching an end point are left alone: the caller
 * fixes those by snapping the attach point (see ALIGN_SNAP in routing/index).
 */
export function removeShortSegments(points: Pt[], min = 10): Pt[] {
  let p = simplifyPolyline(points);
  for (let guard = 0; guard < 24; guard++) {
    let changed = false;
    const n = p.length;
    for (let i = 1; i + 2 <= n - 1 && !changed; i++) {
      if (dist(p[i], p[i + 1]) >= min - 1e-6) continue;
      if (i + 2 <= n - 2) {
        // slide the next segment onto the previous line
        const dx = p[i].x - p[i + 1].x;
        const dy = p[i].y - p[i + 1].y;
        p = [...p.slice(0, i + 1), { x: p[i].x, y: p[i].y }, { x: p[i + 2].x + dx, y: p[i + 2].y + dy }, ...p.slice(i + 3)];
        changed = true;
      } else if (i - 1 >= 1) {
        // slide the previous segment onto the next line
        const dx = p[i + 1].x - p[i].x;
        const dy = p[i + 1].y - p[i].y;
        p = [...p.slice(0, i - 1), { x: p[i - 1].x + dx, y: p[i - 1].y + dy }, { x: p[i + 1].x, y: p[i + 1].y }, ...p.slice(i + 2)];
        changed = true;
      }
    }
    if (!changed) break;
    p = simplifyPolyline(p);
  }
  return p;
}

/** shortest allowed first / last orthogonal segment (px): room for the arrowhead plus a visible straight run */
export const MIN_END_SEGMENT = 16;

function extendEnd(p: Pt[], min: number): Pt[] {
  const n = p.length;
  if (n < 4) return p; // need the segment before the corner to absorb the shift
  const a = p[n - 2];
  const b = p[n - 1];
  const len = dist(a, b);
  if (len >= min - EPS || len < EPS) return p;
  const shift = min - len;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const c = p[n - 3];
  const d = p[n - 4];
  const nc = { x: c.x - ux * shift, y: c.y - uy * shift };
  if ((nc.x - d.x) * (c.x - d.x) + (nc.y - d.y) * (c.y - d.y) <= EPS) return p; // would fold the previous segment over
  return simplifyPolyline([...p.slice(0, n - 3), nc, { x: a.x - ux * shift, y: a.y - uy * shift }, b]);
}

/**
 * No tiny hooks at the ends: the first and last orthogonal segment are at least `min` long (the corner next to the
 * end slides away from it, the end points never move). Paths without room (fewer than 4 points) are left alone.
 */
export function ensureEndSegments(points: Pt[], min = MIN_END_SEGMENT): Pt[] {
  const p = simplifyPolyline(points);
  const fixedEnd = extendEnd(p, min);
  return extendEnd([...fixedEnd].reverse(), min).reverse();
}
