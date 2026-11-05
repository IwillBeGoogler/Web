import { EPS, isHorizontalSide, orthogonalize, simplifyPolyline, type Port, type Pt } from './geometry';

/** Midpoint handle of every segment (for dragging whole orthogonal segments or inserting waypoints). */
export function segmentMidpoints(points: Pt[]): { index: number; pt: Pt; horizontal: boolean }[] {
  return points.slice(1).map((b, i) => {
    const a = points[i];
    return { index: i, pt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, horizontal: Math.abs(a.y - b.y) < EPS };
  });
}

/**
 * Drag one segment of an orthogonal polyline perpendicular to its direction, keeping every corner a right angle.
 * Dragging a segment that touches an endpoint inserts a connector so the endpoint itself never moves.
 */
export function dragSegment(points: Pt[], index: number, delta: Pt): Pt[] {
  if (index < 0 || index >= points.length - 1) return points;
  const a = points[index];
  const b = points[index + 1];
  const horizontal = Math.abs(a.y - b.y) < EPS;
  const d = horizontal ? { x: 0, y: delta.y } : { x: delta.x, y: 0 };
  const a2 = { x: a.x + d.x, y: a.y + d.y };
  const b2 = { x: b.x + d.x, y: b.y + d.y };
  const out: Pt[] = [...points.slice(0, index)];
  if (index === 0) out.push(a); // keep the real start, then step sideways
  out.push(a2, b2);
  if (index + 1 === points.length - 1) out.push(b);
  out.push(...points.slice(index + 2));
  return simplifyPolyline(out);
}

/** Interior bend points of a route (the part stored as manual waypoints). */
export const interiorPoints = (points: Pt[]): Pt[] => points.slice(1, -1);

/** Rebuild an orthogonal route from stored waypoints; the first leg leaves along the source side. */
export function orthogonalFromWaypoints(src: Port, dst: Port, waypoints: Pt[]): Pt[] {
  return orthogonalize([src.pt, ...waypoints, dst.pt], isHorizontalSide(src.side));
}

export function addWaypoint(wps: Pt[], index: number, pt: Pt): Pt[] {
  const i = Math.max(0, Math.min(wps.length, index));
  return [...wps.slice(0, i), pt, ...wps.slice(i)];
}
export const removeWaypoint = (wps: Pt[], i: number): Pt[] => wps.filter((_, k) => k !== i);
export const moveWaypoint = (wps: Pt[], i: number, pt: Pt): Pt[] => wps.map((w, k) => (k === i ? pt : w));

/** Snap to the grid and to alignment with other points (within `tol`). */
export function snapWaypoint(pt: Pt, opts: { grid?: number; align?: Pt[]; tol?: number } = {}): Pt {
  const tol = opts.tol ?? 6;
  let { x, y } = pt;
  let sx = false;
  let sy = false;
  for (const a of opts.align ?? []) {
    if (!sx && Math.abs(a.x - x) <= tol) (x = a.x), (sx = true);
    if (!sy && Math.abs(a.y - y) <= tol) (y = a.y), (sy = true);
  }
  if (opts.grid) {
    if (!sx) x = Math.round(x / opts.grid) * opts.grid;
    if (!sy) y = Math.round(y / opts.grid) * opts.grid;
  }
  return { x, y };
}

/** Move manual waypoints with their nodes: translate proportionally between the old and new endpoint positions. */
export function followEndpoints(wps: Pt[], oldSrc: Pt, oldDst: Pt, newSrc: Pt, newDst: Pt): Pt[] {
  const odx = oldDst.x - oldSrc.x;
  const ody = oldDst.y - oldSrc.y;
  const ndx = newDst.x - newSrc.x;
  const ndy = newDst.y - newSrc.y;
  return wps.map((w) => {
    const tx = Math.abs(odx) < EPS ? 0 : (w.x - oldSrc.x) / odx;
    const ty = Math.abs(ody) < EPS ? 0 : (w.y - oldSrc.y) / ody;
    return { x: newSrc.x + (Math.abs(odx) < EPS ? w.x - oldSrc.x : tx * ndx), y: newSrc.y + (Math.abs(ody) < EPS ? w.y - oldSrc.y : ty * ndy) };
  });
}
