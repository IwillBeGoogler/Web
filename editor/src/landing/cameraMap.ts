/** Pure geometry for the hero scene: fitting the tilted architecture plane into its canvas. */
export const CAM_Z = 13;
export const FOV_DESKTOP = 40;
export const FOV_MOBILE = 52;

/** visible world size at depth 0 for a camera at `z` */
export function viewSize(fovDeg: number, z: number, aspect: number): { width: number; height: number } {
  const height = 2 * z * Math.tan((fovDeg * Math.PI) / 360);
  return { width: height * aspect, height };
}

export interface Box { left: number; top: number; width: number; height: number }

export interface TiltFit {
  /** hero group position (world units) that centres the projected bounds in the box */
  x: number;
  y: number;
  scale: number;
  /** projected extents of the fitted box, px */
  widthPx: number;
  heightPx: number;
  /** projected bounds in viewport px */
  bounds: { left: number; top: number; right: number; bottom: number };
}

/**
 * Free area for the 3D scene: the hero's visual box minus the headline column. Two-column mode (the rects overlap): everything to the
 * right of the copy (>= `gap` px away), vertically centred on the copy block. Stacked mode (copy above the visual): the visual
 * itself, kept `gap` px below the copy. Always inset by `pad`.
 */
export function sceneBox(visual: Box, copy: Box, o: { gap: number; pad: number; maxWidth?: number }): Box {
  const vr = visual.left + visual.width;
  const vb = visual.top + visual.height;
  const cr = copy.left + copy.width;
  const cb = copy.top + copy.height;
  const overlap = copy.left < vr && cr > visual.left && copy.top < vb && cb > visual.top;
  if (!overlap) {
    const top = cb <= visual.top + 0.5 ? Math.max(visual.top + o.pad, cb + o.gap) : visual.top + o.pad;
    const left = visual.left + o.pad;
    return { left, top, width: Math.max(1, vr - o.pad - left), height: Math.max(1, vb - o.pad - top) };
  }
  const left = cr + o.gap;
  const cy = copy.top + copy.height / 2;
  const half = Math.min(cy - visual.top, vb - cy) - o.pad;
  const free = Math.max(1, vr - o.pad - left);
  const width = Math.min(free, o.maxWidth ?? Infinity);
  return { left: left + (free - width) / 2, top: cy - Math.max(1, half), width, height: 2 * Math.max(1, half) };
}

/**
 * Fit a flat box (`w` x `h` world units, centred at the origin) that is tilted by `yaw` / `elev` (radians, the group uses rotation order
 * YXZ) into `box` (viewport px): real perspective projection of the 4 corners (incl. the near side growing), bisection on the scale,
 * then the position is solved so the projected bounds are centred in the box. Pure, so tests can check every size.
 */
export function fitTiltedBox(box: Box, vw: number, vh: number, fovDeg: number, camZ: number, w: number, h: number, yaw: number, elev: number, margin = 0.92): TiltFit {
  const unit = viewSize(fovDeg, camZ, vw / vh).height / vh; // world units per px at depth 0
  const cx = (box.left + box.width / 2 - vw / 2) * unit;
  const cy = -(box.top + box.height / 2 - vh / 2) * unit;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const bbox = (s: number, tx: number, ty: number) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of corners) {
      let x = (px * w * s) / 2;
      let y = (py * h * s) / 2;
      let z = 0;
      const y1 = y * Math.cos(elev) - z * Math.sin(elev);
      const z1 = y * Math.sin(elev) + z * Math.cos(elev);
      y = y1; z = z1;
      const x2 = x * Math.cos(yaw) + z * Math.sin(yaw);
      const z2 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      x = x2; z = z2;
      const k = camZ / Math.max(0.05, camZ - z); // nearer = bigger (camera looks down -z from +camZ)
      minX = Math.min(minX, (x + tx) * k); maxX = Math.max(maxX, (x + tx) * k); minY = Math.min(minY, (y + ty) * k); maxY = Math.max(maxY, (y + ty) * k);
    }
    return { minX, maxX, minY, maxY };
  };
  const solve = (s: number) => {
    let tx = cx, ty = cy;
    for (let i = 0; i < 4; i++) {
      const b = bbox(s, tx, ty);
      tx += cx - (b.minX + b.maxX) / 2;
      ty += cy - (b.minY + b.maxY) / 2;
    }
    const b = bbox(s, tx, ty);
    return { tx, ty, wpx: (b.maxX - b.minX) / unit, hpx: (b.maxY - b.minY) / unit, b };
  };
  let lo = 0.0001;
  let hi = 10;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = solve(mid);
    if (p.wpx <= box.width * margin && p.hpx <= box.height * margin) lo = mid;
    else hi = mid;
  }
  const p = solve(lo);
  return {
    x: p.tx, y: p.ty, scale: lo, widthPx: p.wpx, heightPx: p.hpx,
    bounds: { left: vw / 2 + p.b.minX / unit, right: vw / 2 + p.b.maxX / unit, top: vh / 2 - p.b.maxY / unit, bottom: vh / 2 - p.b.minY / unit },
  };
}
