/**
 * Mind map operations that need no store: layout with automatic branch colours, "+" buttons on a side, re-parenting, promote,
 * paste a list as children, arrow navigation. Pure (nodes + edges in, nodes + edges out) so every one of them is one undo step.
 */
import type { DiagramEdge, DiagramNode } from '../../types';
import { addChild, childrenOf, collapsedHidden, layoutMindMap, MM_COLORS, mindmapSize, parentOf, rootOf } from './mindmap';

type Graph = { nodes: DiagramNode[]; edges: DiagramEdge[] };
export type Side = 'l' | 'r';

/** the node and everything below it */
export function subtreeIds(edges: DiagramEdge[], id: string): Set<string> {
  const out = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) if (e.source === cur && !out.has(e.target)) { out.add(e.target); queue.push(e.target); }
  }
  return out;
}
export const hiddenCount = (_nodes: DiagramNode[], edges: DiagramEdge[], id: string): number => subtreeIds(edges, id).size - 1;

/** add a child; on the root `side` pins the branch to that side (the left / right "+" button) */
export function addChildAt(nodes: DiagramNode[], edges: DiagramEdge[], parentId: string, id: string, edgeId: string, label = '', side?: Side): { node: DiagramNode; edge: DiagramEdge } {
  const r = addChild(nodes, edges, parentId, id, edgeId, label);
  const isRoot = parentId === rootOf(nodes, edges, parentId);
  if (side && isRoot) r.node = { ...r.node, data: { ...r.node.data, side, pinSide: side } };
  return r;
}

/** colour of each first-level branch, inherited by its descendants; edges take the colour of the node they lead to */
function recolor(nodes: DiagramNode[], edges: DiagramEdge[], rootId: string): Graph {
  const accent = new Map<string, { accent: string; branch: number }>();
  childrenOf(nodes, edges, rootId).forEach((c, i) => {
    const a = { accent: MM_COLORS[(i + 1) % MM_COLORS.length], branch: i };
    for (const id of subtreeIds(edges, c.id)) accent.set(id, a);
  });
  const nextNodes = nodes.map((n) => {
    const a = accent.get(n.id);
    return a && (n.data.accent !== a.accent || n.data.branch !== a.branch) ? { ...n, data: { ...n.data, accent: a.accent, branch: a.branch } } : n;
  });
  const nextEdges = edges.map((e) => {
    const a = accent.get(e.target);
    return a && e.data?.color !== a.accent ? ({ ...e, data: { ...e.data, color: a.accent, lineType: 'curved' } } as DiagramEdge) : e;
  });
  return { nodes: nextNodes, edges: nextEdges };
}

/** recompute positions, sides, sizes, colours and collapsed visibility of the tree below `rootId` (always runs: nobody places nodes by hand) */
export function applyMapLayout(nodes: DiagramNode[], edges: DiagramEdge[], rootId: string): Graph {
  const colored = recolor(nodes, edges, rootId);
  nodes = colored.nodes;
  edges = colored.edges;
  const place = layoutMindMap(nodes, edges, rootId);
  const hidden = collapsedHidden(nodes, edges, rootId);
  const inTree = new Set<string>([rootId, ...place.keys(), ...hidden]);
  const next = nodes.map((n) => {
    if (!inTree.has(n.id)) return n;
    const p = place.get(n.id);
    const s = mindmapSize(n.data.label, n.id === rootId);
    const data = p && p.side !== 'c' && n.data.side !== p.side ? { ...n.data, side: p.side } : n.data;
    const base = { ...n, data, width: s.width, height: s.height, hidden: hidden.has(n.id) ? true : undefined };
    if (base.hidden === undefined) delete (base as { hidden?: boolean }).hidden;
    return p ? { ...base, position: { x: p.x, y: p.y } } : base;
  });
  const nextEdges = edges.map((e) => {
    if (!inTree.has(e.source) || !inTree.has(e.target)) return e;
    const h = hidden.has(e.source) || hidden.has(e.target);
    const left = place.get(e.target)?.side === 'l';
    const pinned = (e.data as { pinSource?: string } | undefined)?.pinSource === 'left';
    if (!!e.hidden === h && left === pinned) return e;
    const out = { ...e, sourceHandle: left ? 'left' : 'right', targetHandle: left ? 'right' : 'left', data: { ...e.data, pinSource: left ? 'left' : 'right', pinTarget: left ? 'right' : 'left' } } as DiagramEdge;
    if (h) out.hidden = true;
    else delete out.hidden;
    return out;
  });
  return { nodes: next, edges: nextEdges };
}

/** lay out every tree that contains one of `ids` (used after deleting a branch) */
export function relayoutRootsOf(nodes: DiagramNode[], edges: DiagramEdge[], ids: Iterable<string>): Graph {
  const roots = new Set<string>();
  for (const id of ids) if (nodes.some((n) => n.id === id && n.type === 'mindmap')) roots.add(rootOf(nodes, edges, id));
  return [...roots].reduce<Graph>((acc, r) => applyMapLayout(acc.nodes, acc.edges, r), { nodes, edges });
}

/** move a node (with its subtree) under `newParentId`, optionally at a sibling index. null when illegal (root, cycle, unknown). */
export function moveNode(nodes: DiagramNode[], edges: DiagramEdge[], id: string, newParentId: string, index?: number): Graph | null {
  const node = nodes.find((n) => n.id === id);
  const parent = nodes.find((n) => n.id === newParentId);
  const old = edges.find((e) => e.target === id);
  if (!node || !parent || node.type !== 'mindmap' || parent.type !== 'mindmap' || !old) return null; // the root has no parent edge
  if (subtreeIds(edges, id).has(newParentId)) return null;
  const rest = edges.filter((e) => e !== old);
  const moved = { ...old, source: newParentId } as DiagramEdge;
  const sib = rest.map((e, i) => (e.source === newParentId ? i : -1)).filter((i) => i >= 0);
  let at = rest.length;
  if (index !== undefined && index < sib.length) at = sib[Math.max(0, index)];
  else if (sib.length) at = sib[sib.length - 1] + 1;
  const outEdges = [...rest.slice(0, at), moved, ...rest.slice(at)];
  const outNodes = nodes.map((n) => {
    if (n.id !== id) return n;
    const { pinSide: _p, ...data } = n.data;
    void _p;
    return { ...n, data };
  });
  return { nodes: outNodes, edges: outEdges };
}

/** Shift+Tab: the node becomes a sibling of its parent, right after it. null at the first level. */
export function promoteNode(nodes: DiagramNode[], edges: DiagramEdge[], id: string): Graph | null {
  const p = parentOf(edges, id);
  const gp = p ? parentOf(edges, p) : undefined;
  if (!p || !gp) return null;
  const idx = childrenOf(nodes, edges, gp).findIndex((c) => c.id === p);
  return moveNode(nodes, edges, id, gp, idx + 1);
}

export type DropTarget = { kind: 'parent'; id: string } | { kind: 'reorder'; parentId: string; index: number };
/** where a dragged node would land if released at `point` (flow coordinates): onto a node = its child, else its place among its siblings */
export function dropTarget(nodes: DiagramNode[], edges: DiagramEdge[], draggedId: string, point: { x: number; y: number }): DropTarget | null {
  const parentId = parentOf(edges, draggedId);
  if (!parentId) return null;
  const below = subtreeIds(edges, draggedId);
  const hit = [...nodes].reverse().find((n) => {
    if (n.type !== 'mindmap' || n.hidden || below.has(n.id) || n.id === parentId) return false;
    const w = n.width ?? 100;
    const h = n.height ?? 38;
    return point.x >= n.position.x && point.x <= n.position.x + w && point.y >= n.position.y && point.y <= n.position.y + h;
  });
  if (hit) return { kind: 'parent', id: hit.id };
  const sibs = childrenOf(nodes, edges, parentId).filter((c) => c.id !== draggedId && !c.hidden);
  const index = sibs.filter((c) => c.position.y + (c.height ?? 38) / 2 < point.y).length;
  return { kind: 'reorder', parentId, index };
}

const BULLET = /^([ \t]*)(?:[-*+•]|\d+[.)])\s+(.*)$/;
/** a multi-line text or Markdown list as children of `parentId`: indentation = depth. null when it is not a list (fewer than 2 lines). */
export function pasteAsChildren(nodes: DiagramNode[], edges: DiagramEdge[], parentId: string, text: string, gen: (prefix: string) => string): Graph | null {
  const items: { indent: number; label: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = BULLET.exec(raw);
    const ws = m ? m[1] : /^([ \t]*)/.exec(raw)![1];
    const label = (m ? m[2] : raw.trim().replace(/^#{1,6}\s+/, '')).trim();
    if (label) items.push({ indent: ws.replace(/\t/g, '    ').length, label });
  }
  if (items.length < 2) return null;
  const stack: number[] = [];
  const path: string[] = [parentId];
  const addedNodes: DiagramNode[] = [];
  const addedEdges: DiagramEdge[] = [];
  for (const it of items) {
    while (stack.length && stack[stack.length - 1] > it.indent) stack.pop();
    if (!stack.length || stack[stack.length - 1] < it.indent) stack.push(it.indent);
    const level = Math.min(stack.length - 1, path.length - 1);
    const r = addChild([...nodes, ...addedNodes], [...edges, ...addedEdges], path[level], gen('mm'), gen('e'), it.label);
    addedNodes.push(r.node);
    addedEdges.push(r.edge);
    path.length = level + 1;
    path.push(r.node.id);
  }
  return { nodes: addedNodes, edges: addedEdges };
}

/** arrow keys: left / right walk towards the children or the parent (depending on the side of the map), up / down walk the siblings */
export function mapNavigate(nodes: DiagramNode[], edges: DiagramEdge[], id: string, dir: 'up' | 'down' | 'left' | 'right'): string | null {
  const node = nodes.find((n) => n.id === id);
  if (!node || node.type !== 'mindmap') return null;
  const parentId = parentOf(edges, id);
  const side: Side | 'c' = !parentId ? 'c' : node.data.side === 'l' ? 'l' : 'r';
  const visibleKids = (pid: string) => childrenOf(nodes, edges, pid).filter((c) => !c.hidden);
  if (dir === 'left' || dir === 'right') {
    const want: Side = dir === 'right' ? 'r' : 'l';
    if (side === 'c') return visibleKids(id).find((c) => (c.data.side === 'l' ? 'l' : 'r') === want)?.id ?? null;
    if (side === want) return node.data.collapsed ? null : visibleKids(id)[0]?.id ?? null;
    return parentId ?? null;
  }
  if (!parentId) return null;
  const sibs = visibleKids(parentId)
    .filter((c) => parentOf(edges, parentId) || (c.data.side === 'l' ? 'l' : 'r') === side)
    .sort((a, b) => a.position.y - b.position.y);
  const i = sibs.findIndex((c) => c.id === id);
  return sibs[dir === 'up' ? i - 1 : i + 1]?.id ?? null;
}

/** the inspector slides in for a selection, except when it only holds mind map nodes (it stays closed until asked for) */
export function inspectorShouldOpen(nodes: DiagramNode[], edges: DiagramEdge[]): boolean {
  const selN = nodes.filter((n) => n.selected);
  const selE = edges.filter((e) => e.selected);
  if (!selN.length && !selE.length) return false;
  const mm = new Set(nodes.filter((n) => n.type === 'mindmap').map((n) => n.id));
  return selN.some((n) => n.type !== 'mindmap') || selE.some((e) => !(mm.has(e.source) && mm.has(e.target)));
}
