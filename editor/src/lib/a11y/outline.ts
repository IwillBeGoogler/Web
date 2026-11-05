import type { DiagramEdge, DiagramNode } from '../../types';
import { focusOrder } from './nav';

export interface OutlineConnection {
  id: string;
  /** a sentence a screen reader can read on its own: "API to DB, reads" */
  text: string;
  direction: 'out' | 'in';
  otherId: string;
}
export interface OutlineNode {
  id: string;
  label: string;
  type: string;
  connections: OutlineConnection[];
  children: OutlineNode[];
}
export interface OutlinePage {
  id: string;
  name: string;
  active: boolean;
  nodes: OutlineNode[];
}

const labelOf = (n: DiagramNode): string => (typeof n.data.label === 'string' && n.data.label.trim() ? n.data.label.trim() : `Unnamed ${n.type ?? 'node'}`);

/** Pages > nodes (groups hold their children) > connections: the text alternative of the diagram (screen-reader outline). */
export function buildOutline(pages: { id: string; name: string }[], activeId: string, contentOf: (pageId: string) => { nodes: DiagramNode[]; edges: DiagramEdge[] }): OutlinePage[] {
  return pages.map((p) => {
    const { nodes, edges } = contentOf(p.id);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const make = (n: DiagramNode): OutlineNode => {
      const connections: OutlineConnection[] = [];
      for (const e of edges) {
        const out = e.source === n.id;
        const into = e.target === n.id;
        if (!out && !into) continue;
        const other = byId.get(out ? e.target : e.source);
        if (!other) continue;
        const tail = typeof e.label === 'string' && e.label.trim() ? `, ${e.label.trim()}` : '';
        connections.push({ id: e.id, direction: out ? 'out' : 'in', otherId: other.id, text: `${labelOf(n)} ${out ? 'to' : 'from'} ${labelOf(other)}${tail}` });
      }
      return { id: n.id, label: labelOf(n), type: n.type ?? 'node', connections, children: [] };
    };
    const made = new Map(focusOrder(nodes).map((n) => [n.id, make(n)]));
    const roots: OutlineNode[] = [];
    for (const n of focusOrder(nodes)) {
      const parent = n.parentId ? made.get(n.parentId) : undefined;
      (parent ? parent.children : roots).push(made.get(n.id)!);
    }
    return { id: p.id, name: p.name, active: p.id === activeId, nodes: roots };
  });
}
