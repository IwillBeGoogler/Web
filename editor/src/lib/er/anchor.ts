// selfEdge() in internal/ui/assets/app.js (~L3030).
import type { DiagramEdge, DiagramNode } from '../../types';
import type { Port, Pt, Rect, Side } from '../routing/geometry';
import { rowCenterY } from './geometry';
import { relationOf, tableOf } from './tableData';

export const isTableRelation = (nodes: Map<string, DiagramNode>, e: DiagramEdge): boolean => !!relationOf(e) && nodes.get(e.source)?.type === 'table' && nodes.get(e.target)?.type === 'table';

/** Facing sides for two tables: parents' right edge to children's left edge; overlapping columns both leave on the right. */
export function relationSides(s: Rect, d: Rect): [Side, Side] {
  if (s.x + s.width + 24 <= d.x) return ['right', 'left'];
  if (d.x + d.width + 24 <= s.x) return ['left', 'right'];
  return ['right', 'right'];
}

/** Absolute y where a relation edge leaves / enters a table: the centre of the column's row (header centre if the column is hidden). */
export function anchorY(rect: Rect, node: DiagramNode, colId: string | undefined): number {
  return rect.y + rowCenterY(tableOf(node), colId);
}

export const SELF_LOOP_MIN = 26;
export const SELF_LOOP_MAX = 64;

/** Path points of a self-referencing relation: out of the right side at the FK column row, round and back in at the key row. */
export function selfLoopPoints(rect: Rect, node: DiagramNode, fromCol: string | undefined, toCol: string | undefined, gap = 3): { points: Pt[]; src: Port; dst: Port } {
  const x = rect.x + rect.width + gap;
  let y1 = anchorY(rect, node, fromCol);
  let y2 = anchorY(rect, node, toCol);
  if (Math.abs(y1 - y2) < 14) { y2 = y1 + 14; }
  const out = Math.min(SELF_LOOP_MAX, Math.max(SELF_LOOP_MIN, 18 + Math.abs(y2 - y1) * 0.2));
  const xo = x + out;
  return {
    points: [{ x, y: y1 }, { x: xo, y: y1 }, { x: xo, y: y2 }, { x, y: y2 }],
    src: { pt: { x, y: y1 }, side: 'right' },
    dst: { pt: { x, y: y2 }, side: 'right' },
  };
}
