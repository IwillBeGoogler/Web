// autoLayout / buildNodes / wrapColumns / relax in internal/ui/assets/app.js,
// reworked as a pure function over measured-by-formula table sizes.
import type { DiagramEdge, DiagramNode } from '../../types';
import { relationOf } from './tableData';
import { nodeSize } from '../graph';

export const GAP_X = 170;
export const GAP_Y = 56;

export interface LayoutOptions {
  /** top-left of the whole drawing */
  origin?: { x: number; y: number };
  /** ids that keep their position (others are arranged around them) - only used for ordering hints */
  fixed?: Set<string>;
}
interface LNode { id: string; w: number; h: number; depth: number; lane: number; x: number; y: number; links: Set<string>; parents: Set<string>; children: Set<string> }

/** [parent, child] of a relation edge: the source is the referenced table except for N:1 */
export function parentChild(e: DiagramEdge): [string, string] {
  const r = relationOf(e);
  return r?.cardinality === 'N:1' ? [e.target, e.source] : [e.source, e.target];
}

/** Break cycles by dropping DFS back edges; returns the acyclic [parent, child] list. */
function acyclic(ids: string[], pairs: [string, string][]): [string, string][] {
  const out = new Map<string, string[]>();
  for (const [p, c] of pairs) (out.get(p) ?? out.set(p, []).get(p)!).push(c);
  const state = new Map<string, 0 | 1 | 2>();
  const keep: [string, string][] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of out.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) continue; // back edge: ignored for ordering
      keep.push([u, v]);
      if (s === 0) visit(v);
    }
    state.set(u, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  return keep;
}

/**
 * Layered ER layout: depth = longest foreign-key path from a root (parents sit left of their children when the graph is
 * acyclic), tall layers wrap into lanes, rows inside a layer are ordered by the barycentre of their neighbours (fewer crossings),
 * then relaxed towards the centre of what they join and packed. Unrelated groups are packed in compact shelves below.
 */
export function layoutTables(nodes: DiagramNode[], edges: DiagramEdge[], opts: LayoutOptions = {}): Map<string, { x: number; y: number }> {
  const tables = nodes.filter((n) => n.type === 'table');
  const byId = new Map<string, LNode>();
  for (const n of tables) {
    const s = nodeSize(n);
    byId.set(n.id, { id: n.id, w: s.width, h: s.height, depth: 0, lane: 0, x: 0, y: 0, links: new Set(), parents: new Set(), children: new Set() });
  }
  const pairs: [string, string][] = [];
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue;
    const [p, c] = parentChild(e);
    pairs.push([p, c]);
    byId.get(p)!.links.add(c);
    byId.get(c)!.links.add(p);
  }
  const dag = acyclic([...byId.keys()], pairs);
  for (const [p, c] of dag) { byId.get(p)!.children.add(c); byId.get(c)!.parents.add(p); }

  // connected groups, biggest first (the schema someone opened the page for sits top-left)
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of byId.keys()) {
    if (seen.has(id)) continue;
    const g: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      g.push(u);
      for (const v of byId.get(u)!.links) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    groups.push(g);
  }
  groups.sort((a, b) => b.length - a.length);

  const placed: { ids: string[]; left: number; top: number; w: number; h: number }[] = [];
  for (const g of groups) {
    const nodesIn = g.map((id) => byId.get(id)!);
    layoutGroup(nodesIn, byId);
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of nodesIn) { l = Math.min(l, n.x); t = Math.min(t, n.y); r = Math.max(r, n.x + n.w); b = Math.max(b, n.y + n.h); }
    placed.push({ ids: g, left: l, top: t, w: r - l, h: b - t });
  }
  const origin = opts.origin ?? { x: 0, y: 0 };
  const out = new Map<string, { x: number; y: number }>();
  if (!placed.length) return out;
  const main = placed[0];
  const shelfW = Math.max(main.w, 760);
  let rowX = 0, rowY = 0, rowH = 0;
  placed.forEach((g, i) => {
    let dx: number, dy: number;
    if (i === 0) { dx = -g.left; dy = -g.top; rowY = g.h + GAP_Y * 2; }
    else {
      if (rowX > 0 && rowX + g.w > shelfW) { rowY += rowH + GAP_Y; rowX = 0; rowH = 0; }
      dx = rowX - g.left; dy = rowY - g.top;
      rowX += g.w + GAP_X * 0.6;
      rowH = Math.max(rowH, g.h);
    }
    for (const id of g.ids) { const n = byId.get(id)!; out.set(id, { x: Math.round(n.x + dx + origin.x), y: Math.round(n.y + dy + origin.y) }); }
  });
  return out;
}

function layoutGroup(group: LNode[], all: Map<string, LNode>): void {
  const inGroup = new Set(group.map((n) => n.id));
  // depth: longest path from a root over the acyclic edges
  const memo = new Map<string, number>();
  const depthOf = (n: LNode): number => {
    const hit = memo.get(n.id);
    if (hit !== undefined) return hit;
    memo.set(n.id, 0);
    let d = 0;
    for (const p of n.parents) if (inGroup.has(p)) d = Math.max(d, depthOf(all.get(p)!) + 1);
    memo.set(n.id, d);
    return d;
  };
  group.forEach((n) => { n.depth = depthOf(n); });
  // roots slide right next to their nearest child: a lookup table far left of its only child would otherwise drag a long line across the diagram
  for (let pass = 0; pass < 3; pass++)
    for (const n of group) {
      const kids = [...n.children].filter((c) => inGroup.has(c)).map((c) => all.get(c)!.depth);
      if (n.parents.size === 0 && kids.length) n.depth = Math.max(n.depth, Math.min(...kids) - 1);
    }
  const maxDepth = Math.max(...group.map((n) => n.depth));
  const layers: LNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  group.forEach((n) => layers[n.depth].push(n));
  // initial order: input order, then barycentre sweeps
  const idx = (n: LNode, layer: LNode[]) => layer.indexOf(n);
  const bary = (n: LNode, ref: LNode[]) => {
    const pos = [...n.links].filter((id) => inGroup.has(id)).map((id) => all.get(id)!).filter((o) => ref.includes(o)).map((o) => idx(o, ref));
    return pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : -1;
  };
  for (let sweep = 0; sweep < 6; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i);
    for (const li of order) {
      const ref = layers[down ? li - 1 : li + 1];
      if (!ref) continue;
      const cur = layers[li];
      const keyed = cur.map((n, i) => ({ n, k: bary(n, ref), i }));
      keyed.sort((a, b) => (a.k < 0 || b.k < 0 ? a.i - b.i : a.k - b.k || a.i - b.i));
      // nodes without neighbours in `ref` keep their slot
      const slots = keyed.filter((x) => x.k >= 0);
      const fixedSlots = keyed.filter((x) => x.k < 0);
      const merged: LNode[] = new Array(cur.length);
      fixedSlots.forEach((x) => { merged[x.i] = x.n; });
      let si = 0;
      for (let i = 0; i < merged.length; i++) if (!merged[i]) merged[i] = slots[si++].n;
      layers[li] = merged;
    }
  }
  // wrap tall layers into lanes of roughly screen aspect
  let total = 0;
  group.forEach((n) => { total += n.h + GAP_Y; });
  const avgW = group.reduce((a, n) => a + n.w, 0) / group.length;
  const target = Math.max(640, Math.sqrt((total * (avgW + GAP_X)) / 1.7));
  let lanesBefore = 0;
  const laneList: LNode[][] = [];
  layers.forEach((layer) => {
    const tall = layer.reduce((a, n) => a + n.h + GAP_Y, 0);
    const lanes = Math.max(1, Math.ceil(tall / target));
    const budget = tall / lanes;
    let lane = 0, used = 0;
    for (const n of layer) {
      if (used > 0 && used + n.h / 2 > budget && lane < lanes - 1) { lane++; used = 0; }
      n.lane = lanesBefore + lane;
      (laneList[n.lane] ??= []).push(n);
      used += n.h + GAP_Y;
    }
    lanesBefore += lanes;
  });
  const lanes = laneList.filter(Boolean);
  // x per lane
  let x = 0;
  for (const lane of lanes) {
    const w = Math.max(...lane.map((n) => n.w));
    for (const n of lane) n.x = x;
    x += w + GAP_X;
  }
  // y: stack, then relax towards the centre of neighbours, separate, close gaps
  for (const lane of lanes) {
    let y = 0;
    for (const n of lane) { n.y = y; y += n.h + GAP_Y; }
  }
  const separate = (lane: LNode[]) => {
    const s = [...lane].sort((a, b) => a.y - b.y);
    for (let i = 1; i < s.length; i++) s[i].y = Math.max(s[i].y, s[i - 1].y + s[i - 1].h + GAP_Y);
  };
  for (let round = 0; round < 24; round++) {
    const seq = round % 2 === 0 ? lanes : [...lanes].reverse();
    for (const lane of seq) {
      for (const n of lane) {
        const ls = [...n.links].filter((id) => inGroup.has(id)).map((id) => all.get(id)!).filter((o) => o.lane !== n.lane);
        if (!ls.length) continue;
        const want = ls.reduce((a, o) => a + o.y + o.h / 2, 0) / ls.length - n.h / 2;
        n.y += (want - n.y) * 0.6;
      }
      separate(lane);
    }
  }
  for (const lane of lanes) {
    separate(lane);
  }
  const top = Math.min(...group.map((n) => n.y));
  for (const n of group) n.y -= top;
  // tidy: lanes slide up as one piece to just under the top
  for (const lane of lanes) {
    const lt = Math.min(...lane.map((n) => n.y));
    if (lt > GAP_Y * 3) for (const n of lane) n.y -= lt - GAP_Y;
  }
}
