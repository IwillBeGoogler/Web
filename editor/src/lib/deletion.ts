import type { DiagramEdge, DiagramNode } from '../types';
import { absolutePosition, descendantsOf, sortParentsFirst } from './graph';
import { projectEdges } from '../clusters/collapse';

export interface DeletionResult {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** locked nodes that were NOT deleted (they survive, re-parented if their container is gone) */
  kept: string[];
  removedNodes: number;
  removedEdges: number;
}

/**
 * Delete the given nodes (+ everything inside them) and edges. Locked nodes always survive: a container is
 * still removed, its locked descendants are lifted to the nearest surviving ancestor keeping their absolute position.
 * Edges touching removed nodes go too. A merged display edge (collapsed cluster) expands to all its underlying edges.
 */
export function deleteElements(nodes: DiagramNode[], edges: DiagramEdge[], nodeIds: string[], edgeIds: string[]): DeletionResult {
  const target = new Set<string>();
  for (const id of nodeIds) {
    target.add(id);
    for (const d of descendantsOf(nodes, id)) target.add(d.id);
    // a mind map node takes its whole branch with it
    if (nodes.find((n) => n.id === id)?.type === 'mindmap') {
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of edges) if (e.source === cur && !target.has(e.target)) { target.add(e.target); queue.push(e.target); }
      }
    }
  }
  const kept = nodes.filter((n) => target.has(n.id) && n.data.locked).map((n) => n.id);
  const keptSet = new Set(kept);
  const remove = new Set([...target].filter((id) => !keptSet.has(id)));

  const wantEdges = new Set(edgeIds);
  const underlying = new Set(wantEdges);
  const projected = projectEdges(nodes, edges);
  if (projected !== edges) {
    // every original edge that was folded into a selected display edge
    const sel = projected.filter((e) => wantEdges.has(e.id) && (e.data?.merged ?? 0) > 1);
    for (const m of sel) for (const e of edges) if (sameBundle(nodes, e, m)) underlying.add(e.id);
  }
  const lockedEdge = new Set(edges.filter((e) => e.data?.locked).map((e) => e.id));

  const outNodes = nodes
    .filter((n) => !remove.has(n.id))
    .map((n) => {
      if (!n.parentId || !remove.has(n.parentId)) return n;
      // nearest surviving ancestor
      let up: string | undefined = n.parentId;
      const byId = new Map(nodes.map((x) => [x.id, x]));
      while (up && remove.has(up)) up = byId.get(up)?.parentId;
      const abs = absolutePosition(nodes, n);
      if (up) {
        const pa = absolutePosition(nodes, byId.get(up)!);
        return { ...n, parentId: up, position: { x: abs.x - pa.x, y: abs.y - pa.y } };
      }
      const { parentId: _p, ...rest } = n;
      void _p;
      return { ...rest, position: abs } as DiagramNode;
    });
  const outEdges = edges.filter((e) => !(underlying.has(e.id) && !lockedEdge.has(e.id)) && !remove.has(e.source) && !remove.has(e.target));
  return {
    nodes: sortParentsFirst(outNodes),
    edges: outEdges,
    kept,
    removedNodes: remove.size,
    removedEdges: edges.length - outEdges.length,
  };
}

/** Was this original edge folded into the merged display edge `m`? (same collapsed endpoints and label base) */
function sameBundle(nodes: DiagramNode[], e: DiagramEdge, m: DiagramEdge): boolean {
  const collapsed = nodes.filter((n) => n.type === 'cluster' && n.data.collapsed);
  const owner = (id: string): string => {
    for (const c of collapsed) if (c.id === id || descendantsOf(nodes, c.id).some((d) => d.id === id)) return c.id;
    return id;
  };
  const base = (l: unknown) => (typeof l === 'string' ? l.replace(/ ?×\d+$/, '') : '');
  return owner(e.source) === m.source && owner(e.target) === m.target && base(e.label) === base(m.label);
}
