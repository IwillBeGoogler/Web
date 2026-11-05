import type { DiagramEdge, DiagramNode } from '../../types';
import { diagramToActivityModel, isActivityLike, isLaneNode } from './convert';
import { layoutActivity } from './layout';

/** Auto-layout the activity diagram on the page (layers top down, or left to right with horizontal lanes; lanes respected). Null when there is none. */
export function tidyActivity(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const model = diagramToActivityModel(nodes, edges);
  if (!model.nodes.length) return null;
  const lay = layoutActivity(model);
  const laneSet = new Set(model.lanes.map((l) => l.id));
  const tops = nodes.filter((n) => isActivityLike(n) && !(n.parentId && laneSet.has(n.parentId)));
  const ox = tops.length ? Math.min(...tops.map((n) => n.position.x)) : 0;
  const oy = tops.length ? Math.min(...tops.map((n) => n.position.y)) : 0;
  const next = nodes.map((n) => {
    if (isLaneNode(n)) {
      const b = lay.lanes.get(n.id);
      return b ? { ...n, position: { x: b.x + ox, y: b.y + oy }, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h } } : n;
    }
    const b = lay.boxes.get(n.id);
    if (!b) return n;
    const parent = n.parentId && laneSet.has(n.parentId) ? lay.lanes.get(n.parentId) : undefined;
    const bar = n.data.actKind === 'fork';
    const data = bar ? { ...n.data, vertical: lay.vertical.has(n.id) || (lay.orientation === 'v' ? !!n.data.vertical : true) } : n.data;
    return {
      ...n, data,
      position: parent ? { x: b.x - parent.x, y: b.y - parent.y } : { x: b.x + ox, y: b.y + oy },
      ...(bar ? { width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h } } : {}),
    } as DiagramNode;
  });
  return { nodes: next, count: model.nodes.length };
}
