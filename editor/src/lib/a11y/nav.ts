import type { DiagramNode } from '../../types';
import { absolutePosition, nodeSize } from '../graph';

export type Dir = 'up' | 'down' | 'left' | 'right';

interface Box {
  id: string;
  cx: number;
  cy: number;
}
const boxes = (nodes: DiagramNode[]): Box[] =>
  nodes
    .filter((n) => !n.hidden)
    .map((n) => {
      const p = absolutePosition(nodes, n);
      const s = nodeSize(n);
      return { id: n.id, cx: p.x + s.width / 2, cy: p.y + s.height / 2 };
    });

/**
 * Spatial keyboard navigation: the nearest visible node in a direction. The score favours nodes that lie straight ahead
 * (small perpendicular offset) over closer diagonal ones, and only nodes within a 45-degree cone of the direction count.
 */
export function nearestInDirection(nodes: DiagramNode[], fromId: string, dir: Dir): string | null {
  const all = boxes(nodes);
  const from = all.find((b) => b.id === fromId);
  if (!from) return null;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best: { id: string; score: number } | null = null;
  for (const b of all) {
    if (b.id === fromId) continue;
    const along = ((horizontal ? b.cx - from.cx : b.cy - from.cy)) * sign;
    if (along <= 1) continue;
    const across = Math.abs(horizontal ? b.cy - from.cy : b.cx - from.cx);
    if (across > along) continue; // outside the 45-degree cone: that node belongs to another direction
    const score = along + across * 3;
    if (!best || score < best.score) best = { id: b.id, score };
  }
  return best?.id ?? null;
}

/** Reading order (rows of 40px, then left to right): the order a screen reader walks the diagram. */
export function focusOrder(nodes: DiagramNode[]): DiagramNode[] {
  const pos = new Map(nodes.map((n) => [n.id, absolutePosition(nodes, n)]));
  return nodes
    .filter((n) => !n.hidden)
    .sort((a, b) => {
      const pa = pos.get(a.id)!;
      const pb = pos.get(b.id)!;
      const ra = Math.floor(pa.y / 40);
      const rb = Math.floor(pb.y / 40);
      return ra - rb || pa.x - pb.x;
    });
}
