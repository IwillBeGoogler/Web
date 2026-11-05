import type { Arrows, DiagramEdge, DiagramNode, MarkerKind } from '../types';
import { junctionEnds } from './junction';
import { dist, type Pt } from './routing/geometry';
import { isErMarker } from './er/cardinality';

export type ArrowSize = 'S' | 'M' | 'L';
/** arrowhead length in px at the reference stroke width */
export const ARROW_BASE: Record<ArrowSize, number> = { S: 6, M: 8, L: 11 };
export const REF_STROKE = 1.5;
const r1 = (n: number) => Math.round(n * 100) / 100;

/** Arrowhead box: length along the line, width across it. ~8px long at stroke 1.5 (M); scales with the stroke width. */
export function arrowMetrics(strokeWidth: number, size: ArrowSize = 'M'): { length: number; width: number } {
  const k = Math.min(2.5, Math.max(0.75, strokeWidth / REF_STROKE));
  const length = r1(ARROW_BASE[size] * k);
  return { length, width: r1(length * 0.75) };
}

/**
 * Trim `startCut` px off the start and `endCut` px off the end of a polyline (walks across short segments), so the
 * visible line stops at the arrowhead base while the arrow tip stays on the attach point. Never inverts the line.
 */
export function shortenEnds(points: Pt[], startCut: number, endCut: number): Pt[] {
  if (points.length < 2 || (startCut <= 0 && endCut <= 0)) return points;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  const room = Math.max(0, total - 1); // keep >= 1px of line
  const want = Math.max(0, startCut) + Math.max(0, endCut);
  const k = want > room && want > 0 ? room / want : 1;
  let out = [...points];
  const trimEnd = (cut: number) => {
    let left = cut;
    while (left > 1e-9 && out.length > 2) {
      const l = dist(out[out.length - 2], out[out.length - 1]);
      if (l > left) break;
      left -= l;
      out = out.slice(0, -1);
    }
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const l = dist(a, b) || 1;
    const c = Math.min(left, l);
    out = [...out.slice(0, -1), { x: r1(b.x - ((b.x - a.x) / l) * c), y: r1(b.y - ((b.y - a.y) / l) * c) }];
  };
  const rev = (p: Pt[]) => [...p].reverse();
  if (endCut > 0) trimEnd(endCut * k);
  if (startCut > 0) {
    out = rev(out);
    trimEnd(startCut * k);
    out = rev(out);
  }
  return out;
}

/** Effective arrowheads of an edge: its own markers, else the `arrows` setting; never at a junction. */
export function resolveMarkers(nodes: DiagramNode[], e: DiagramEdge, arrows: Arrows): { start: MarkerKind; end: MarkerKind } {
  const jn = junctionEnds(nodes, e);
  return {
    start: jn.noStart ? 'none' : e.data?.startMarker ?? (arrows === 'start' || arrows === 'both' ? 'arrow' : 'none'),
    end: jn.noEnd ? 'none' : e.data?.endMarker ?? (arrows === 'end' || arrows === 'both' ? 'arrow' : 'none'),
  };
}

/** crow's-foot markers need a longer, wider box than arrowheads (circle + bar + feet) */
export const ER_MARKER_BOX = { length: 22, width: 14 };
/** marker box for a kind: ER kinds have their own fixed size, others follow the stroke-scaled arrow metrics */
export function markerBox(kind: MarkerKind, am: { length: number; width: number }): { length: number; width: number } {
  if (isErMarker(kind)) return ER_MARKER_BOX;
  if (kind === 'hollowTriangle') return { length: Math.max(12, am.length * 1.5), width: Math.max(10, am.width * 1.5) };
  if (kind === 'filledDiamond' || kind === 'hollowDiamond') return { length: Math.max(16, am.length * 2), width: Math.max(9, am.width * 1.25) };
  return am;
}
