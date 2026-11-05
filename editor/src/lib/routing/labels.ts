import { segmentIntersectsRect, dist, type Pt, type Rect } from './geometry';
import { LABEL_BEND_CLEARANCE, labelAnchor, longestSegment } from './path';

export interface LabelReq {
  id: string;
  points: Pt[];
  text: string;
  /** stored position along the path (user dragged it); undefined = automatic */
  t?: number;
  offset: number;
}

/** Approximate chip box (the chip wraps after ~180px, padded 6px, ~20px high). */
export function labelBox(c: Pt, text: string): Rect {
  const w = Math.min(180, text.length * 7 + 14);
  const h = 20;
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const FRACTIONS = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];

/**
 * Automatic label positions: the middle of the LONGEST straight segment, but if the chip would sit on a node, a group
 * title, another edge or another label it slides along that segment (then tries the next longest segments). Positions stay
 * >= LABEL_BEND_CLEARANCE from every bend. Stored positions (`t`) are kept as they are. When nothing is free the
 * middle of the longest segment wins.
 */
export function placeLabels(reqs: LabelReq[], obstacles: Rect[], lines: Map<string, Pt[]>): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const placed: Rect[] = [];
  // user-placed labels first: they are fixed, the automatic ones route around them
  for (const r of reqs) {
    if (r.t === undefined) continue;
    const p = labelAnchor(r.points, r.t, r.offset);
    out.set(r.id, p);
    placed.push(labelBox(p, r.text));
  }
  for (const r of reqs) {
    if (r.t !== undefined) continue;
    const fallback = labelAnchor(r.points, undefined, r.offset);
    const longest = longestSegment(r.points);
    const order = r.points.slice(0, -1).map((_, i) => i).sort((a, b) => (a === longest ? -1 : b === longest ? 1 : dist(r.points[b], r.points[b + 1]) - dist(r.points[a], r.points[a + 1])));
    let chosen: Pt | undefined;
    // pass 1: clear of everything; pass 2: other lines may run behind the chip (its background knocks them out)
    for (const strict of [true, false]) {
    if (chosen) break;
    for (const i of order) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const len = dist(a, b);
      if (len < 2 * LABEL_BEND_CLEARANCE) continue;
      const horizontal = Math.abs(b.y - a.y) < Math.abs(b.x - a.x);
      // on the line first (its background knocks the line out); when that collides, BESIDE the segment (above / below, or left / right)
      // a segment too short for chip + arrowhead + breathing room: the chip goes beside it (above / left first) instead of on it
      const tight = len < labelBox({ x: 0, y: 0 }, r.text).width + 4 * LABEL_BEND_CLEARANCE + 24;
      for (const side of tight ? [-1, 1, 0] : [0, -1, 1]) {
      if (chosen) break;
      for (const f of FRACTIONS) {
        const at = Math.max(LABEL_BEND_CLEARANCE, Math.min(len - LABEL_BEND_CLEARANCE, len * f));
        const p = { x: a.x + ((b.x - a.x) * at) / len, y: a.y + ((b.y - a.y) * at) / len };
        const q0 = r.offset ? { x: p.x - ((b.y - a.y) / len) * r.offset, y: p.y + ((b.x - a.x) / len) * r.offset } : p;
        const w = labelBox(q0, r.text).width;
        const beside = side * (horizontal ? 18 : w / 2 + 8);
        const q = side ? (horizontal ? { x: q0.x, y: q0.y + beside } : { x: q0.x + beside, y: q0.y }) : q0;
        const box = labelBox(q, r.text);
        if (obstacles.some((o) => overlaps(box, o)) || placed.some((o) => overlaps(box, o))) continue;
        let crossed = false;
        for (const [id, pts] of strict ? lines : []) {
          if (id === r.id && !side) continue;
          for (let k = 1; k < pts.length && !crossed; k++) if (segmentIntersectsRect(pts[k - 1], pts[k], box)) crossed = true;
          if (crossed) break;
        }
        if (crossed) continue;
        chosen = q;
        break;
      }
      }
      if (chosen) break;
    }
    }
    const p = chosen ?? fallback;
    out.set(r.id, p);
    placed.push(labelBox(p, r.text));
  }
  return out;
}
