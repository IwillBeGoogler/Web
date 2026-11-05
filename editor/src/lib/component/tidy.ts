import type { DiagramEdge, DiagramNode } from '../../types';
import { sortParentsFirst } from '../graph';
import { withShapeSize } from '../uml2/sizes';
import { COMP_PAD, layoutComponents } from './layout';
import { diagramToComponentModel, isCompNode } from './convert';

/** Auto-layout the components on the page (clients left of providers, nodes sized around the components inside them). */
export function tidyComponents(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const model = diagramToComponentModel(nodes, edges);
  if (!model.comps.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxes = layoutComponents(model, (c) => { const n = byId.get(c.id); return n?.width && n.height ? { w: n.width, h: n.height } : undefined; });
  const inModel = new Set(model.comps.map((c) => c.id));
  const hasKids = new Set(model.comps.filter((c) => c.parent).map((c) => c.parent!));
  const tops = nodes.filter((n) => inModel.has(n.id) && !(n.parentId && inModel.has(n.parentId)));
  const ox = Math.min(...tops.map((n) => n.position.x)), oy = Math.min(...tops.map((n) => n.position.y));
  const next = nodes.map((n) => {
    const b = boxes.get(n.id);
    if (!b || !inModel.has(n.id)) return n;
    const nested = !!(n.parentId && inModel.has(n.parentId));
    const position = nested ? { x: b.x, y: b.y } : { x: b.x + ox, y: b.y + oy };
    if (hasKids.has(n.id)) return { ...n, position, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h }, data: { ...n.data, container: true } } as DiagramNode;
    return { ...n, position };
  });
  return { nodes: next, count: model.comps.length };
}

/** Put the selected top level components into a new deployment node (a container the components are children of). */
export function nestInNode(nodes: DiagramNode[], ids: string[], containerId: string): DiagramNode[] | null {
  const pick = nodes.filter((n) => ids.includes(n.id) && isCompNode(n) && !n.parentId);
  if (!pick.length) return null;
  const rect = (n: DiagramNode) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 150, h: n.height ?? 72 });
  const minX = Math.min(...pick.map((n) => rect(n).x)), minY = Math.min(...pick.map((n) => rect(n).y));
  const maxX = Math.max(...pick.map((n) => rect(n).x + rect(n).w)), maxY = Math.max(...pick.map((n) => rect(n).y + rect(n).h));
  const x = minX - COMP_PAD.x, y = minY - COMP_PAD.top, w = maxX - minX + COMP_PAD.x * 2, h = maxY - minY + COMP_PAD.top + COMP_PAD.bottom;
  const box = withShapeSize({ id: containerId, type: 'component', position: { x, y }, data: { label: 'Node', compKind: 'node', accent: pick[0].data.accent, container: true } } as unknown as DiagramNode);
  const container = { ...box, width: w, height: h, style: { ...(box.style ?? {}), width: w, height: h } } as DiagramNode;
  const picked = new Set(pick.map((n) => n.id));
  const moved = nodes.map((n) => (picked.has(n.id) ? { ...n, parentId: containerId, position: { x: n.position.x - x, y: n.position.y - y }, selected: false } : n));
  return sortParentsFirst([...moved, { ...container, selected: true }]);
}

/** Take the selected components out of the node they are nested in (the node stays; it shrinks back to its own size when empty). */
export function unnestComponents(nodes: DiagramNode[], ids: string[]): DiagramNode[] | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = nodes.filter((n) => ids.includes(n.id) && n.parentId && byId.get(n.parentId)?.type === 'component');
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
    return withShapeSize({ ...n, data: data as DiagramNode['data'] });
  });
}
