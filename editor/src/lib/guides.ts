import type { Rect } from './tooltip';

export interface GuideLine {
  orientation: 'v' | 'h';
  /** x for vertical lines, y for horizontal lines */
  pos: number;
  from: number;
  to: number;
}
export interface Guides {
  /** offset to apply to the dragged rect so it snaps */
  dx: number;
  dy: number;
  lines: GuideLine[];
}

const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

/** Smart guides: align left/centre/right and top/middle/bottom of the dragged rect to other nodes within `threshold`. */
export function computeGuides(dragged: Rect, others: Rect[], threshold = 5): Guides {
  let bestX: { d: number; pos: number; other: Rect } | null = null;
  let bestY: { d: number; pos: number; other: Rect } | null = null;
  for (const o of others) {
    for (const a of xs(dragged)) for (const b of xs(o)) {
      const d = b - a;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, pos: b, other: o };
    }
    for (const a of ys(dragged)) for (const b of ys(o)) {
      const d = b - a;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, pos: b, other: o };
    }
  }
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  const snapped: Rect = { ...dragged, x: dragged.x + dx, y: dragged.y + dy };
  const lines: GuideLine[] = [];
  if (bestX) lines.push({ orientation: 'v', pos: bestX.pos, from: Math.min(snapped.y, bestX.other.y), to: Math.max(snapped.y + snapped.height, bestX.other.y + bestX.other.height) });
  if (bestY) lines.push({ orientation: 'h', pos: bestY.pos, from: Math.min(snapped.x, bestY.other.x), to: Math.max(snapped.x + snapped.width, bestY.other.x + bestY.other.width) });
  return { dx, dy, lines };
}
