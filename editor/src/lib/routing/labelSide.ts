import type { Pt } from './geometry';

export interface LabelPlacement {
  /** which side of the line the chip sits on; 'center' = on the line */
  anchor: 'center' | 'left' | 'right';
  vertical: boolean;
}

/** Is `pt` on a vertical run of the polyline? (tolerance in px) */
export function onVerticalSegment(points: Pt[], pt: Pt, tol = 1.5): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) > tol) continue;
    if (Math.abs(pt.x - a.x) > tol) continue;
    if (pt.y >= Math.min(a.y, b.y) - tol && pt.y <= Math.max(a.y, b.y) + tol) return true;
  }
  return false;
}

/**
 * Where to put a label chip. The default ('auto') and 'on' centre it on the line (the chip's background knocks the line
 * out behind the text); 'left'/'right' put it beside a vertical segment.
 */
export function labelPlacement(points: Pt[], pt: Pt, side: 'auto' | 'on' | 'left' | 'right' = 'auto'): LabelPlacement {
  const vertical = onVerticalSegment(points, pt);
  if (!vertical || side === 'auto' || side === 'on') return { anchor: 'center', vertical };
  return { anchor: side, vertical };
}
