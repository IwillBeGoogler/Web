import type { DiagramEdge, DiagramNode } from '../../types';
import { diagramToUseCaseModel, isBoundaryNode, isUseCaseLike } from './convert';
import { layoutUseCase } from './layout';

/** Auto-layout the use case diagram on the page: actors left / right, use cases inside the system boundary. Null when there is none. */
export function tidyUseCase(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const model = diagramToUseCaseModel(nodes, edges);
  if (!model.actors.length && !model.cases.length) return null;
  const lay = layoutUseCase(model);
  const bset = new Set(model.boundaries.map((b) => b.id));
  const tops = nodes.filter((n) => isUseCaseLike(n) && !(n.parentId && bset.has(n.parentId)));
  const ox = tops.length ? Math.min(...tops.map((n) => n.position.x)) : 0;
  const oy = tops.length ? Math.min(...tops.map((n) => n.position.y)) : 0;
  const next = nodes.map((n) => {
    if (isBoundaryNode(n)) {
      const b = lay.boundaries.get(n.id);
      return b ? { ...n, position: { x: b.x + ox, y: b.y + oy }, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h } } : n;
    }
    const b = lay.boxes.get(n.id);
    if (!b) return n;
    const parent = n.parentId && bset.has(n.parentId) ? lay.boundaries.get(n.parentId) : undefined;
    return { ...n, position: parent ? { x: b.x - parent.x, y: b.y - parent.y } : { x: b.x + ox, y: b.y + oy } };
  });
  return { nodes: next, count: model.actors.length + model.cases.length };
}
