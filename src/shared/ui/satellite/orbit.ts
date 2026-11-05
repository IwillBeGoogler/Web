/** Length of one flyby. */
export const FLYBY_SECONDS = 3;
/** One flyby every this many seconds, start to start. */
export const FLYBY_EVERY = 30;

type V = { x: number; y: number; z: number };

/** Progress (0–1) along the straight line from → to where it comes nearest the origin (the camera). */
export const closestT = (from: V, to: V): number => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const len2 = d.x ** 2 + d.y ** 2 + d.z ** 2;
  if (!len2) return 0;
  const t = -(from.x * d.x + from.y * d.y + from.z * d.z) / len2;
  return Math.min(1, Math.max(0, t));
};

/** A circular orbit: radius, lap time (negative = retrograde), tilt off the horizon arc, node angle, start phase. */
export type Orbit = { r: number; period: number; tilt: number; node: number; phase: number; size: number };

/** Background constellation: low, medium and inclined orbits so the satellites cross the sky on different paths. */
export const ORBITS: Orbit[] = [
  { r: 11.5, period: 40, tilt: 0.3, node: -0.4, phase: 3.99, size: 0.24 },
  { r: 12.5, period: -55, tilt: 0.6, node: 0.4, phase: 3.52, size: 0.26 },
  { r: 11.5, period: 70, tilt: 0.6, node: 0, phase: 0.8, size: 0.22 },
  { r: 13.5, period: -48, tilt: 0.6, node: -0.4, phase: 3.24, size: 0.28 },
  { r: 14.5, period: 85, tilt: 0.3, node: 0.4, phase: 5.08, size: 0.28 },
  { r: 12.5, period: 62, tilt: 0.45, node: -0.2, phase: 3.9, size: 0.24 },
  { r: 13.0, period: -75, tilt: 0.3, node: 0.2, phase: 3.79, size: 0.26 },
];

/**
 * Point on an orbit at time `t` (seconds), relative to the planet centre, in a frame where `up`
 * points from the centre over the visible horizon. tilt 0 arcs straight over the horizon;
 * larger tilts swing the plane toward or away from the viewer.
 */
export const orbitPoint = (o: Orbit, t: number, up: V): V => {
  const th = o.phase + (2 * Math.PI * t) / o.period;
  // in-plane axes: a horizontal axis turned by `node` round `up`, and `up` tipped by `tilt` round it
  const cn = Math.cos(o.node);
  const sn = Math.sin(o.node);
  const len = Math.hypot(up.x, up.y, up.z) || 1;
  const u = { x: up.x / len, y: up.y / len, z: up.z / len };
  // horizontal axis perpendicular to up: start from x, remove its up component, then spin by node
  const hx0 = { x: 1 - u.x * u.x, y: -u.x * u.y, z: -u.x * u.z };
  const hl = Math.hypot(hx0.x, hx0.y, hx0.z) || 1;
  const h0 = { x: hx0.x / hl, y: hx0.y / hl, z: hx0.z / hl };
  const s0 = { x: u.y * h0.z - u.z * h0.y, y: u.z * h0.x - u.x * h0.z, z: u.x * h0.y - u.y * h0.x };
  const a = { x: cn * h0.x + sn * s0.x, y: cn * h0.y + sn * s0.y, z: cn * h0.z + sn * s0.z };
  const side = { x: u.y * a.z - u.z * a.y, y: u.z * a.x - u.x * a.z, z: u.x * a.y - u.y * a.x };
  const ct = Math.cos(o.tilt);
  const st = Math.sin(o.tilt);
  const b = { x: ct * u.x + st * side.x, y: ct * u.y + st * side.y, z: ct * u.z + st * side.z };
  const c = Math.cos(th) * o.r;
  const s = Math.sin(th) * o.r;
  return { x: c * a.x + s * b.x, y: c * a.y + s * b.y, z: c * a.z + s * b.z };
};
