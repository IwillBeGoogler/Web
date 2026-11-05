import { center, isHorizontalSide, portPoint, type Pt, type Rect, type Side } from './geometry';

/** edge ports on one node side are never closer than this (px) */
export const PORT_MIN_GAP = 12;
const PORT_INSET = 4;
/** an end lying this close to the side's centre line counts as straight ahead */
const ALIGN_TOL = 6;

export interface EdgeEnds {
  id: string;
  source: string;
  target: string;
  sourceSide: Side;
  targetSide: Side;
}

/**
 * Spread the edges that share a node side evenly along that side (instead of stacking them on one point).
 * Edges are ordered by where the other end lies, which keeps the fan-out free of needless crossings.
 */
export function distributePorts(edges: EdgeEnds[], rects: Map<string, Rect>): Map<string, { src: Pt; dst: Pt }> {
  interface Use { edgeId: string; end: 'src' | 'dst'; other: Pt }
  const groups = new Map<string, { node: string; side: Side; uses: Use[] }>();
  const add = (node: string, side: Side, u: Use) => {
    const k = `${node}:${side}`;
    const g = groups.get(k) ?? { node, side, uses: [] };
    g.uses.push(u);
    groups.set(k, g);
  };
  for (const e of edges) {
    const rs = rects.get(e.source);
    const rt = rects.get(e.target);
    if (!rs || !rt) continue;
    add(e.source, e.sourceSide, { edgeId: e.id, end: 'src', other: center(rt) });
    add(e.target, e.targetSide, { edgeId: e.id, end: 'dst', other: center(rs) });
  }
  const out = new Map<string, { src: Pt; dst: Pt }>();
  const slot = (id: string) => {
    let v = out.get(id);
    if (!v) {
      v = { src: { x: 0, y: 0 }, dst: { x: 0, y: 0 } };
      out.set(id, v);
    }
    return v;
  };
  for (const g of groups.values()) {
    const r = rects.get(g.node)!;
    const along = (u: Use) => (isHorizontalSide(g.side) ? u.other.y : u.other.x);
    const sorted = [...g.uses].sort((a, b) => along(a) - along(b) || a.edgeId.localeCompare(b.edgeId));
    const n = sorted.length;
    const len = isHorizontalSide(g.side) ? r.height : r.width;
    // evenly spread, but >= PORT_MIN_GAP apart, and always centred on the side as a group (shrinks only when the side cannot fit them)
    let gap = Math.max(PORT_MIN_GAP, len / (n + 1));
    if (n > 1 && (n - 1) * gap > len - 2 * PORT_INSET) gap = Math.max(0, (len - 2 * PORT_INSET) / (n - 1));
    // a neighbour dead ahead (same row / column, the nearest one) keeps the side's centre: its line stays straight
    // instead of jogging because a second edge shares the side; the other edges fan out above / below it
    const mid = isHorizontalSide(g.side) ? r.y + r.height / 2 : r.x + r.width / 2;
    const ahead = (u: Use) => (g.side === 'right' ? u.other.x - (r.x + r.width) : g.side === 'left' ? r.x - u.other.x : g.side === 'bottom' ? u.other.y - (r.y + r.height) : r.y - u.other.y);
    let centred = -1;
    if (n > 1)
      sorted.forEach((u, k) => {
        if (Math.abs(along(u) - mid) <= ALIGN_TOL && ahead(u) > 0 && (centred < 0 || ahead(u) < ahead(sorted[centred]))) centred = k;
      });
    sorted.forEach((u, k) => {
      const t = centred >= 0 ? 0.5 + ((k - centred) * gap) / (len || 1) : 0.5 + ((k - (n - 1) / 2) * gap) / (len || 1);
      slot(u.edgeId)[u.end] = portPoint(r, g.side, Math.max(0, Math.min(1, t)));
    });
  }
  return out;
}

/** Index of an edge among the parallel edges between the same unordered node pair (0..count-1) and the pair size. */
export function parallelIndex(edges: { id: string; source: string; target: string }[]): Map<string, { index: number; count: number }> {
  const groups = new Map<string, string[]>();
  for (const e of edges) {
    const k = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    groups.set(k, [...(groups.get(k) ?? []), e.id]);
  }
  const out = new Map<string, { index: number; count: number }>();
  for (const ids of groups.values()) ids.forEach((id, index) => out.set(id, { index, count: ids.length }));
  return out;
}

/** Perpendicular offset (px) for the i-th of n parallel straight/curved edges: symmetric around the centre line. */
export const parallelOffset = (index: number, count: number, spacing = 18): number => (index - (count - 1) / 2) * spacing;
