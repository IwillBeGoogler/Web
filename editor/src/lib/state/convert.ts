import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { layoutStates, stateSize } from './layout';
import { STATE_ACCENT, isBorderPoint, type NoteDef, type StateDef, type StateModel, type StateNodeData, type TransitionDef } from './types';

/**
 * Transitions that cross a composite's border are routed through its entry point (going in) or exit point (going out), when it has one:
 * `A -> inner` becomes `A -> entry`, `entry -> inner`; `inner -> B` becomes `inner -> exit`, `exit -> B`. Already routed transitions stay as they are.
 */
export function routeViaBorderPoints(model: StateModel): TransitionDef[] {
  const byId = new Map(model.states.map((s) => [s.id, s]));
  const chain = (id: string): string[] => { const out: string[] = []; for (let c = byId.get(id)?.parent; c; c = byId.get(c)?.parent) out.push(c); return out; };
  const pointOf = (comp: string, kind: 'entryPoint' | 'exitPoint') => model.states.find((s) => s.parent === comp && s.kind === kind)?.id;
  const out: TransitionDef[] = [];
  for (const t of model.transitions) {
    const a = byId.get(t.from), b = byId.get(t.to);
    if (!a || !b) { out.push(t); continue; }
    const ca = chain(t.from), cb = chain(t.to);
    // outermost composite the target is inside of but the source is not (entering); the source's counterpart for leaving
    const enter = [...cb].reverse().find((c) => !ca.includes(c) && c !== t.from);
    const leave = [...ca].reverse().find((c) => !cb.includes(c) && c !== t.to);
    const entry = enter && !isBorderPoint(b.kind) ? pointOf(enter, 'entryPoint') : undefined;
    const exit = leave && !isBorderPoint(a.kind) ? pointOf(leave, 'exitPoint') : undefined;
    if (!entry && !exit) { out.push(t); continue; }
    const path = [t.from, exit, entry, t.to].filter((x): x is string => !!x);
    path.slice(1).forEach((to, i) => out.push({ from: path[i], to, label: i === 0 ? t.label : '' }));
  }
  return out;
}

export const stateOf = (n: DiagramNode): StateNodeData => n.data as unknown as StateNodeData;
export const isCompositeNode = (n: DiagramNode | undefined): boolean => n?.type === 'group' && n.data.variant === 'composite';
export const isStateLike = (n: DiagramNode | undefined): boolean => n?.type === 'state' || isCompositeNode(n);

/** a state node (or fork / join / ...) at a position, sized from its content */
export function stateNode(id: string, position: { x: number; y: number }, d: Partial<StateNodeData> & { label: string }, parentId?: string): DiagramNode {
  const data: StateNodeData = { stateKind: 'state', accent: STATE_ACCENT, ...d };
  const { w, h } = stateSize({ kind: data.stateKind, name: data.label, activity: data.activity, vertical: data.vertical });
  return { id, type: 'state', position, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}), data: data as unknown as DiagramNode['data'] } as DiagramNode;
}
export function compositeNode(id: string, position: { x: number; y: number }, label: string, w = 360, h = 220, parentId?: string): DiagramNode {
  return {
    id, type: 'group', position, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}),
    data: { label, variant: 'composite', accent: STATE_ACCENT, stroke: STATE_ACCENT, fillOpacity: 6, border: true },
  } as DiagramNode;
}
/** re-fit a state node after its label / activity / kind changed */
export function withStateSize(n: DiagramNode): DiagramNode {
  const d = stateOf(n);
  const { w, h } = stateSize({ kind: d.stateKind, name: d.label, activity: d.activity, vertical: d.vertical });
  return { ...n, width: w, height: h, style: { ...(n.style ?? {}), width: w, height: h } };
}

export function stateModelToDiagram(model: StateModel, origin = { x: 0, y: 0 }): Diagram {
  const boxes = layoutStates(model);
  const ids = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  const depth = (s: StateDef): number => (s.parent ? 1 + depth(model.states.find((x) => x.id === s.parent) ?? { ...s, parent: undefined }) : 0);
  const order = [...model.states].sort((a, b) => depth(a) - depth(b));
  order.forEach((s, i) => ids.set(s.id, `st${i + 1}`));
  for (const s of order) {
    const b = boxes.get(s.id) ?? { x: 0, y: 0, w: 120, h: 40 };
    const pos = s.parent ? { x: b.x, y: b.y } : { x: b.x + origin.x, y: b.y + origin.y };
    const parentId = s.parent ? ids.get(s.parent) : undefined;
    const id = ids.get(s.id)!;
    if (s.composite) {
      const c = compositeNode(id, pos, s.name, b.w, b.h, parentId);
      if (s.region) c.data = { ...c.data, region: s.region } as DiagramNode['data'];
      nodes.push(c);
    } else {
      const n = stateNode(id, pos, { label: s.name, stateKind: s.kind, ...(s.activity ? { activity: s.activity } : {}), ...(s.region ? { region: s.region } : {}), ...((s.kind === 'fork' || s.kind === 'join') && model.direction === 'LR' ? { vertical: true } : {}) }, parentId);
      nodes.push(n);
    }
  }
  const edges: DiagramEdge[] = routeViaBorderPoints(model)
    .filter((t) => ids.has(t.from) && ids.has(t.to))
    .map((t, i) => umlEdge(`te${i + 1}`, ids.get(t.from)!, ids.get(t.to)!, { kind: 'transition' }, t.label ? { label: t.label } : {}));
  // notes: yellow sticky notes beside their state, joined by a dashed note link
  const absOf = (sid: string): { x: number; y: number; w: number; h: number } => {
    const def = model.states.find((x) => x.id === sid)!;
    const b = boxes.get(sid) ?? { x: 0, y: 0, w: 120, h: 40 };
    if (!def.parent) return { x: b.x + origin.x, y: b.y + origin.y, w: b.w, h: b.h };
    const p = absOf(def.parent);
    return { x: p.x + b.x, y: p.y + b.y, w: b.w, h: b.h };
  };
  (model.notes ?? []).forEach((n, i) => {
    if (!ids.has(n.target)) return;
    const a = absOf(n.target);
    const W = 190, H = Math.max(50, 24 + 16 * n.text.split('\n').length);
    const pos = n.side === 'left' ? { x: a.x - W - 50, y: a.y } : n.side === 'top' ? { x: a.x, y: a.y - H - 40 } : n.side === 'bottom' ? { x: a.x, y: a.y + a.h + 40 } : { x: a.x + a.w + 50, y: a.y };
    nodes.push({ id: `stn${i + 1}`, type: 'sticky', position: pos, width: W, height: H, data: { label: n.text, umlNote: true, fill: '#fff8c5', stroke: '#c9b037', strokeWidth: 1.2, fontSize: 12, textColor: '#3d3a1e' } } as DiagramNode);
    edges.push(umlEdge(`stl${i + 1}`, `stn${i + 1}`, ids.get(n.target)!, { kind: 'note' }));
  });
  return { version: 1, nodes, edges };
}

export function diagramToStateModel(nodes: DiagramNode[], edges: DiagramEdge[]): StateModel {
  const mine = nodes.filter(isStateLike);
  const set = new Set(mine.map((n) => n.id));
  const states: StateDef[] = mine.map((n) => {
    if (isCompositeNode(n)) return { id: n.id, name: n.data.label, kind: 'state', composite: true, ...((n.data as { region?: number }).region ? { region: (n.data as { region?: number }).region } : {}), ...(n.parentId && set.has(n.parentId) ? { parent: n.parentId } : {}) };
    const d = stateOf(n);
    return { id: n.id, name: d.label, kind: d.stateKind, ...(d.activity ? { activity: d.activity } : {}), ...(d.region ? { region: d.region } : {}), ...(n.parentId && set.has(n.parentId) ? { parent: n.parentId } : {}) };
  });
  const transitions = edges
    .filter((e) => (e.data?.uml as { kind?: string } | undefined)?.kind === 'transition' && set.has(e.source) && set.has(e.target))
    .map((e) => ({ from: e.source, to: e.target, label: typeof e.label === 'string' ? e.label : '' }));
  const notes: NoteDef[] = [];
  for (const e of edges) {
    if ((e.data?.uml as { kind?: string } | undefined)?.kind !== 'note') continue;
    const note = nodes.find((n) => n.type === 'sticky' && n.data.umlNote && (n.id === e.source || n.id === e.target));
    const target = mine.find((n) => set.has(n.id) && (n.id === e.source || n.id === e.target) && n !== note);
    if (!note || !target) continue;
    const dx = note.position.x - target.position.x;
    const dy = note.position.y - target.position.y;
    const tw = target.width ?? 0;
    const side: NoteDef['side'] = dx >= tw ? 'right' : dx < 0 && Math.abs(dx) >= Math.abs(dy) ? 'left' : dy < 0 ? 'top' : dy > 0 ? 'bottom' : 'right';
    notes.push({ target: target.id, side, text: String(note.data.label ?? '') });
  }
  return { states, transitions, ...(notes.length ? { notes } : {}) };
}
