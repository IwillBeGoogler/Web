import type { DiagramEdge, DiagramNode } from '../../types';
import type { Route } from '../routing';
import { resolveEdgeStyle, type Settings } from '../settings';
import { buildFlowPaths, type FlowEdgeIn, type FlowPath } from './paths';
import { edgeFlows, resolveFlowDir, resolveFlowLook } from './resolve';
import type { TraceEdge } from './trace';

type S = Pick<Settings, 'edge'> & Partial<Pick<Settings, 'edgePresets'>>;

/** Flow lines for a page: only edges that flow (page mode / per-edge override) and have a direction; junction chains stitched. */
export function collectFlowPaths(nodes: DiagramNode[], edges: DiagramEdge[], routes: Map<string, Route>, settings: S, pageFlow: boolean): FlowPath[] {
  const junctions = new Set(nodes.filter((n) => n.type === 'junction').map((n) => n.id));
  const ins: FlowEdgeIn[] = [];
  for (const e of edges) {
    if (e.hidden || !edgeFlows(e.data, pageFlow)) continue;
    const r = routes.get(e.id);
    if (!r || r.points.length < 2) continue;
    const v = resolveEdgeStyle(e.data ?? {}, settings as never);
    const dir = resolveFlowDir(e.data, v.arrows);
    if (!dir) continue;
    ins.push({ id: e.id, source: e.source, target: e.target, points: r.points, color: v.color, look: resolveFlowLook(e.data, settings.edgePresets ?? []), dir });
  }
  return buildFlowPaths(ins, (id) => junctions.has(id));
}

/** every edge's packet direction (for tracing, independent of whether flow is currently on) */
export function traceEdges(edges: DiagramEdge[], settings: S): TraceEdge[] {
  return edges.map((e) => ({ id: e.id, source: e.source, target: e.target, dir: resolveFlowDir(e.data, resolveEdgeStyle(e.data ?? {}, settings as never).arrows) }));
}

/** tooltip text for an edge: label + flow stats */
export function flowTip(e: DiagramEdge, route: Route | undefined, settings: S, pageFlow: boolean): string {
  const v = resolveEdgeStyle(e.data ?? {}, settings as never);
  const dir = resolveFlowDir(e.data, v.arrows);
  const label = typeof e.label === 'string' && e.label ? e.label : 'Edge';
  if (!edgeFlows(e.data, pageFlow) || !dir) return label;
  const look = resolveFlowLook(e.data, settings.edgePresets ?? []);
  const len = route ? Math.round(route.points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y), 0)) : 0;
  const count = len < 8 ? 0 : Math.max(1, Math.round((len / 100) * look.density));
  return `${label}\nflow: ${dir}, ${look.speed}, ${look.style}s · ${look.density}/100px · ${count} packet${count === 1 ? '' : 's'} on ${len}px`;
}
