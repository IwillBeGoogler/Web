import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { umlEdge, umlOf } from '../uml/edges';
import { layoutDeployment } from './layout';
import { deploymentNode, isDeploymentNode } from './nodes';
import { withDeploymentSize } from './sizes';
import { DEPLOYMENT_LINK_KINDS, type DeploymentData, type DeploymentLinkKind, type DeploymentModel, type DepDef } from './types';

export { isDeploymentNode } from './nodes';
const dataOf = (n: DiagramNode) => n.data as unknown as DeploymentData;
const isLinkKind = (k: unknown): k is DeploymentLinkKind => (DEPLOYMENT_LINK_KINDS as readonly unknown[]).includes(k);

export function deploymentModelToDiagram(model: DeploymentModel, origin = { x: 0, y: 0 }): Diagram {
  const boxes = layoutDeployment(model);
  const ids = new Map<string, string>();
  const depth = (c: DepDef): number => (c.parent ? 1 + depth(model.nodes.find((x) => x.id === c.parent) ?? { ...c, parent: undefined }) : 0);
  const order = [...model.nodes].sort((a, b) => depth(a) - depth(b));
  order.forEach((c, i) => ids.set(c.id, `dp${i + 1}`));
  const nodes: DiagramNode[] = [];
  for (const c of order) {
    const b = boxes.get(c.id) ?? { x: 0, y: 0, w: 160, h: 96 };
    const parent = c.parent && ids.has(c.parent) ? c.parent : undefined;
    const container = model.nodes.some((x) => x.parent === c.id);
    const base = deploymentNode(ids.get(c.id)!, parent ? { x: b.x, y: b.y } : { x: b.x + origin.x, y: b.y + origin.y }, c.kind, c.name, {
      ...(c.stereotype ? { stereotype: c.stereotype } : {}), ...(c.iconId ? { iconId: c.iconId } : {}), ...(container ? { container: true } : {}),
    });
    nodes.push({
      ...base,
      ...(container ? { width: b.w, height: b.h, style: { ...(base.style ?? {}), width: b.w, height: b.h } } : {}),
      ...(parent ? { parentId: ids.get(parent)! } : {}),
    } as DiagramNode);
  }
  const edges: DiagramEdge[] = [];
  let n = 0;
  for (const l of model.links) {
    if (ids.has(l.from) && ids.has(l.to)) edges.push(umlEdge(`de${++n}`, ids.get(l.from)!, ids.get(l.to)!, { kind: l.kind }, l.label ? { label: l.label } : {}));
  }
  return { version: 1, nodes, edges };
}

export function diagramToDeploymentModel(nodes: DiagramNode[], edges: DiagramEdge[]): DeploymentModel {
  const deps = nodes.filter(isDeploymentNode);
  const set = new Set(deps.map((n) => n.id));
  const defs: DepDef[] = deps.map((n) => {
    const d = dataOf(n);
    return { id: n.id, name: d.label, kind: d.depKind, ...(d.stereotype ? { stereotype: d.stereotype } : {}), ...(d.iconId ? { iconId: d.iconId } : {}), ...(n.parentId && set.has(n.parentId) ? { parent: n.parentId } : {}) };
  });
  const links: DeploymentModel['links'] = [];
  for (const e of edges) {
    const k = umlOf(e)?.kind;
    if (!isLinkKind(k) || !set.has(e.source) || !set.has(e.target)) continue;
    const label = typeof e.label === 'string' && e.label && e.label !== `«${k}»` ? e.label : undefined;
    links.push({ from: e.source, to: e.target, kind: k, ...(label ? { label } : {}) });
  }
  return { nodes: defs, links };
}

export { withDeploymentSize };
