/** Arranging a selection of stickies: grid, group by colour. Pure: return new top-left positions by id. */
import type { DiagramNode } from '../../types';
import { nodeSize } from '../graph';
import { STICKY_COLORS, STICKY_GAP, colorIdOfFill } from './sticky';

type Pos = { x: number; y: number };

const reading = (a: DiagramNode, b: DiagramNode, band: number): number => {
  const ra = Math.round(a.position.y / band);
  const rb = Math.round(b.position.y / band);
  return ra !== rb ? ra - rb : a.position.x - b.position.x;
};

/** Rows by reading order (top to bottom, then left to right), anchored at the selection's top-left. */
export function arrangeAsGrid(nodes: DiagramNode[], o: { columns?: number; gap?: number } = {}): Map<string, Pos> {
  const out = new Map<string, Pos>();
  const items = nodes.filter((n) => n.type === 'sticky' || n.type === 'text' || n.type === 'stamp').slice();
  if (items.length < 2) return out;
  const gap = o.gap ?? STICKY_GAP;
  const cols = Math.max(1, o.columns ?? Math.ceil(Math.sqrt(items.length)));
  const cellW = Math.max(...items.map((n) => nodeSize(n).width)) + gap;
  const cellH = Math.max(...items.map((n) => nodeSize(n).height)) + gap;
  const band = Math.max(40, cellH / 2);
  items.sort((a, b) => reading(a, b, band));
  const ox = Math.min(...items.map((n) => n.position.x));
  const oy = Math.min(...items.map((n) => n.position.y));
  items.forEach((n, i) => out.set(n.id, { x: ox + (i % cols) * cellW, y: oy + Math.floor(i / cols) * cellH }));
  return out;
}

/** One column per colour (palette order, unknown colours last), each column in reading order. */
export function groupByColor(nodes: DiagramNode[], o: { gap?: number } = {}): Map<string, Pos> {
  const out = new Map<string, Pos>();
  const items = nodes.filter((n) => n.type === 'sticky');
  if (!items.length) return out;
  const gap = o.gap ?? STICKY_GAP;
  const cellW = Math.max(...items.map((n) => nodeSize(n).width)) + gap;
  const cellH = Math.max(...items.map((n) => nodeSize(n).height)) + gap;
  const order = (n: DiagramNode) => {
    const i = STICKY_COLORS.findIndex((c) => c.id === colorIdOfFill(n.data.fill));
    return i < 0 ? STICKY_COLORS.length : i;
  };
  const ids = [...new Set(items.map(order))].sort((a, b) => a - b);
  const ox = Math.min(...items.map((n) => n.position.x));
  const oy = Math.min(...items.map((n) => n.position.y));
  const band = Math.max(40, cellH / 2);
  ids.forEach((k, col) => {
    items
      .filter((n) => order(n) === k)
      .sort((a, b) => reading(a, b, band))
      .forEach((n, row) => out.set(n.id, { x: ox + col * cellW, y: oy + row * cellH }));
  });
  return out;
}
