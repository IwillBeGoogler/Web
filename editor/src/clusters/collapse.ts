import type { DiagramEdge, DiagramNode } from '../types';
import { descendantsOf, isContainer } from '../lib/graph';
import { nodeSize } from '../lib/graph';

export const COMPACT_SIZE = { width: 232, height: 132 };

export const memberCount = (nodes: DiagramNode[], clusterId: string): number => {
  const c = nodes.find((n) => n.id === clusterId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // when collapsed, only hidden members count: a visible node wrongly parented into the card (older files) is not a member
  const member = (n: DiagramNode) => {
    if (!c?.data.collapsed) return true;
    for (let x: DiagramNode | undefined = n; x && x.id !== clusterId; x = x.parentId ? byId.get(x.parentId) : undefined) if (!x.hidden) return false;
    return true;
  };
  return descendantsOf(nodes, clusterId).filter((n) => !isContainer(n) && member(n)).length;
};

/** Collapse a cluster to a compact node; descendants are hidden but keep their exact positions. */
export function collapseCluster(nodes: DiagramNode[], id: string): DiagramNode[] {
  const target = nodes.find((n) => n.id === id);
  if (!target || target.type !== 'cluster' || target.data.collapsed) return nodes;
  const desc = new Set(descendantsOf(nodes, id).map((d) => d.id));
  const size = nodeSize(target);
  return nodes.map((n) => {
    if (n.id === id) {
      const style = { ...(n.style ?? {}), width: COMPACT_SIZE.width, height: COMPACT_SIZE.height };
      return { ...n, width: COMPACT_SIZE.width, height: COMPACT_SIZE.height, style, data: { ...n.data, collapsed: true, expandedSize: { width: size.width, height: size.height } } };
    }
    return desc.has(n.id) ? { ...n, hidden: true } : n;
  });
}

/** Expand: restore the saved size and un-hide descendants (except those under an inner collapsed cluster). */
export function expandCluster(nodes: DiagramNode[], id: string): DiagramNode[] {
  const target = nodes.find((n) => n.id === id);
  if (!target || target.type !== 'cluster' || !target.data.collapsed) return nodes;
  const desc = descendantsOf(nodes, id);
  // descendants that stay hidden because an inner cluster is itself collapsed
  const stillHidden = new Set<string>();
  for (const d of desc) if (d.type === 'cluster' && d.data.collapsed) for (const x of descendantsOf(nodes, d.id)) stillHidden.add(x.id);
  const show = new Set(desc.filter((d) => !stillHidden.has(d.id)).map((d) => d.id));
  return nodes.map((n) => {
    if (n.id === id) {
      const { collapsed: _c, expandedSize, ...data } = n.data;
      void _c;
      const size = expandedSize ?? nodeSize(n);
      const style = { ...(n.style ?? {}), width: size.width, height: size.height };
      return { ...n, width: size.width, height: size.height, style, data: data as DiagramNode['data'] };
    }
    if (show.has(n.id)) {
      const { hidden: _h, ...rest } = n;
      void _h;
      return rest as DiagramNode;
    }
    return n;
  });
}

/** Display edges: endpoints inside a collapsed cluster re-route to it; internal edges vanish; duplicates merge with a count. */
export function projectEdges(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const collapsed = nodes.filter((n) => n.type === 'cluster' && n.data.collapsed);
  if (!collapsed.length) return edges;
  const owner = new Map<string, string>(); // member id -> the visible collapsed card that stands for it
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const d of nodes) {
    if (!d.hidden) continue;
    // climb through hidden ancestors; the first VISIBLE collapsed cluster on the way is the card drawn for this member.
    // (Stopping at the first visible node: a visible box wrongly parented into another collapsed card must not hand its members on.)
    for (let p = d.parentId ? byId.get(d.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      if (p.hidden) continue;
      if (p.type === 'cluster' && p.data.collapsed) owner.set(d.id, p.id);
      break;
    }
  }
  const out: DiagramEdge[] = [];
  const index = new Map<string, number>();
  for (const e of edges) {
    const s = owner.get(e.source) ?? e.source;
    const t = owner.get(e.target) ?? e.target;
    if (s === t) continue;
    const moved = s !== e.source || t !== e.target;
    if (!moved) {
      out.push(e);
      continue;
    }
    const key = `${s}->${t}|${typeof e.label === 'string' ? e.label : ''}`;
    const at = index.get(key);
    if (at !== undefined) {
      const first = out[at];
      const n = (first.data?.merged ?? 1) + 1;
      const base = typeof e.label === 'string' ? e.label : '';
      out[at] = { ...first, label: base ? `${base} ×${n}` : `×${n}`, data: { ...first.data, merged: n } };
    } else {
      index.set(key, out.length);
      out.push({ ...e, source: s, target: t });
    }
  }
  return out;
}
