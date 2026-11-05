import type { DiagramEdge, DiagramNode } from '../../types';
import { diagramToDeploymentModel } from './convert';
import { sortParentsFirst } from '../graph';
import { DEP_PAD, layoutDeployment } from './layout';
import { deploymentNode, isDeploymentNode } from './nodes';
import { withDeploymentSize } from './sizes';

/** Auto-layout the deployment elements on the page (left to right, nodes sized around what they contain). Null when there is none. */
export function tidyDeployment(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const model = diagramToDeploymentModel(nodes, edges);
  if (!model.nodes.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxes = layoutDeployment(model, (c) => { const n = byId.get(c.id); return n?.width && n.height ? { w: n.width, h: n.height } : undefined; });
  const inModel = new Set(model.nodes.map((c) => c.id));
  const hasKids = new Set(model.nodes.filter((c) => c.parent).map((c) => c.parent!));
  const tops = nodes.filter((n) => inModel.has(n.id) && !(n.parentId && inModel.has(n.parentId)));
  const ox = Math.min(...tops.map((n) => n.position.x)), oy = Math.min(...tops.map((n) => n.position.y));
  const next = nodes.map((n) => {
    const b = boxes.get(n.id);
    if (!b || !isDeploymentNode(n) || !inModel.has(n.id)) return n;
    const nested = !!(n.parentId && inModel.has(n.parentId));
    const position = nested ? { x: b.x, y: b.y } : { x: b.x + ox, y: b.y + oy };
    if (hasKids.has(n.id)) return { ...n, position, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h }, data: { ...n.data, container: true } } as DiagramNode;
    return { ...n, position };
  });
  return { nodes: next, count: model.nodes.length };
}

/** Put the selected top level elements into a new deployment node (a container the elements are children of). */
export function nestInDeploymentNode(nodes: DiagramNode[], ids: string[], containerId: string): DiagramNode[] | null {
  const pick = nodes.filter((n) => ids.includes(n.id) && isDeploymentNode(n) && !n.parentId);
  if (!pick.length) return null;
  const rect = (n: DiagramNode) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 160, h: n.height ?? 96 });
  const minX = Math.min(...pick.map((n) => rect(n).x)), minY = Math.min(...pick.map((n) => rect(n).y));
  const maxX = Math.max(...pick.map((n) => rect(n).x + rect(n).w)), maxY = Math.max(...pick.map((n) => rect(n).y + rect(n).h));
  const x = minX - DEP_PAD.x, y = minY - DEP_PAD.top, w = maxX - minX + DEP_PAD.x * 2, h = maxY - minY + DEP_PAD.top + DEP_PAD.bottom;
  const box = deploymentNode(containerId, { x, y }, 'node', 'Node', { accent: pick[0].data.accent as string, container: true });
  const container = { ...box, width: w, height: h, style: { ...(box.style ?? {}), width: w, height: h }, selected: true } as DiagramNode;
  const picked = new Set(pick.map((n) => n.id));
  const moved = nodes.map((n) => (picked.has(n.id) ? { ...n, parentId: containerId, position: { x: n.position.x - x, y: n.position.y - y }, selected: false } : n));
  return sortParentsFirst([...moved, container]);
}

/** Take the selected elements out of the node they are nested in (an emptied node shrinks back to its own size). */
export function unnestDeployment(nodes: DiagramNode[], ids: string[]): DiagramNode[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = nodes.filter((n) => ids.includes(n.id) && n.parentId && byId.get(n.parentId)?.type === 'deployment');
  if (!out.length) return null;
  const set = new Set(out.map((n) => n.id));
  const parents = new Set(out.map((n) => n.parentId!));
  const next = nodes.map((n) => {
    if (set.has(n.id)) { const p = byId.get(n.parentId!)!; const { parentId: _p, ...rest } = n; return { ...rest, position: { x: p.position.x + n.position.x, y: p.position.y + n.position.y } } as DiagramNode; }
    return n;
  });
  return next.map((n) => {
    if (!parents.has(n.id) || next.some((c) => c.parentId === n.id)) return n;
    const { container: _c, ...data } = n.data as Record<string, unknown>;
    return withDeploymentSize({ ...n, data: data as DiagramNode['data'] });
  });
}
