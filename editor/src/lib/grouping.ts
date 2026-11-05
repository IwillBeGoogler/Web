import type { DiagramNode } from '../types';
import { absolutePosition, descendantsOf, nodeSize, sortParentsFirst } from './graph';

/**
 * Wrap the selected unlocked nodes (groups and clusters included, whole) in a new group/cluster. If all targets share a parent
 * the new group is created inside that parent. Returns null if nothing to group.
 */
export function groupNodes(
  nodes: DiagramNode[],
  ids: string[],
  groupId: string,
  pad = 24,
  titleRoom = 20,
  kind: 'group' | 'cluster' = 'group',
  data: Partial<DiagramNode['data']> = {},
): { nodes: DiagramNode[]; groupId: string } | null {
  const sel = new Set(ids);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // a selected group / cluster is wrapped whole (its members ride along); a member whose container is also selected is skipped
  const ancestorPicked = (n: DiagramNode) => {
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) if (sel.has(p.id)) return true;
    return false;
  };
  const targets = nodes.filter((n) => sel.has(n.id) && !n.data.locked && !ancestorPicked(n));
  if (!targets.length) return null;
  const rects = targets.map((n) => {
    const p = absolutePosition(nodes, n);
    const s = nodeSize(n);
    return { x: p.x, y: p.y, r: p.x + s.width, b: p.y + s.height };
  });
  const gx = Math.min(...rects.map((r) => r.x)) - pad;
  const gy = Math.min(...rects.map((r) => r.y)) - pad - titleRoom;
  const gw = Math.max(...rects.map((r) => r.r)) + pad - gx;
  const gh = Math.max(...rects.map((r) => r.b)) + pad - gy;
  const parents = new Set(targets.map((t) => t.parentId ?? ''));
  const sharedParent = parents.size === 1 && [...parents][0] ? [...parents][0] : undefined;
  const pAbs = sharedParent ? absolutePosition(nodes, nodes.find((n) => n.id === sharedParent)!) : { x: 0, y: 0 };
  const group: DiagramNode = {
    id: groupId, type: kind, position: { x: gx - pAbs.x, y: gy - pAbs.y }, width: gw, height: gh,
    style: { width: gw, height: gh }, selected: true, data: { label: kind === 'cluster' ? 'Cluster' : 'Group', ...data },
    ...(sharedParent ? { parentId: sharedParent } : {}),
  };
  const tIds = new Set(targets.map((t) => t.id));
  const moved = nodes.map((n) => {
    if (!tIds.has(n.id)) return n.selected ? { ...n, selected: false } : n;
    const p = absolutePosition(nodes, n);
    return { ...n, selected: false, parentId: groupId, position: { x: p.x - gx, y: p.y - gy } };
  });
  return { nodes: sortParentsFirst([group, ...moved]), groupId };
}

/** Move nodes up one level (to their grandparent, or the root), keeping absolute positions. */
export function removeFromGroup(nodes: DiagramNode[], ids: string[]): DiagramNode[] {
  const sel = new Set(ids);
  const next = nodes.map((n) => {
    if (!sel.has(n.id) || !n.parentId) return n;
    const parent = nodes.find((p) => p.id === n.parentId);
    const abs = absolutePosition(nodes, n);
    const { parentId: _p, ...rest } = n;
    void _p;
    if (parent?.parentId) {
      const gp = absolutePosition(nodes, nodes.find((x) => x.id === parent.parentId)!);
      return { ...rest, parentId: parent.parentId, position: { x: abs.x - gp.x, y: abs.y - gp.y } } as DiagramNode;
    }
    return { ...rest, position: abs } as DiagramNode;
  });
  return sortParentsFirst(next);
}

/** Dissolve a group, keeping its children one level up (absolute positions preserved). */
export function ungroupNode(nodes: DiagramNode[], groupId: string): DiagramNode[] {
  const kids = nodes.filter((n) => n.parentId === groupId).map((n) => n.id);
  void descendantsOf;
  return removeFromGroup(nodes, kids).filter((n) => n.id !== groupId);
}
