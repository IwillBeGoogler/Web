import type { Port, Pt, Rect } from '../routing/geometry';

/** A transition from a state to itself: out of the right side near the top, round and back in near the bottom. */
export function nodeSelfLoop(rect: Rect, gap = 3, labelW = 0): { points: Pt[]; src: Port; dst: Port } {
  const x = rect.x + rect.width + gap;
  const y1 = rect.y + Math.max(8, rect.height * 0.3);
  const y2 = rect.y + Math.min(rect.height - 8, rect.height * 0.7);
  // the label is centred on the outer side: push it out far enough that it clears the node
  const xo = x + Math.max(30, Math.ceil(labelW / 2) + 12);
  return {
    points: [{ x, y: y1 }, { x: xo, y: y1 }, { x: xo, y: y2 }, { x, y: y2 }],
    src: { pt: { x, y: y1 }, side: 'right' },
    dst: { pt: { x, y: y2 }, side: 'right' },
  };
}
