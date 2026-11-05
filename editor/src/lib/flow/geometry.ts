export interface Pt { x: number; y: number }
export type FlowSpeed = 'slow' | 'normal' | 'fast';
export type FlowStyle = 'dot' | 'dash' | 'pulse';
export type FlowDir = 'forward' | 'reverse' | 'both';

/** px per second */
export const SPEED_PX: Record<FlowSpeed, number> = { slow: 36, normal: 80, fast: 160 };
export const DEFAULT_DENSITY = 1.2; // packets per 100px

export interface Measured { points: Pt[]; lens: number[]; total: number }

/** cumulative length table of a polyline (computed once per route, then reused every frame) */
export function measure(points: Pt[]): Measured {
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, lens, total: lens[lens.length - 1] ?? 0 };
}

/** point + heading (radians) at distance `d` along the polyline (clamped to its ends) */
export function pointAt(m: Measured, d: number): { x: number; y: number; angle: number } {
  const { points, lens, total } = m;
  if (points.length === 0) return { x: 0, y: 0, angle: 0 };
  if (points.length === 1 || total === 0) return { x: points[0].x, y: points[0].y, angle: 0 };
  const dd = Math.min(Math.max(d, 0), total);
  // binary search for the segment
  let lo = 1;
  let hi = lens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lens[mid] < dd) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1];
  const b = points[lo];
  const seg = lens[lo] - lens[lo - 1] || 1;
  const f = (dd - lens[lo - 1]) / seg;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

export const reversePoints = (pts: Pt[]): Pt[] => [...pts].reverse();

/** how many packets travel on a line of `length` px at `density` packets per 100px (at least one on any visible line) */
export function packetCount(length: number, density: number): number {
  if (length < 8) return 0;
  return Math.max(1, Math.round((length / 100) * density));
}

/**
 * Distances along the line of every packet at time `t` (seconds): evenly spaced, all advancing at `speed` px/s, wrapping at the end.
 * `phase` (0..1 of one spacing) lets neighbouring lines de-synchronise.
 */
export function packetDistances(length: number, count: number, t: number, speed: number, phase = 0): number[] {
  if (count <= 0 || length <= 0) return [];
  const gap = length / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i * gap + phase * gap + speed * t) % length;
    out.push(d < 0 ? d + length : d);
  }
  return out;
}

/** chevron positions for the reduced-motion (static) rendering: every `spacing` px, centred in each gap */
export function chevronSpots(m: Measured, spacing = 64): { x: number; y: number; angle: number }[] {
  if (m.total < 24) return [];
  const n = Math.max(1, Math.floor(m.total / spacing));
  const gap = m.total / n;
  return Array.from({ length: n }, (_, i) => pointAt(m, gap * (i + 0.5)));
}

/** one full lap takes length / speed seconds */
export const lapSeconds = (length: number, speed: number): number => (speed > 0 ? length / speed : Infinity);
