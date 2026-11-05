import { activitySize } from './sizes';
import type { ActivityModel, LaneOrient } from './types';

export interface Box { x: number; y: number; w: number; h: number }
export interface ActivityLayout {
  /** activity nodes (absolute) */
  boxes: Map<string, Box>;
  /** lanes (absolute) */
  lanes: Map<string, Box>;
  orientation: LaneOrient;
  /** fork / join bars drawn vertically (left to right flow) */
  vertical: Set<string>;
}

export const ACT_GAP = { layer: 54, cross: 36, lanePad: 26, header: 36, margin: 24, minLane: 190, note: 24 } as const;

/** Edges that close a cycle (found by depth first search): they are ignored for ranking and drawn as loops back. */
export function backEdges(ids: string[], flows: { from: string; to: string }[]): Set<number> {
  const out = new Map<string, number[]>();
  flows.forEach((f, i) => { if (!out.has(f.from)) out.set(f.from, []); out.get(f.from)!.push(i); });
  const hasIn = new Set(flows.map((f) => f.to));
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<number>();
  const visit = (start: string) => {
    const stack: { id: string; k: number }[] = [{ id: start, k: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id) ?? [];
      if (top.k >= list.length) { state.set(top.id, 2); stack.pop(); continue; }
      const i = list[top.k++];
      const to = flows[i].to;
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(i);
      else if (s === 0) { state.set(to, 1); stack.push({ id: to, k: 0 }); }
    }
  };
  for (const id of ids) if (!hasIn.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  return back;
}

/**
 * Auto-layout of an activity diagram: nodes are put in layers by longest path (loops are ignored for ranking), ordered inside a
 * layer by their neighbours; lanes become columns (flow top down) or rows (flow left to right) sized to hold their nodes.
 */
export function layoutActivity(model: ActivityModel): ActivityLayout {
  const orient: LaneOrient = model.orientation ?? 'v';
  const horizontal = orient === 'h';
  const real = model.nodes.filter((n) => n.kind !== 'note');
  const ids = real.map((n) => n.id);
  const idSet = new Set(ids);
  const vertical = new Set<string>();
  const size = new Map<string, { w: number; h: number }>();
  for (const n of model.nodes) {
    if (n.kind === 'fork' && horizontal) vertical.add(n.id);
    const s = activitySize({ label: n.name, actKind: n.kind, vertical: n.kind === 'fork' ? (horizontal ? true : !!n.vertical) : undefined, objectState: n.state });
    size.set(n.id, { w: s.width, h: s.height });
  }
  // abstract axes: `cross` runs across lanes, `main` along the flow
  const cross = (id: string) => (horizontal ? size.get(id)!.h : size.get(id)!.w);
  const main = (id: string) => (horizontal ? size.get(id)!.w : size.get(id)!.h);

  const flows = model.flows.filter((f) => !f.note && idSet.has(f.from) && idSet.has(f.to) && f.from !== f.to);
  const back = backEdges(ids, flows);
  const fwd = flows.filter((_, i) => !back.has(i));
  const preds = new Map<string, string[]>(), succs = new Map<string, string[]>();
  for (const id of ids) { preds.set(id, []); succs.set(id, []); }
  for (const f of fwd) { preds.get(f.to)!.push(f.from); succs.get(f.from)!.push(f.to); }

  // longest path layering
  const layer = new Map<string, number>();
  const rank = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    layer.set(id, 0);
    const r = preds.get(id)!.reduce((m, p) => Math.max(m, rank(p) + 1), 0);
    layer.set(id, r);
    return r;
  };
  for (const id of ids) rank(id);
  const nLayers = ids.length ? Math.max(...ids.map((i) => layer.get(i)!)) + 1 : 0;

  // lanes: nodes without one take the lane of a neighbour
  const laneIdx = new Map(model.lanes.map((l, i) => [l.id, i]));
  const lane = new Map<string, number>();
  for (const n of real) if (n.lane && laneIdx.has(n.lane)) lane.set(n.id, laneIdx.get(n.lane)!);
  if (model.lanes.length) {
    for (let it = 0; it < 3; it++) {
      for (const id of ids) {
        if (lane.has(id)) continue;
        const nb = [...preds.get(id)!, ...succs.get(id)!].find((x) => lane.has(x));
        if (nb !== undefined) lane.set(id, lane.get(nb)!);
      }
    }
    for (const id of ids) if (!lane.has(id)) lane.set(id, 0);
  } else for (const id of ids) lane.set(id, 0);
  const nLanes = Math.max(1, model.lanes.length);

  // order inside the cells (layer x lane): by lane, then by the mean slot of the neighbours
  const cells: string[][][] = Array.from({ length: nLayers }, () => Array.from({ length: nLanes }, () => []));
  for (const id of ids) cells[layer.get(id)!][lane.get(id)!].push(id);
  const slot = new Map<string, number>();
  const reslot = () => cells.forEach((row) => { let k = 0; for (const c of row) for (const id of c) slot.set(id, k++); });
  reslot();
  const bary = (id: string, nbs: string[]) => (nbs.length ? nbs.reduce((s, x) => s + (slot.get(x) ?? 0), 0) / nbs.length : slot.get(id)!);
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? [...Array(nLayers).keys()] : [...Array(nLayers).keys()].reverse();
    for (const r of order) {
      for (const c of cells[r]) {
        const key = new Map(c.map((id) => [id, bary(id, down ? preds.get(id)! : succs.get(id)!)]));
        c.sort((a, b) => key.get(a)! - key.get(b)! || ids.indexOf(a) - ids.indexOf(b));
      }
      reslot();
    }
  }

  // notes sit next to the node they comment on and reserve room on the cross axis
  const noteOf = new Map<string, string[]>();
  for (const f of model.flows) {
    if (!f.note) continue;
    const a = model.nodes.find((n) => n.id === f.from), b = model.nodes.find((n) => n.id === f.to);
    const note = a?.kind === 'note' ? a : b?.kind === 'note' ? b : undefined;
    const target = note === a ? b : a;
    if (note && target && target.kind !== 'note' && idSet.has(target.id)) {
      if (!noteOf.has(target.id)) noteOf.set(target.id, []);
      noteOf.get(target.id)!.push(note.id);
    }
  }
  const noteExtra = (id: string) => (noteOf.get(id) ?? []).reduce((m, n) => Math.max(m, cross(n)), 0);
  const span = (id: string) => cross(id) + (noteOf.has(id) ? ACT_GAP.note + noteExtra(id) : 0);

  const hasLanes = model.lanes.length > 0;
  const pad = hasLanes ? ACT_GAP.lanePad : 0;
  const header = hasLanes ? ACT_GAP.header : 0;
  const cellSpan = (c: string[]) => c.reduce((s, id) => s + span(id), 0) + Math.max(0, c.length - 1) * ACT_GAP.cross;
  const laneW = Array.from({ length: nLanes }, (_, l) => Math.max(hasLanes ? ACT_GAP.minLane : 0, 2 * pad + Math.max(0, ...cells.map((row) => cellSpan(row[l])))));
  const laneOff: number[] = [];
  laneW.reduce((o, w, i) => { laneOff[i] = o; return o + w; }, hasLanes ? 0 : ACT_GAP.margin);
  const totalCross = laneW.reduce((a, b) => a + b, 0);

  // main axis: layers one after another
  const layerMain = cells.map((row) => Math.max(0, ...row.flat().map(main)));
  const layerStart: number[] = [];
  layerMain.reduce((o, m, i) => { layerStart[i] = o; return o + m + ACT_GAP.layer; }, header + ACT_GAP.margin);
  const totalMain = (nLayers ? layerStart[nLayers - 1] + layerMain[nLayers - 1] : header) + ACT_GAP.margin;

  const pos = new Map<string, { c: number; m: number }>(); // top-left, abstract
  cells.forEach((row, r) => row.forEach((c, l) => {
    let at = laneOff[l] + (laneW[l] - cellSpan(c)) / 2;
    for (const id of c) {
      pos.set(id, { c: at, m: layerStart[r] + (layerMain[r] - main(id)) / 2 });
      at += span(id) + ACT_GAP.cross;
    }
  }));
  // fork / join bars span the nodes they connect
  const crossSize = new Map(ids.map((id) => [id, cross(id)]));
  for (const n of real) {
    if (n.kind !== 'fork' || (n.vertical && !horizontal)) continue;
    const nb = [...preds.get(n.id)!, ...succs.get(n.id)!].filter((x) => pos.has(x));
    if (!nb.length) continue;
    const lo = Math.min(...nb.map((x) => pos.get(x)!.c)), hi = Math.max(...nb.map((x) => pos.get(x)!.c + cross(x)));
    const w = Math.max(cross(n.id), hi - lo);
    crossSize.set(n.id, w);
    pos.set(n.id, { c: (lo + hi) / 2 - w / 2, m: pos.get(n.id)!.m });
  }

  const toBox = (c: number, m: number, cs: number, ms: number): Box => (horizontal ? { x: m, y: c, w: ms, h: cs } : { x: c, y: m, w: cs, h: ms });
  const boxes = new Map<string, Box>();
  for (const id of ids) { const p = pos.get(id)!; boxes.set(id, toBox(p.c, p.m, crossSize.get(id)!, main(id))); }
  for (const [target, notes] of noteOf) {
    const t = pos.get(target)!;
    let off = 0;
    for (const nid of notes) {
      boxes.set(nid, toBox(t.c + cross(target) + ACT_GAP.note, t.m + off, cross(nid), main(nid)));
      off += main(nid) + 10;
    }
  }
  // notes that comment on nothing go below the diagram
  let strayAt = totalMain;
  for (const n of model.nodes) if (n.kind === 'note' && !boxes.has(n.id)) { boxes.set(n.id, toBox(laneOff[0] ?? ACT_GAP.margin, strayAt, cross(n.id), main(n.id))); strayAt += main(n.id) + 10; }

  const lanes = new Map<string, Box>();
  model.lanes.forEach((l, i) => lanes.set(l.id, toBox(laneOff[i], 0, laneW[i], Math.max(totalMain, strayAt))));
  void totalCross;
  return { boxes, lanes, orientation: orient, vertical };
}
