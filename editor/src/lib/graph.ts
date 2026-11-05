import { MarkerType } from '@xyflow/react';
import type { DiagramEdge, DiagramNode } from '../types';
import { BUILTIN_SETTINGS, resolveEdgeStyle, type Settings } from './settings';

export const DEFAULT_NODE_SIZE = { width: 120, height: 96 };

export function nodeSize(n: DiagramNode): { width: number; height: number } {
  const style = (n.style ?? {}) as { width?: number; height?: number };
  return {
    width: n.width ?? n.measured?.width ?? style.width ?? DEFAULT_NODE_SIZE.width,
    height: n.height ?? n.measured?.height ?? style.height ?? DEFAULT_NODE_SIZE.height,
  };
}

export const MAX_NEST_LEVEL = 3;
export const isContainer = (n: DiagramNode): boolean => n.type === 'group' || n.type === 'cluster';

// id -> node lookups are done once per node array (arrays are replaced, never mutated, by the store): a per-call rebuild made
// absolutePosition / ancestorsOf O(N), so routing a page was O(N^2).
const indexCache = new WeakMap<DiagramNode[], { size: number; map: Map<string, DiagramNode> }>();
export const nodeIndex = (nodes: DiagramNode[]): Map<string, DiagramNode> => {
  const hit = indexCache.get(nodes);
  if (hit && hit.size === nodes.length) return hit.map;
  const map = new Map(nodes.map((n) => [n.id, n]));
  indexCache.set(nodes, { size: nodes.length, map });
  return map;
};
const index = nodeIndex;

/** Parents of a node, nearest first. */
export function ancestorsOf(nodes: DiagramNode[], id: string): DiagramNode[] {
  const map = index(nodes);
  const out: DiagramNode[] = [];
  let cur = map.get(id);
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const p = map.get(cur.parentId);
    if (!p) break;
    out.push(p);
    cur = p;
  }
  return out;
}

/** All nodes below `id` (children, grandchildren, ...). */
export function descendantsOf(nodes: DiagramNode[], id: string): DiagramNode[] {
  const out: DiagramNode[] = [];
  const queue = [id];
  const seen = new Set(queue);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of nodes) if (n.parentId === cur && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
      queue.push(n.id);
    }
  }
  return out;
}

/** Container nesting level: a root container is 1, its sub-group 2, ... */
export const levelOf = (nodes: DiagramNode[], id: string): number => 1 + ancestorsOf(nodes, id).length;

/** Container levels in the subtree of `n` (1 for a container without sub-containers; 0 for a leaf). */
function subtreeLevels(nodes: DiagramNode[], n: DiagramNode): number {
  if (!isContainer(n)) return 0;
  const kids = nodes.filter((x) => x.parentId === n.id && isContainer(x));
  return 1 + Math.max(0, ...kids.map((k) => subtreeLevels(nodes, k)));
}

const inClusterChain = (nodes: DiagramNode[], id: string): boolean => {
  const self = nodes.find((n) => n.id === id);
  return self?.type === 'cluster' || ancestorsOf(nodes, id).some((a) => a.type === 'cluster');
};

/** May `node` become a child of container `parentId`? Leaves always; groups only inside cluster chains and up to 3 levels. */
export function canNest(nodes: DiagramNode[], node: DiagramNode, parentId: string): boolean {
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent || !isContainer(parent) || parent.id === node.id) return false;
  if (parent.data.collapsed) return false; // a collapsed cluster is a closed card: nothing drops into it (its members are hidden)
  if (descendantsOf(nodes, node.id).some((d) => d.id === parentId)) return false; // no cycles
  if (!isContainer(node)) return true;
  if (node.type !== 'cluster' && !inClusterChain(nodes, parentId)) return false; // a cluster may sit in any group (e.g. a VPC / cloud box)
  return levelOf(nodes, parentId) + subtreeLevels(nodes, node) <= MAX_NEST_LEVEL;
}

/** Absolute top-left of a node (walks the whole parent chain). */
export function absolutePosition(nodes: DiagramNode[], n: DiagramNode): { x: number; y: number } {
  const map = index(nodes);
  let x = n.position.x;
  let y = n.position.y;
  let cur = n;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const p = map.get(cur.parentId);
    if (!p) break;
    x += p.position.x;
    y += p.position.y;
    cur = p;
  }
  return { x, y };
}

/**
 * Decide the parent for a node by its centre point: the deepest container that contains it and may legally hold it.
 * Absolute position is preserved.
 */
export function resolveParent(nodes: DiagramNode[], node: DiagramNode): DiagramNode {
  const abs = absolutePosition(nodes, node);
  const { width, height } = nodeSize(node);
  const cx = abs.x + width / 2;
  const cy = abs.y + height / 2;
  const withoutSelf = nodes.filter((n) => n.id !== node.id);
  const own = new Set(descendantsOf(nodes, node.id).map((d) => d.id));
  let best: { n: DiagramNode; area: number } | null = null;
  for (const g of withoutSelf) {
    if (!isContainer(g) || own.has(g.id) || g.hidden) continue;
    const p = absolutePosition(nodes, g);
    const s = nodeSize(g);
    if (cx < p.x || cx > p.x + s.width || cy < p.y || cy > p.y + s.height) continue;
    if (!canNest(nodes, node, g.id)) continue;
    const area = s.width * s.height;
    if (!best || area <= best.area) best = { n: g, area };
  }
  if (best) {
    if (node.parentId === best.n.id) return node;
    const bp = absolutePosition(nodes, best.n);
    return { ...node, parentId: best.n.id, position: { x: abs.x - bp.x, y: abs.y - bp.y } };
  }
  if (!node.parentId) return node;
  const { parentId: _drop, ...rest } = node;
  void _drop;
  return { ...rest, position: abs };
}

/** Parents before children at any depth; otherwise keeps input order. */
export function sortParentsFirst(nodes: DiagramNode[]): DiagramNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, DiagramNode[]>();
  const roots: DiagramNode[] = [];
  for (const n of nodes) {
    if (n.parentId && ids.has(n.parentId)) {
      const l = kids.get(n.parentId) ?? [];
      l.push(n);
      kids.set(n.parentId, l);
    } else roots.push(n);
  }
  const out: DiagramNode[] = [];
  const seen = new Set<string>();
  const visit = (n: DiagramNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    for (const c of kids.get(n.id) ?? []) visit(c);
  };
  roots.forEach(visit);
  for (const n of nodes) visit(n); // cycles / orphans
  return out;
}

/**
 * Older editors let a dragged node land inside a COLLAPSED cluster card. Such a node is not one of the cluster's members
 * (it is visible, not hidden), but it counted as one: its edges were drawn from the card and it raised the member badge.
 * Move each of them (with its subtree) up to the nearest ancestor that is not inside a collapsed cluster, keeping its place.
 */
export function detachFromCollapsed(nodes: DiagramNode[]): DiagramNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const moved = new Map<string, DiagramNode>();
  for (const n of nodes) {
    if (n.hidden || !n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (!parent || !(parent.type === 'cluster' && parent.data.collapsed)) continue;
    // climb to the first ancestor that is neither collapsed nor inside a collapsed cluster
    let anc: DiagramNode | undefined = parent;
    while (anc && (anc.hidden || (anc.type === 'cluster' && anc.data.collapsed))) anc = anc.parentId ? byId.get(anc.parentId) : undefined;
    const abs = absolutePosition(nodes, n);
    const { parentId: _p, ...rest } = n;
    void _p;
    if (anc) {
      const ap = absolutePosition(nodes, anc);
      moved.set(n.id, { ...rest, parentId: anc.id, position: { x: abs.x - ap.x, y: abs.y - ap.y } } as DiagramNode);
    } else moved.set(n.id, { ...rest, position: abs } as DiagramNode);
  }
  return moved.size ? nodes.map((n) => moved.get(n.id) ?? n) : nodes;
}

/**
 * Lock flags must agree with `data.locked`: leftovers of an old lock/unlock (draggable:false / deletable:false on an
 * unlocked node) made some elements impossible to move or delete, so they are stripped on load; locked nodes get them.
 */
export function normalizeLocks(nodes: DiagramNode[]): DiagramNode[] {
  return detachFromCollapsed(nodes).map((n) => {
    const locked = !!n.data.locked;
    const stale = n.draggable === false || n.deletable === false || n.selectable === false || n.connectable === false;
    if (locked) return n.draggable === false && n.deletable === false ? n : { ...n, draggable: false, deletable: false };
    if (!stale) return n;
    const { draggable: _d, deletable: _x, selectable: _s, connectable: _c, ...rest } = n;
    void _d; void _x; void _s; void _c;
    return rest as DiagramNode;
  });
}

export function styleEdge(edge: DiagramEdge, edgeDefaults: Settings['edge'] = BUILTIN_SETTINGS.edge): DiagramEdge {
  const d = edge.data ?? {};
  const v = resolveEdgeStyle(d, { edge: edgeDefaults });
  const { color, strokeStyle, lineType, arrows } = v;
  const marker = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
  const style: Record<string, string | number> = { stroke: color, strokeWidth: v.width };
  const dash = strokeStyle === 'dashed' ? '6 4' : strokeStyle === 'dotted' ? '2 5' : undefined;
  if (dash) style.strokeDasharray = dash;
  if (strokeStyle === 'dotted') style.strokeLinecap = 'round';
  const { markerStart: _ms, markerEnd: _me, pathOptions: _po, ...rest } = edge as DiagramEdge & { pathOptions?: unknown };
  void _ms; void _me; void _po;
  const out: Record<string, unknown> = {
    ...rest,
    type: lineType === 'orthogonal' ? 'smoothstep' : lineType === 'straight' ? 'straight' : 'default',
    style,
    labelStyle: { fill: color, fontSize: 11, fontWeight: 500 },
    labelShowBg: v.labelBackground,
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
    labelBgPadding: [4, 2],
    deletable: d.locked ? false : undefined,
  };
  if (d.flow) {
    out.animated = true;
    out.className = [String(out.className ?? '').replace(/\bedge-flow\b/, '').trim(), 'edge-flow'].filter(Boolean).join(' ');
  } else {
    delete out.animated;
    const c = String(out.className ?? '').replace(/\bedge-flow\b/, '').trim();
    if (c) out.className = c;
    else delete out.className;
  }
  if (arrows === 'end' || arrows === 'both') out.markerEnd = marker;
  if (arrows === 'start' || arrows === 'both') out.markerStart = marker;
  if (lineType === 'orthogonal') out.pathOptions = { borderRadius: 0 };
  if (out.deletable === undefined) delete out.deletable;
  return out as DiagramEdge;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
