import type { DiagramNode } from '../types';
import { absolutePosition, nodeSize } from './graph';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

interface Item {
  node: DiagramNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

function items(nodes: DiagramNode[], ids: string[]): Item[] {
  const sel = new Set(ids);
  return nodes
    .filter((n) => sel.has(n.id) && !n.data.locked)
    .map((n) => {
      const p = absolutePosition(nodes, n);
      const s = nodeSize(n);
      return { node: n, x: p.x, y: p.y, w: s.width, h: s.height };
    });
}

function apply(nodes: DiagramNode[], moved: Map<string, { x: number; y: number }>): DiagramNode[] {
  return nodes.map((n) => {
    const abs = moved.get(n.id);
    if (!abs) return n;
    const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : undefined;
    const pa = parent ? absolutePosition(nodes, parent) : undefined;
    const position = pa ? { x: abs.x - pa.x, y: abs.y - pa.y } : abs;
    return { ...n, position };
  });
}

export function alignNodes(nodes: DiagramNode[], ids: string[], mode: AlignMode): DiagramNode[] {
  const it = items(nodes, ids);
  if (it.length < 2) return nodes;
  const minX = Math.min(...it.map((i) => i.x));
  const maxR = Math.max(...it.map((i) => i.x + i.w));
  const minY = Math.min(...it.map((i) => i.y));
  const maxB = Math.max(...it.map((i) => i.y + i.h));
  const moved = new Map<string, { x: number; y: number }>();
  for (const i of it) {
    let { x, y } = i;
    if (mode === 'left') x = minX;
    else if (mode === 'right') x = maxR - i.w;
    else if (mode === 'center') x = (minX + maxR) / 2 - i.w / 2;
    else if (mode === 'top') y = minY;
    else if (mode === 'bottom') y = maxB - i.h;
    else y = (minY + maxB) / 2 - i.h / 2;
    moved.set(i.node.id, { x, y });
  }
  return apply(nodes, moved);
}

export function distributeNodes(nodes: DiagramNode[], ids: string[], axis: DistributeAxis): DiagramNode[] {
  const it = items(nodes, ids);
  if (it.length < 3) return nodes;
  const h = axis === 'horizontal';
  const sorted = [...it].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
  const start = h ? sorted[0].x : sorted[0].y;
  const last = sorted[sorted.length - 1];
  const end = h ? last.x + last.w : last.y + last.h;
  const total = sorted.reduce((s, i) => s + (h ? i.w : i.h), 0);
  const gap = (end - start - total) / (sorted.length - 1);
  const moved = new Map<string, { x: number; y: number }>();
  let cursor = start;
  for (const i of sorted) {
    moved.set(i.node.id, h ? { x: cursor, y: i.y } : { x: i.x, y: cursor });
    cursor += (h ? i.w : i.h) + gap;
  }
  return apply(nodes, moved);
}
