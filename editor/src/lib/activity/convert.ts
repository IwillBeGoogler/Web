import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { umlEdge, umlOf } from '../uml/edges';
import { layoutActivity } from './layout';
import { activityNode, isActivityNode, isLaneNode, laneNode } from './nodes';
import { withActivitySize } from './sizes';
import type { ActFlow, ActivityData, ActivityModel, LaneOrient } from './types';

export { isActivityNode, isLaneNode, isActivityLike } from './nodes';

/** guards are stored as the edge label `[guard]` */
export const formatGuard = (g: string | undefined): string | undefined => (g?.trim() ? `[${g.trim().replace(/^\[|\]$/g, '')}]` : undefined);
export const parseGuard = (label: unknown): string | undefined => {
  if (typeof label !== 'string') return undefined;
  const t = label.trim().replace(/^\[|\]$/g, '').trim();
  return t || undefined;
};

export function activityModelToDiagram(model: ActivityModel, origin = { x: 0, y: 0 }): Diagram {
  const lay = layoutActivity(model);
  const ids = new Map<string, string>();
  model.lanes.forEach((l, i) => ids.set(l.id, `lane${i + 1}`));
  model.nodes.forEach((n, i) => ids.set(n.id, `act${i + 1}`));
  const nodes: DiagramNode[] = [];
  for (const l of model.lanes) {
    const b = lay.lanes.get(l.id)!;
    nodes.push(laneNode(ids.get(l.id)!, { x: b.x + origin.x, y: b.y + origin.y }, l.name, b.w, b.h, lay.orientation));
  }
  for (const n of model.nodes) {
    const b = lay.boxes.get(n.id)!;
    const lane = n.lane && lay.lanes.get(n.lane);
    const vertical = n.kind === 'fork' && lay.vertical.has(n.id) ? true : n.vertical;
    const base = activityNode(ids.get(n.id)!, { x: b.x + origin.x, y: b.y + origin.y }, n.kind, n.name, { ...(vertical ? { vertical } : {}), ...(n.state ? { objectState: n.state } : {}) });
    const sized = n.kind === 'fork' ? { ...base, width: b.w, height: b.h, style: { ...(base.style ?? {}), width: b.w, height: b.h } } : base;
    nodes.push(lane ? ({ ...sized, parentId: ids.get(n.lane!)!, position: { x: b.x - lane.x, y: b.y - lane.y } } as DiagramNode) : sized);
  }
  const edges: DiagramEdge[] = model.flows
    .filter((f) => ids.has(f.from) && ids.has(f.to))
    .map((f, i) => (f.note
      ? umlEdge(`af${i + 1}`, ids.get(f.from)!, ids.get(f.to)!, { kind: 'note' })
      : umlEdge(`af${i + 1}`, ids.get(f.from)!, ids.get(f.to)!, { kind: 'transition' }, f.guard ? { label: formatGuard(f.guard) } : {})));
  return { version: 1, nodes, edges };
}

export function diagramToActivityModel(nodes: DiagramNode[], edges: DiagramEdge[]): ActivityModel {
  const lanes = nodes.filter(isLaneNode);
  const laneSet = new Set(lanes.map((l) => l.id));
  const acts = nodes.filter(isActivityNode);
  const set = new Set(acts.map((n) => n.id));
  const orient: LaneOrient = lanes.length && lanes.every((l) => l.data.laneOrient === 'h') ? 'h' : 'v';
  const data = (n: DiagramNode) => n.data as unknown as ActivityData;
  const flows: ActFlow[] = edges.flatMap((e): ActFlow[] => {
    if (!set.has(e.source) || !set.has(e.target)) return [];
    const k = umlOf(e)?.kind;
    if (k === 'note') return [{ from: e.source, to: e.target, note: true }];
    if (k !== undefined && k !== 'transition') return [];
    const guard = parseGuard(e.label);
    return [{ from: e.source, to: e.target, ...(guard ? { guard } : {}) }];
  });
  return {
    orientation: orient,
    lanes: lanes.map((l) => ({ id: l.id, name: String(l.data.label ?? 'Lane') })),
    nodes: acts.map((n) => ({
      id: n.id, name: data(n).label ?? '', kind: data(n).actKind,
      ...(n.parentId && laneSet.has(n.parentId) ? { lane: n.parentId } : {}),
      ...(data(n).vertical ? { vertical: true } : {}),
      ...(data(n).objectState ? { state: data(n).objectState } : {}),
    })),
    flows,
  };
}

export { withActivitySize };
