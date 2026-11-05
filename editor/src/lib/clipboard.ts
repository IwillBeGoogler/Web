import type { DiagramEdge, DiagramNode } from '../types';
import { absolutePosition, descendantsOf, newId, sortParentsFirst } from './graph';

export interface ClipboardData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

const stripTransient = <T extends { selected?: boolean; dragging?: boolean; measured?: unknown }>(x: T): T => {
  const { selected: _s, dragging: _d, measured: _m, ...rest } = x;
  void _s; void _d; void _m;
  return rest as T;
};

/** Snapshot selected nodes (+ children of selected groups) and edges between them. */
export function copySelection(nodes: DiagramNode[], edges: DiagramEdge[]): ClipboardData | null {
  const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  for (const id of [...ids]) for (const d of descendantsOf(nodes, id)) ids.add(d.id);
  if (!ids.size) return null;
  const picked = nodes
    .filter((n) => ids.has(n.id))
    .map((n) => {
      const c = stripTransient(structuredClone(n));
      if (n.parentId && !ids.has(n.parentId)) {
        c.position = absolutePosition(nodes, n);
        delete c.parentId;
      }
      return c;
    });
  const outEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => stripTransient(structuredClone(e)));
  return { nodes: picked, edges: outEdges };
}

/** New nodes/edges with fresh ids; roots offset; pasted nodes selected and unlocked. */
export function pasteClipboard(
  clip: ClipboardData,
  offset: { x: number; y: number },
  genId: (prefix: string) => string = newId,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const map = new Map<string, string>();
  for (const n of clip.nodes) map.set(n.id, genId('n'));
  const nodes = clip.nodes.map((n) => {
    const c = structuredClone(n);
    c.id = map.get(n.id)!;
    if (n.parentId && map.has(n.parentId)) c.parentId = map.get(n.parentId);
    else {
      delete c.parentId;
      c.position = { x: n.position.x + offset.x, y: n.position.y + offset.y };
    }
    const { locked: _l, ...data } = c.data;
    void _l;
    c.data = data as DiagramNode['data'];
    delete c.draggable;
    delete c.deletable;
    c.selected = true;
    return c;
  });
  const edges = clip.edges.map((e) => {
    const c = structuredClone(e);
    c.id = genId('e');
    c.source = map.get(e.source)!;
    c.target = map.get(e.target)!;
    c.selected = true;
    if (c.data) {
      const { locked: _l, ...d } = c.data;
      void _l;
      c.data = d;
    }
    return c;
  });
  return { nodes: sortParentsFirst(nodes), edges };
}

/** Bounding-box top-left of the clipboard roots (for paste-at-cursor). */
export function clipboardOrigin(clip: ClipboardData): { x: number; y: number } {
  const roots = clip.nodes.filter((n) => !n.parentId);
  return { x: Math.min(...roots.map((n) => n.position.x)), y: Math.min(...roots.map((n) => n.position.y)) };
}
