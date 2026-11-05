import type { DiagramEdge, DiagramNode, DiagramNodeData, EdgeData } from '../types';
import type { Generated } from './profiles/types';
import { sortParentsFirst } from '../lib/graph';

export const NODE_W = 120;
export const NODE_H = 96;
/** a role pill (and the caption line it pushes down) makes an icon node this much taller than its bare box */
export const ROLE_H = 20;
export const HEADER_H = 40;
export const PAD = 24;

interface Meta {
  genPos?: { x: number; y: number };
}

/** Small helper for profile generators: keys are local, ids become `${prefix}-${key}`. */
export class ClusterBuilder {
  nodes: DiagramNode[] = [];
  edges: DiagramEdge[] = [];
  constructor(public prefix: string, private root: { label: string; subtitle?: string; iconId: string; accent: string; profileId: string; params: Record<string, unknown>; warnings: string[]; topology?: string }) {}

  id(key: string): string {
    return key === '' ? this.prefix : `${this.prefix}-${key}`;
  }

  begin(size: { width: number; height: number }): this {
    const r = this.root;
    this.nodes.push({
      id: this.prefix, type: 'cluster', position: { x: 0, y: 0 }, width: size.width, height: size.height, style: { width: size.width, height: size.height },
      data: { label: r.label, ...(r.subtitle ? { subtitle: r.subtitle } : {}), iconId: r.iconId, accent: r.accent, profileId: r.profileId, params: r.params, warnings: r.warnings, ...(r.topology ? { topology: r.topology } : {}), genPos: { x: 0, y: 0 } } as DiagramNodeData & Meta,
    });
    return this;
  }

  /** sub-group (AZ, shard, quorum ...) nested in `parentKey` ('' = the cluster) */
  group(parentKey: string, key: string, label: string, at: { x: number; y: number }, size: { width: number; height: number }, data: Partial<DiagramNodeData> = {}): this {
    this.nodes.push({
      id: this.id(key), type: 'group', parentId: this.id(parentKey), position: at, width: size.width, height: size.height, style: { width: size.width, height: size.height },
      data: { label, strokeStyle: 'dashed', fillOpacity: 0, genPos: at, ...data } as DiagramNodeData,
    });
    return this;
  }

  member(parentKey: string | null, key: string, label: string, at: { x: number; y: number }, data: Partial<DiagramNodeData> & { iconId: string }): this {
    this.nodes.push({
      id: this.id(key), type: 'icon', ...(parentKey !== null ? { parentId: this.id(parentKey) } : {}), position: at, width: NODE_W, height: data.role ? NODE_H + ROLE_H : NODE_H,
      data: { label, genPos: at, ...data } as DiagramNodeData,
    });
    return this;
  }

  edge(from: string, to: string, opts: { label?: string; data?: Partial<EdgeData>; sourceHandle?: string; targetHandle?: string } = {}): this {
    this.edges.push({
      id: `${this.prefix}-e${this.edges.length + 1}`, source: this.id(from), target: this.id(to), sourceHandle: opts.sourceHandle ?? 'right', targetHandle: opts.targetHandle ?? 'left',
      ...(opts.label ? { label: opts.label } : {}), data: { generated: true, ...(opts.data ?? {}) },
    });
    return this;
  }

  /**
   * Edges between members of one row: the next neighbour is reached by a straight side-to-side line, the farther ones by
   * a fan-out underneath the row (bottom to bottom) instead of a detour over the nodes in between. Pinned edges stay.
   */
  private pinRows(): DiagramEdge[] {
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    return this.edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t || s.type !== 'icon' || t.type !== 'icon' || s.parentId !== t.parentId || e.data?.pinSource || e.data?.pinTarget || e.sourceHandle !== 'bottom' || e.targetHandle !== 'top') return e;
      if (Math.abs(s.position.y - t.position.y) > 8) return e;
      const dir = t.position.x > s.position.x ? 1 : -1;
      const between = this.nodes.some((n) => n.type === 'icon' && n.parentId === s.parentId && n.id !== s.id && n.id !== t.id && Math.abs(n.position.y - s.position.y) <= 8 && (n.position.x - s.position.x) * dir > 0 && (n.position.x - t.position.x) * dir < 0);
      const [out, into] = between ? (['bottom', 'bottom'] as const) : dir > 0 ? (['right', 'left'] as const) : (['left', 'right'] as const);
      return { ...e, sourceHandle: out, targetHandle: into, data: { ...e.data, pinSource: out, pinTarget: into } };
    });
  }

  done(size: { width: number; height: number }): Generated {
    return { nodes: sortParentsFirst(this.nodes), edges: this.pinRows(), rootId: this.prefix, size };
  }
}
