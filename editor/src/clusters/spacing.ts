import type { DiagramNode } from '../types';
import { absolutePosition, nodeSize } from '../lib/graph';
import type { Rect } from '../lib/routing/geometry';

/** clear space kept between two top-level blocks */
export const CLUSTER_GAP = 24;

export const rectOf = (nodes: DiagramNode[], n: DiagramNode): Rect => {
  const p = absolutePosition(nodes, n);
  const s = nodeSize(n);
  return { x: p.x, y: p.y, width: s.width, height: s.height };
};
const hit = (a: Rect, b: Rect, gap = 0) => a.x - gap < b.x + b.width && a.x + a.width + gap > b.x && a.y - gap < b.y + b.height && a.y + a.height + gap > b.y;
const contains = (outer: Rect, inner: Rect) => outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;

/**
 * A cluster just grew (expanded / regenerated bigger): push the siblings it now covers away, right or down (whichever
 * is the shorter move), and repeat for whatever those hit in turn. `before` is the cluster's old rectangle: a sibling that
 * enclosed it (a plain group drawn around it) stays where it is.
 */
export function pushSiblingsClear(nodes: DiagramNode[], id: string, before?: Rect): DiagramNode[] {
  const shifted = new Map<string, { x: number; y: number }>();
  const pos = (n: DiagramNode) => shifted.get(n.id) ?? n.position;
  const view = () => nodes.map((n) => (shifted.has(n.id) ? { ...n, position: shifted.get(n.id)! } : n));
  const root = nodes.find((n) => n.id === id);
  if (!root) return nodes;
  const queue = [id];
  for (let guard = 0; queue.length && guard < 200; guard++) {
    const cur = view();
    const cid = queue.shift();
    const c = cur.find((n) => n.id === cid)!;
    const rc = rectOf(cur, c);
    for (const s of nodes) {
      if (s.id === c.id || s.hidden || s.parentId !== c.parentId) continue;
      const rs = rectOf(cur, { ...s, position: pos(s) });
      if (!hit(rc, rs, CLUSTER_GAP)) continue;
      if (c.id === id && before && contains(rs, before)) continue;
      const dx = rc.x + rc.width + CLUSTER_GAP - rs.x;
      const dy = rc.y + rc.height + CLUSTER_GAP - rs.y;
      const p = pos(s);
      shifted.set(s.id, dy <= dx ? { x: p.x, y: p.y + dy } : { x: p.x + dx, y: p.y });
      queue.push(s.id);
    }
  }
  return shifted.size ? nodes.map((n) => (shifted.has(n.id) ? { ...n, position: shifted.get(n.id)! } : n)) : nodes;
}

/** Nearest free top-left for a new block of `size` wanted at `at`: slides it down past whatever top-level node it would cover. */
export function freeSpot(nodes: DiagramNode[], at: { x: number; y: number }, size: { width: number; height: number }): { x: number; y: number } {
  const others = nodes.filter((n) => !n.parentId && !n.hidden).map((n) => rectOf(nodes, n));
  let y = at.y;
  for (let i = 0; i < 100; i++) {
    const me: Rect = { x: at.x, y, width: size.width, height: size.height };
    const blocker = others.filter((r) => hit(me, r, CLUSTER_GAP)).sort((a, b) => b.y + b.height - (a.y + a.height))[0];
    if (!blocker) break;
    y = blocker.y + blocker.height + CLUSTER_GAP;
  }
  return { x: at.x, y };
}
