import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { umlEdge, umlOf } from '../uml/edges';
import { actorNode, boundaryNode, useCaseNode, withShapeSize } from '../uml2/nodes';
import type { UseCaseData } from '../uml2/types';
import { layoutUseCase } from './layout';
import type { UcRelKind, UseCaseModel } from './types';

export const isBoundaryNode = (n: DiagramNode | undefined): boolean => n?.type === 'group' && n.data.variant === 'boundary';
export const isUseCaseNode = (n: DiagramNode | undefined): boolean => n?.type === 'usecase';
export const isUseCaseLike = (n: DiagramNode | undefined): boolean => isUseCaseNode(n) || isBoundaryNode(n);

const KINDS: UcRelKind[] = ['association', 'include', 'extend', 'generalization'];

export function useCaseModelToDiagram(model: UseCaseModel, origin = { x: 0, y: 0 }): Diagram {
  const lay = layoutUseCase(model);
  const ids = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  model.boundaries.forEach((b, i) => ids.set(b.id, `sys${i + 1}`));
  model.actors.forEach((a, i) => ids.set(a.id, `ac${i + 1}`));
  model.cases.forEach((c, i) => ids.set(c.id, `uc${i + 1}`));
  for (const b of model.boundaries) {
    const box = lay.boundaries.get(b.id);
    if (box) nodes.push(boundaryNode(ids.get(b.id)!, { x: box.x + origin.x, y: box.y + origin.y }, b.name, box.w, box.h));
  }
  for (const a of model.actors) {
    const box = lay.boxes.get(a.id)!;
    nodes.push(actorNode(ids.get(a.id)!, { x: box.x + origin.x, y: box.y + origin.y }, a.name));
  }
  for (const c of model.cases) {
    const box = lay.boxes.get(c.id)!;
    const parent = c.boundary ? lay.boundaries.get(c.boundary) : undefined;
    const n = useCaseNode(ids.get(c.id)!, parent ? { x: box.x - parent.x, y: box.y - parent.y } : { x: box.x + origin.x, y: box.y + origin.y }, c.name);
    const withEps = c.extensionPoints?.length ? withShapeSize({ ...n, data: { ...n.data, extensionPoints: c.extensionPoints } }) : n;
    nodes.push({ ...withEps, ...(parent ? { parentId: ids.get(c.boundary!)! } : {}) } as DiagramNode);
  }
  const edges: DiagramEdge[] = model.relations
    .filter((r) => ids.has(r.from) && ids.has(r.to))
    .map((r, i) =>
      umlEdge(`ue${i + 1}`, ids.get(r.from)!, ids.get(r.to)!, { kind: r.kind, ...(r.fromMult ? { sourceMult: r.fromMult } : {}), ...(r.toMult ? { targetMult: r.toMult } : {}) }, r.label ? { label: r.label } : {}));
  return { version: 1, nodes, edges };
}

export function diagramToUseCaseModel(nodes: DiagramNode[], edges: DiagramEdge[]): UseCaseModel {
  const bounds = nodes.filter(isBoundaryNode);
  const bset = new Set(bounds.map((b) => b.id));
  const uc = nodes.filter(isUseCaseNode);
  const set = new Set(uc.map((n) => n.id));
  const data = (n: DiagramNode) => n.data as unknown as UseCaseData;
  return {
    boundaries: bounds.map((b) => ({ id: b.id, name: String(b.data.label ?? 'System') })),
    actors: uc.filter((n) => data(n).ucKind === 'actor').map((n) => ({ id: n.id, name: data(n).label })),
    cases: uc.filter((n) => data(n).ucKind !== 'actor').map((n) => ({
      id: n.id,
      name: data(n).label,
      ...(data(n).extensionPoints?.length ? { extensionPoints: data(n).extensionPoints } : {}),
      ...(n.parentId && bset.has(n.parentId) ? { boundary: n.parentId } : {}),
    })),
    relations: edges.flatMap((e) => {
      const u = umlOf(e);
      if (!u || !KINDS.includes(u.kind as UcRelKind) || !set.has(e.source) || !set.has(e.target)) return [];
      const label = typeof e.label === 'string' && e.label && e.label !== `«${u.kind}»` ? e.label : undefined;
      return [{ from: e.source, to: e.target, kind: u.kind as UcRelKind, ...(label ? { label } : {}), ...(u.sourceMult ? { fromMult: u.sourceMult } : {}), ...(u.targetMult ? { toMult: u.targetMult } : {}) }];
    }),
  };
}
