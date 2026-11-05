/** Prototype links: a node jumps to another file (or a node in it). Pure helpers; the UI lives in components/inspector. */
import type { DiagramNode, NodeLink } from '../../types';

export const validLink = (l: unknown): l is NodeLink =>
  typeof l === 'object' && l !== null && typeof (l as NodeLink).fileId === 'string' && (l as NodeLink).fileId.length > 0 && ((l as NodeLink).nodeId === undefined || typeof (l as NodeLink).nodeId === 'string');

export function setLink(nodes: DiagramNode[], id: string, link: NodeLink): DiagramNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, link: link.nodeId ? { fileId: link.fileId, nodeId: link.nodeId } : { fileId: link.fileId } } } : n));
}
export function clearLink(nodes: DiagramNode[], id: string): DiagramNode[] {
  return nodes.map((n) => {
    if (n.id !== id || !n.data.link) return n;
    const { link: _l, ...data } = n.data;
    void _l;
    return { ...n, data };
  });
}

export const nodeHash = (id: string): string => `#node=${encodeURIComponent(id)}`;
export function parseNodeHash(hash: string): string | null {
  const m = /^#node=(.+)$/.exec(hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}
export const linkPath = (projectId: string, l: NodeLink): string => `/p/${projectId}/f/${l.fileId}${l.nodeId ? nodeHash(l.nodeId) : ''}`;

export interface Backlink { fileId: string; fileName: string; nodeId: string; label: string }
/**
 * Every node that links to `target`. A link without a node id points at the whole file: it counts for a file query, and for a node
 * query only when that node is not asked for specifically (a node query matches exact node links).
 */
export function findBacklinks(files: { id: string; name: string; nodes: DiagramNode[] }[], target: NodeLink, o: { includeSelf?: boolean } = {}): Backlink[] {
  const out: Backlink[] = [];
  for (const f of files) {
    if (f.id === target.fileId && !o.includeSelf) continue;
    for (const n of f.nodes) {
      const l = n.data.link;
      if (!validLink(l) || l.fileId !== target.fileId) continue;
      if (target.nodeId && l.nodeId !== target.nodeId) continue;
      out.push({ fileId: f.id, fileName: f.name, nodeId: n.id, label: String(n.data.label ?? '') });
    }
  }
  return out;
}

export const shouldFollow = (e: { meta: boolean; presenting: boolean }): boolean => e.presenting || e.meta;

export type Trail = NodeLink[];
const MAX_TRAIL = 20;
/** remember the place we jump away from (breadcrumb "back") */
export function pushTrail(trail: Trail, from: NodeLink): Trail {
  const last = trail[trail.length - 1];
  if (last && last.fileId === from.fileId && last.nodeId === from.nodeId) return trail;
  return [...trail, from].slice(-MAX_TRAIL);
}
export function popTrail(trail: Trail): { trail: Trail; entry: NodeLink | null } {
  if (!trail.length) return { trail, entry: null };
  return { trail: trail.slice(0, -1), entry: trail[trail.length - 1] };
}
