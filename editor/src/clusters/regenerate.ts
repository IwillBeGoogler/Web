import type { DiagramEdge, DiagramNode } from '../types';
import { collapseCluster } from './collapse';
import { descendantsOf, sortParentsFirst } from '../lib/graph';
import type { ClusterProfile, Generated } from './profiles/types';

type Params = Record<string, unknown>;

const offsetRoots = (g: Generated, at: { x: number; y: number }): Generated => ({
  ...g,
  nodes: g.nodes.map((n) => {
    if (n.parentId) return n;
    const position = { x: n.position.x + at.x, y: n.position.y + at.y };
    return { ...n, position, data: { ...n.data, genPos: position } };
  }),
});

/** Generate a cluster for `params` and place its root at `at` (outside components are offset along). */
export function instantiate<P extends Params>(profile: ClusterProfile<P>, params: P, prefix: string, at: { x: number; y: number }): Generated {
  return offsetRoots(profile.generate(params, prefix), at);
}

/**
 * Re-generate an existing cluster for new params. Nodes whose ids persist keep their position if the user moved
 * them (position differs from the recorded generated position); untouched nodes follow the new layout.
 * User-added nodes/edges are left alone.
 */
export function regenerateCluster<P extends Params>(nodes: DiagramNode[], edges: DiagramEdge[], clusterId: string, profile: ClusterProfile<P>, params: P): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const root = nodes.find((n) => n.id === clusterId);
  const at = root?.position ?? { x: 0, y: 0 };
  const fresh = instantiate(profile, params, clusterId, at);
  const existing = new Map(nodes.map((n) => [n.id, n]));
  const freshIds = new Set(fresh.nodes.map((n) => n.id));
  const isGenerated = (n: DiagramNode) => !!n.data.genPos && (n.id === clusterId || n.id.startsWith(`${clusterId}-`));

  const merged: DiagramNode[] = fresh.nodes.map((f) => {
    const e = existing.get(f.id);
    if (!e) return f;
    const gp = e.data.genPos as { x: number; y: number } | undefined;
    const userMoved = !!gp && (Math.abs(e.position.x - gp.x) > 0.5 || Math.abs(e.position.y - gp.y) > 0.5);
    const data = { ...e.data, ...f.data } as DiagramNode['data'];
    if (!('partitions' in f.data)) delete data.partitions;
    if (f.id === clusterId) {
      if (e.data.collapsed) {
        data.collapsed = true;
        data.expandedSize = { width: f.width ?? 0, height: f.height ?? 0 };
      }
      return { ...e, data, position: e.position, ...(e.data.collapsed ? {} : { width: f.width, height: f.height, style: f.style }) };
    }
    return { ...e, data, parentId: f.parentId, position: userMoved ? e.position : f.position, width: f.width ?? e.width, height: f.height ?? e.height, ...(f.style ? { style: f.style } : {}) };
  });
  const kept = nodes.filter((n) => !freshIds.has(n.id) && !isGenerated(n));
  let all = sortParentsFirst([...merged, ...kept]);
  if (root?.data.collapsed) {
    const hide = new Set(descendantsOf(all, clusterId).map((d) => d.id));
    all = all.map((n) => (hide.has(n.id) ? { ...n, hidden: true } : n));
  }
  void collapseCluster;

  const ids = new Set(all.map((n) => n.id));
  const isGenEdge = (e: DiagramEdge) => !!e.data?.generated && e.id.startsWith(`${clusterId}-e`);
  const keptEdges = edges.filter((e) => !isGenEdge(e) && ids.has(e.source) && ids.has(e.target));
  return { nodes: all, edges: [...fresh.edges, ...keptEdges] };
}
