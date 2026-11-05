/**
 * Deterministic auto-layout (no AI): layered (Sugiyama-style), orthogonal (layered on a snap grid with orthogonal edges),
 * radial, tree, force-directed (Fruchterman-Reingold with a seeded PRNG) and compact grid. Groups are laid out bottom-up
 * (children first, then the group grows to fit); "tidy selection" lays out only the chosen nodes around their own origin.
 */
import { nodeSize, type CNode, type CPage, type Pt, type Rect } from './types';

export const LAYOUTS = ['layered', 'orthogonal', 'radial', 'tree', 'force', 'grid'] as const;
export type LayoutAlgo = (typeof LAYOUTS)[number];
export interface LayoutOptions {
  direction?: 'LR' | 'TB';
  /** space between nodes (default 60) */
  gap?: number;
  /** PRNG seed of the force layout (default 1) */
  seed?: number;
  /** tidy selection: only these node ids move */
  only?: string[];
  /** tree / radial root (default: first node without incoming edges) */
  rootId?: string;
}

interface Box { id: string; w: number; h: number }
type Pair = [string, string];
const GROUP_PAD = { left: 24, top: 56, right: 24, bottom: 24 };
const SNAP = 20;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** absolute rectangles of every node (parents resolved) */
export function absRects(page: Pick<CPage, 'nodes'>): Map<string, Rect> {
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Rect>();
  const abs = (n: CNode, seen = new Set<string>()): Pt => {
    const p = n.parentId ? byId.get(n.parentId) : undefined;
    if (!p || seen.has(n.id)) return n.position;
    seen.add(n.id);
    const pp = abs(p, seen);
    return { x: pp.x + n.position.x, y: pp.y + n.position.y };
  };
  for (const n of page.nodes) out.set(n.id, { ...abs(n), ...nodeSize(n) });
  return out;
}

// ---------- graph helpers ----------
function adjacency(boxes: Box[], edges: Pair[]) {
  const ids = new Set(boxes.map((b) => b.id));
  const out = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
  const inn = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    if (a === b || !ids.has(a) || !ids.has(b) || seen.has(`${a}\u0000${b}`)) continue;
    seen.add(`${a}\u0000${b}`);
    out.get(a)!.push(b);
    inn.get(b)!.push(a);
  }
  return { out, inn };
}

/** DFS back edges are reversed so the graph is acyclic; deterministic (input order) */
function acyclic(boxes: Box[], out: Map<string, string[]>): Map<string, string[]> {
  const state = new Map<string, 0 | 1 | 2>();
  const dag = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
  const visit = (id: string) => {
    state.set(id, 1);
    for (const t of out.get(id)!) {
      const s = state.get(t) ?? 0;
      if (s === 1) dag.get(t)!.push(id); // back edge: reverse
      else {
        dag.get(id)!.push(t);
        if (s === 0) visit(t);
      }
    }
    state.set(id, 2);
  };
  for (const b of boxes) if (!state.get(b.id)) visit(b.id);
  return dag;
}

// ---------- algorithms (return top-left positions, un-anchored) ----------
function layered(boxes: Box[], edges: Pair[], o: Required<Pick<LayoutOptions, 'direction' | 'gap'>>): Map<string, Pt> {
  const { out } = adjacency(boxes, edges);
  const dag = acyclic(boxes, out);
  const preds = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
  for (const [a, ts] of dag) for (const t of ts) preds.get(t)!.push(a);
  // longest-path layering
  const layer = new Map<string, number>();
  const rank = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    layer.set(id, 0);
    const l = preds.get(id)!.length ? Math.max(...preds.get(id)!.map(rank)) + 1 : 0;
    layer.set(id, l);
    return l;
  };
  boxes.forEach((b) => rank(b.id));
  const nLayers = Math.max(0, ...layer.values()) + 1;
  const layers: string[][] = Array.from({ length: nLayers }, () => []);
  boxes.forEach((b) => layers[layer.get(b.id)!].push(b.id));
  // barycenter ordering sweeps
  const pos = new Map<string, number>();
  const reindex = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  reindex();
  const bary = (id: string, nb: Map<string, string[]>): number => {
    const ns = nb.get(id)!;
    return ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!;
  };
  const succs = dag;
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.map((_, i) => i) : layers.map((_, i) => nLayers - 1 - i);
    for (const li of order) {
      const key = new Map(layers[li].map((id) => [id, bary(id, down ? preds : succs)]));
      layers[li].sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
      reindex();
    }
  }
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const LR = o.direction === 'LR';
  const along = (b: Box) => (LR ? b.w : b.h); // size on the flow axis
  const across = (b: Box) => (LR ? b.h : b.w);
  const extents = layers.map((l) => l.reduce((s, id) => s + across(byId.get(id)!), 0) + o.gap * Math.max(0, l.length - 1));
  const widest = Math.max(0, ...extents);
  const res = new Map<string, Pt>();
  let flow = 0;
  layers.forEach((l, li) => {
    const depth = Math.max(0, ...l.map((id) => along(byId.get(id)!)));
    let cross = (widest - extents[li]) / 2;
    for (const id of l) {
      const b = byId.get(id)!;
      const a = flow + (depth - along(b)) / 2;
      res.set(id, LR ? { x: a, y: cross } : { x: cross, y: a });
      cross += across(b) + o.gap;
    }
    flow += depth + o.gap * 1.6;
  });
  return res;
}

function gridLayout(boxes: Box[], gap: number): Map<string, Pt> {
  const n = boxes.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...boxes.filter((_, i) => i % cols === c).map((b) => b.w)));
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...boxes.slice(r * cols, r * cols + cols).map((b) => b.h)));
  const xs: number[] = [];
  const ys: number[] = [];
  colW.reduce((x, w) => (xs.push(x), x + w + gap), 0);
  rowH.reduce((y, h) => (ys.push(y), y + h + gap), 0);
  return new Map(boxes.map((b, i) => [b.id, { x: xs[i % cols], y: ys[Math.floor(i / cols)] }]));
}

interface TreeNode { id: string; kids: TreeNode[]; depth: number }
function spanningForest(boxes: Box[], edges: Pair[], rootId?: string): TreeNode[] {
  const { out, inn } = adjacency(boxes, edges);
  const seen = new Set<string>();
  const roots: string[] = [];
  if (rootId && boxes.some((b) => b.id === rootId)) roots.push(rootId);
  for (const b of boxes) if (!inn.get(b.id)!.length && b.id !== rootId) roots.push(b.id);
  for (const b of boxes) roots.push(b.id); // leftovers (cycles) start new trees
  const build = (id: string, depth: number): TreeNode => {
    seen.add(id);
    const t: TreeNode = { id, kids: [], depth };
    for (const k of out.get(id)!) if (!seen.has(k)) t.kids.push(build(k, depth + 1));
    return t;
  };
  const trees: TreeNode[] = [];
  for (const r of roots) if (!seen.has(r)) trees.push(build(r, 0));
  return trees;
}

function tree(boxes: Box[], edges: Pair[], o: Required<Pick<LayoutOptions, 'direction' | 'gap'>> & { rootId?: string }): Map<string, Pt> {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const LR = o.direction === 'LR';
  const across = (id: string) => (LR ? byId.get(id)!.h : byId.get(id)!.w);
  const along = (id: string) => (LR ? byId.get(id)!.w : byId.get(id)!.h);
  const forest = spanningForest(boxes, edges, o.rootId);
  const crossPos = new Map<string, number>();
  const depthMax: number[] = [];
  let cursor = 0;
  const walk = (t: TreeNode): number => {
    depthMax[t.depth] = Math.max(depthMax[t.depth] ?? 0, along(t.id));
    let c: number;
    if (!t.kids.length) {
      c = cursor + across(t.id) / 2;
      cursor += across(t.id) + o.gap;
    } else {
      const cs = t.kids.map(walk);
      c = (cs[0] + cs[cs.length - 1]) / 2;
      // a parent wider than its kids' span must not collide with the next sibling
      cursor = Math.max(cursor, c + across(t.id) / 2 + o.gap);
    }
    crossPos.set(t.id, c);
    return c;
  };
  forest.forEach(walk);
  const flowAt: number[] = [];
  depthMax.reduce((f, d, i) => ((flowAt[i] = f), f + d + o.gap * 1.6), 0);
  const res = new Map<string, Pt>();
  const place = (t: TreeNode) => {
    const a = flowAt[t.depth] + (depthMax[t.depth] - along(t.id)) / 2;
    const c = crossPos.get(t.id)! - across(t.id) / 2;
    res.set(t.id, LR ? { x: a, y: c } : { x: c, y: a });
    t.kids.forEach(place);
  };
  forest.forEach(place);
  return res;
}

function radial(boxes: Box[], edges: Pair[], o: { gap: number; rootId?: string }): Map<string, Pt> {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const trees = spanningForest(boxes, edges, o.rootId);
  const root: TreeNode = trees.length === 1 ? trees[0] : { id: '\u0000', kids: trees.map((t) => ((function bump(n: TreeNode) { n.depth++; n.kids.forEach(bump); })(t), t)), depth: 0 };
  const leaves = new Map<string, number>();
  const count = (t: TreeNode): number => (leaves.set(t.id, t.kids.length ? t.kids.reduce((s, k) => s + count(k), 0) : 1), leaves.get(t.id)!);
  count(root);
  const maxDim = Math.max(0, ...boxes.map((b) => Math.hypot(b.w, b.h)));
  const centers = new Map<string, Pt>();
  const placeWith = (step: number) => {
    const rec = (t: TreeNode, a0: number, a1: number) => {
      const mid = (a0 + a1) / 2;
      if (t.id !== '\u0000') centers.set(t.id, t.depth === 0 && trees.length === 1 ? { x: 0, y: 0 } : { x: Math.cos(mid) * t.depth * step, y: Math.sin(mid) * t.depth * step });
      let a = a0;
      for (const k of t.kids) {
        const span = ((a1 - a0) * leaves.get(k.id)!) / leaves.get(t.id)!;
        rec(k, a, a + span);
        a += span;
      }
    };
    rec(root, -Math.PI / 2, (3 * Math.PI) / 2);
  };
  const clash = () => {
    const ids = [...centers.keys()];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = centers.get(ids[i])!;
        const b = centers.get(ids[j])!;
        const A = byId.get(ids[i])!;
        const B = byId.get(ids[j])!;
        if (Math.abs(a.x - b.x) < (A.w + B.w) / 2 + o.gap / 2 && Math.abs(a.y - b.y) < (A.h + B.h) / 2 + o.gap / 2) return true;
      }
    return false;
  };
  let step = maxDim + o.gap;
  placeWith(step);
  for (let i = 0; i < 60 && clash(); i++) {
    step *= 1.15;
    placeWith(step);
  }
  return new Map(boxes.map((b) => [b.id, { x: centers.get(b.id)!.x - b.w / 2, y: centers.get(b.id)!.y - b.h / 2 }]));
}

/** push overlapping boxes apart along the axis of least penetration; deterministic (pair order) */
function resolveOverlaps(boxes: Box[], pos: Map<string, Pt>, gap: number): void {
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        const dx = pb.x + b.w / 2 - (pa.x + a.w / 2);
        const dy = pb.y + b.h / 2 - (pa.y + a.h / 2);
        const ox = (a.w + b.w) / 2 + gap / 2 - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + gap / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5);
          pa.x -= s;
          pb.x += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5);
          pa.y -= s;
          pb.y += s;
        }
      }
    if (!moved) return;
  }
}

function force(boxes: Box[], edges: Pair[], o: { gap: number; seed: number }): Map<string, Pt> {
  const n = boxes.length;
  const rnd = mulberry32(o.seed);
  const avg = boxes.reduce((s, b) => s + Math.max(b.w, b.h), 0) / Math.max(1, n);
  const k = avg + o.gap;
  const pos = new Map<string, Pt>();
  boxes.forEach((b, i) => {
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    const r = k * Math.sqrt(n) * 0.5;
    pos.set(b.id, { x: Math.cos(ang) * r + (rnd() - 0.5) * k * 0.2, y: Math.sin(ang) * r + (rnd() - 0.5) * k * 0.2 });
  });
  const { out } = adjacency(boxes, edges);
  const links: Pair[] = [];
  for (const [a, ts] of out) for (const t of ts) links.push([a, t]);
  let temp = k * 2;
  for (let it = 0; it < 250; it++) {
    const disp = new Map(boxes.map((b) => [b.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(boxes[i].id)!;
        const b = pos.get(boxes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) (dx = rnd() - 0.5, dy = rnd() - 0.5, d = Math.hypot(dx, dy) || 1);
        const f = (k * k) / d;
        const da = disp.get(boxes[i].id)!;
        const db = disp.get(boxes[j].id)!;
        da.x += (dx / d) * f; da.y += (dy / d) * f;
        db.x -= (dx / d) * f; db.y -= (dy / d) * f;
      }
    for (const [s, t] of links) {
      const a = pos.get(s)!;
      const b = pos.get(t)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d * d) / k;
      const ds = disp.get(s)!;
      const dt = disp.get(t)!;
      ds.x -= (dx / d) * f; ds.y -= (dy / d) * f;
      dt.x += (dx / d) * f; dt.y += (dy / d) * f;
    }
    for (const b of boxes) {
      const d = disp.get(b.id)!;
      const len = Math.hypot(d.x, d.y) || 1;
      const p = pos.get(b.id)!;
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
    }
    temp *= 0.97;
  }
  const res = new Map<string, Pt>();
  for (const b of boxes) {
    const p = pos.get(b.id)!;
    res.set(b.id, { x: p.x - b.w / 2, y: p.y - b.h / 2 });
  }
  resolveOverlaps(boxes, res, o.gap);
  return res;
}

/** positions (top-left) for the boxes; not anchored (callers translate) */
export function placeBoxes(algo: LayoutAlgo, boxes: Box[], edges: Pair[], opts: LayoutOptions = {}): Map<string, Pt> {
  const gap = opts.gap ?? 60;
  const direction = opts.direction ?? 'LR';
  if (!boxes.length) return new Map();
  switch (algo) {
    case 'grid': return gridLayout(boxes, gap);
    case 'tree': return tree(boxes, edges, { direction, gap, rootId: opts.rootId });
    case 'radial': {
      const r = radial(boxes, edges, { gap, rootId: opts.rootId });
      resolveOverlaps(boxes, r, gap);
      return r;
    }
    case 'force': return force(boxes, edges, { gap, seed: opts.seed ?? 1 });
    case 'orthogonal': {
      const r = layered(boxes, edges, { direction, gap: Math.max(gap, 3 * SNAP) });
      for (const p of r.values()) (p.x = Math.round(p.x / SNAP) * SNAP, (p.y = Math.round(p.y / SNAP) * SNAP));
      return r;
    }
    default: return layered(boxes, edges, { direction, gap });
  }
}

const bboxMin = (boxes: Box[], pos: Map<string, Pt>): Pt => ({ x: Math.min(...boxes.map((b) => pos.get(b.id)!.x)), y: Math.min(...boxes.map((b) => pos.get(b.id)!.y)) });

/** Lay `page` out in place. Returns the ids of the nodes that moved. */
export function applyLayout(page: CPage, algo: LayoutAlgo, opts: LayoutOptions = {}): string[] {
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const moved = new Set<string>();
  const childrenOf = (pid: string | undefined) => page.nodes.filter((n) => n.parentId === pid || (pid === undefined && !n.parentId));
  const ancestorIn = (id: string, scope: Set<string>): string | undefined => {
    for (let cur: string | undefined = id, i = 0; cur && i < 64; i++, cur = byId.get(cur)?.parentId) if (scope.has(cur)) return cur;
    return undefined;
  };
  const run = (members: CNode[], anchor: Pt | null, pad: { left: number; top: number }): void => {
    if (!members.length) return;
    const scope = new Set(members.map((m) => m.id));
    const boxes: Box[] = members.map((m) => ({ id: m.id, ...{ w: nodeSize(m).width, h: nodeSize(m).height } }));
    const edges: Pair[] = [];
    for (const e of page.edges) {
      const a = ancestorIn(e.source, scope);
      const b = ancestorIn(e.target, scope);
      if (a && b && a !== b) edges.push([a, b]);
    }
    const pos = placeBoxes(algo, boxes, edges, opts);
    const min = bboxMin(boxes, pos);
    const origin = anchor ?? { x: pad.left, y: pad.top };
    for (const m of members) {
      const p = pos.get(m.id)!;
      const next = { x: Math.round((origin.x + p.x - min.x) * 100) / 100, y: Math.round((origin.y + p.y - min.y) * 100) / 100 };
      if (m.position.x !== next.x || m.position.y !== next.y) moved.add(m.id);
      m.position = next;
    }
  };

  if (opts.only?.length) {
    const first = byId.get(opts.only.find((id) => byId.has(id)) ?? '');
    if (!first) return [];
    const sel = opts.only.map((id) => byId.get(id)).filter((n): n is CNode => !!n && n.parentId === first.parentId);
    const anchor = { x: Math.min(...sel.map((n) => n.position.x)), y: Math.min(...sel.map((n) => n.position.y)) };
    run(sel, anchor, { left: 0, top: 0 });
    return [...moved];
  }

  // groups bottom-up: children first, then the group grows to fit them
  const depthOf = (n: CNode) => { let d = 0; for (let c = n; c.parentId && d < 64; c = byId.get(c.parentId) ?? c) { d++; if (!byId.get(c.parentId)) break; } return d; };
  const groups = page.nodes.filter((n) => page.nodes.some((c) => c.parentId === n.id)).sort((a, b) => depthOf(b) - depthOf(a));
  for (const g of groups) {
    const kids = childrenOf(g.id);
    run(kids, null, { left: GROUP_PAD.left, top: GROUP_PAD.top });
    const right = Math.max(...kids.map((k) => k.position.x + nodeSize(k).width));
    const bottom = Math.max(...kids.map((k) => k.position.y + nodeSize(k).height));
    const w = Math.max(right + GROUP_PAD.right, 0);
    const h = Math.max(bottom + GROUP_PAD.bottom, 0);
    if (g.width !== w || g.height !== h) moved.add(g.id);
    g.width = w;
    g.height = h;
  }
  const top = childrenOf(undefined);
  if (top.length) run(top, { x: Math.min(...top.map((n) => n.position.x)), y: Math.min(...top.map((n) => n.position.y)) }, { left: 0, top: 0 });
  if (algo === 'orthogonal') for (const e of page.edges) e.data = { ...(e.data ?? {}), lineType: 'orthogonal' };
  return [...moved];
}

// ------------------------------------------------------------------------------------------------ edge labels
const LABEL_H = 18;
const labelW = (s: string) => Math.min(240, Math.round(s.length * 6.6 + 14));

/** the (approximate) boxes of the edge labels, from straight lines between node centers, `labelT` along them and `labelOffset` sideways */
export function edgeLabelRects(page: Pick<CPage, 'nodes' | 'edges'>): { id: string; rect: Rect }[] {
  const rects = absRects(page);
  const out: { id: string; rect: Rect }[] = [];
  for (const e of page.edges) {
    const a = rects.get(e.source), b = rects.get(e.target);
    if (!a || !b || !e.label) continue;
    const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const t = typeof e.data?.labelT === 'number' ? e.data.labelT : 0.5;
    const off = typeof e.data?.labelOffset === 'number' ? e.data.labelOffset : 0;
    const dx = bc.x - ac.x, dy = bc.y - ac.y, len = Math.hypot(dx, dy) || 1;
    const cx = ac.x + dx * t + (-dy / len) * off, cy = ac.y + dy * t + (dx / len) * off;
    const w = labelW(String(e.label));
    out.push({ id: e.id, rect: { x: cx - w / 2, y: cy - LABEL_H / 2, width: w, height: LABEL_H } });
  }
  return out;
}
const hit = (a: Rect, b: Rect, pad = 2) => a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;

/**
 * Label overlap removal: labels that collide are slid along their edge (`labelT`, 0.15..0.85) and then pushed sideways (`labelOffset`)
 * until no two labels overlap. Deterministic; only edges that need it get `labelT` / `labelOffset`. Returns how many edges changed.
 */
export function separateLabels(page: CPage): number {
  const changed = new Set<string>();
  const tries: [number, number][] = [];
  for (const off of [0, 16, -16, 32, -32, 48, -48, 64, -64]) for (const t of [0.5, 0.35, 0.65, 0.25, 0.75, 0.2, 0.8]) tries.push([t, off]);
  const order = page.edges.filter((e) => e.label).map((e) => e.id);
  // place labels one by one; a label keeps its spot unless it hits one that is already placed
  const placed: Rect[] = [];
  for (const id of order) {
    const e = page.edges.find((x) => x.id === id)!;
    const original = { t: e.data?.labelT, off: e.data?.labelOffset };
    const rectAt = (t: number, off: number) => { const prev = e.data; e.data = { ...(prev ?? {}), labelT: t, labelOffset: off }; const r = edgeLabelRects({ nodes: page.nodes, edges: [e] })[0].rect; if (prev) e.data = prev; else delete e.data; return r; };
    const startT = typeof original.t === 'number' ? original.t : 0.5;
    const startOff = typeof original.off === 'number' ? original.off : 0;
    const chosen: [number, number] = placed.some((p) => hit(p, rectAt(startT, startOff))) ? (tries.find(([t, off]) => !placed.some((p) => hit(p, rectAt(t, off)))) ?? [startT, startOff]) : [startT, startOff];
    placed.push(rectAt(chosen[0], chosen[1]));
    if (chosen[0] !== startT || chosen[1] !== startOff) {
      e.data = { ...(e.data ?? {}), labelT: chosen[0], labelOffset: chosen[1] };
      changed.add(id);
    }
  }
  return changed.size;
}

/** line up the top-level groups: a row (same top, even gaps, in left-to-right order) or a column (same left); children travel with their group */
export function alignGroups(page: CPage, mode: 'row' | 'column', opts: { gap?: number } = {}): number {
  const gap = opts.gap ?? 60;
  const groups = page.nodes.filter((n) => n.type === 'group' && !n.parentId);
  if (!groups.length) return 0;
  const sorted = [...groups].sort((a, b) => (mode === 'row' ? a.position.x - b.position.x || a.position.y - b.position.y : a.position.y - b.position.y || a.position.x - b.position.x));
  const top = Math.min(...groups.map((g) => g.position.y));
  const left = Math.min(...groups.map((g) => g.position.x));
  let cursor = mode === 'row' ? left : top;
  let moved = 0;
  for (const g of sorted) {
    const s = nodeSize(g);
    const next = mode === 'row' ? { x: cursor, y: top } : { x: left, y: cursor };
    if (g.position.x !== next.x || g.position.y !== next.y) moved++;
    g.position = next;
    cursor += (mode === 'row' ? s.width : s.height) + gap;
  }
  return moved;
}
