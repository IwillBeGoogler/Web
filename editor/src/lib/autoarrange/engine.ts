/**
 * Auto layout engine (pure). Lays a page, a selection, or the inside of one group out as a graph:
 * containers first (children inside, then the container grows to fit and is placed as one block), locked nodes stay put and are
 * treated as obstacles, disconnected nodes go to a compact grid, everything lands on the snap grid and never overlaps.
 * Output positions are parent-relative (what `node.position` holds); container sizes come back as `width` / `height`.
 */
import type { DiagramEdge, DiagramNode } from '../../types';
import { isContainer, nodeSize } from '../graph';
import { relationOf } from '../er/tableData';
import { umlOf } from '../uml/edges';
import { layeredPlace, type Box, type Pair, type Pt } from './layered';

export type ArrangeAlgo = 'auto' | 'layered' | 'erd' | 'uml' | 'tree' | 'grid';
export type ArrangeDirection = 'TB' | 'LR';
export type ArrangeSpacing = 'compact' | 'normal' | 'roomy';
export interface ArrangeOptions {
  algo: ArrangeAlgo;
  /** null: the algorithm's natural direction (LR for flows and ERDs, TB for UML and trees) */
  direction: ArrangeDirection | null;
  spacing: ArrangeSpacing;
  /** grid unit the result lands on (0: no snapping) */
  snap: number;
  /** lay out only these nodes (a single container: its inside) */
  selection?: string[];
}
export const DEFAULT_ARRANGE: ArrangeOptions = { algo: 'auto', direction: null, spacing: 'normal', snap: 20 };
export interface Placed { x: number; y: number; width?: number; height?: number }
export type ArrangeResult = Map<string, Placed>;

export const SPACING: Record<ArrangeSpacing, { across: number; along: number }> = {
  compact: { across: 30, along: 60 },
  normal: { across: 50, along: 90 },
  roomy: { across: 80, along: 140 },
};
const PAD = { l: 20, t: 60, r: 20, b: 20 };
const MIN_GROUP = { w: 120, h: 80 };
const HIERARCHY = new Set(['inheritance', 'realization', 'generalization']);
const LEAD_ROLES = new Set(['primary', 'leader', 'master', 'controller']);

type Kind = Exclude<ArrangeAlgo, 'auto'>;

/** what the page is about: tables -> erd, classes -> uml, nothing connected -> grid, else layered */
export function detectAlgo(nodes: DiagramNode[], edges: DiagramEdge[]): Kind {
  const vis = nodes.filter((n) => !isContainer(n));
  const count = (t: string) => vis.filter((n) => n.type === t).length;
  if (count('table') > vis.length / 2) return 'erd';
  if (count('class') > vis.length / 2) return 'uml';
  return edges.length ? 'layered' : 'grid';
}

export const naturalDirection = (k: Kind): ArrangeDirection => (k === 'uml' || k === 'tree' ? 'TB' : 'LR');

const snapTo = (v: number, s: number, mode: 'round' | 'ceil' = 'round') => (s > 0 ? (mode === 'ceil' ? Math.ceil(v / s) : Math.round(v / s)) * s : Math.round(v));
const hidden = (n: DiagramNode) => !!n.hidden || !!n.data.hidden;

interface Ctx {
  nodes: DiagramNode[];
  byId: Map<string, DiagramNode>;
  edges: DiagramEdge[];
  kind: Kind;
  dir: ArrangeDirection;
  gap: { across: number; along: number };
  snap: number;
  out: ArrangeResult;
  sizes: Map<string, { width: number; height: number }>;
}

const sizeOf = (c: Ctx, n: DiagramNode) => c.sizes.get(n.id) ?? nodeSize(n);
const lockedChain = (c: Ctx, n: DiagramNode): boolean => {
  for (let cur: DiagramNode | undefined = n, i = 0; cur && i < 64; cur = cur.parentId ? c.byId.get(cur.parentId) : undefined, i++) if (cur.data.locked) return true;
  return false;
};
/** can the inside of this container be rearranged? */
const openable = (c: Ctx, n: DiagramNode) => isContainer(n) && !n.data.collapsed && !n.data.autoLayout && !lockedChain(c, n);

interface Rect { x: number; y: number; w: number; h: number }
const hits = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** push free rectangles right / down (whichever is shorter) until they clear the fixed ones and each other; deterministic */
function separate(free: { id: string; r: Rect }[], fixed: Rect[], pad: number, snap: number): void {
  const ordered = [...free].sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const settled: Rect[] = [...fixed];
  for (const f of ordered) {
    for (let guard = 0; guard < 400; guard++) {
      const hit = settled.find((s) => hits(f.r, s, pad));
      if (!hit) break;
      const dx = hit.x + hit.w + pad - f.r.x;
      const dy = hit.y + hit.h + pad - f.r.y;
      if (dx <= dy) f.r.x = snapTo(f.r.x + dx, snap, 'ceil');
      else f.r.y = snapTo(f.r.y + dy, snap, 'ceil');
    }
    settled.push(f.r);
  }
}

function lift(scope: Set<string>, byId: Map<string, DiagramNode>, id: string): string | undefined {
  for (let cur: string | undefined = id, i = 0; cur && i < 64; cur = byId.get(cur)?.parentId, i++) if (scope.has(cur)) return cur;
  return undefined;
}

function orient(c: Ctx, scope: Set<string>): { strict: Pair[]; soft: Pair[] } {
  const strict: Pair[] = [];
  const soft: Pair[] = [];
  for (const e of c.edges) {
    const a = lift(scope, c.byId, e.source);
    const b = lift(scope, c.byId, e.target);
    if (!a || !b || a === b) continue;
    if (c.kind === 'uml') {
      const k = umlOf(e)?.kind;
      if (k && HIERARCHY.has(k)) strict.push([b, a]);
      else soft.push([a, b]);
    } else if (c.kind === 'erd') {
      const r = relationOf(e);
      strict.push(r?.cardinality === 'N:1' ? [b, a] : [a, b]);
    } else strict.push([a, b]);
  }
  return { strict, soft };
}

function treePlace(boxes: Box[], pairs: Pair[], dir: ArrangeDirection, gap: { across: number; along: number }): Map<string, Pt> {
  const LR = dir === 'LR';
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const kids = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
  const hasParent = new Set<string>();
  for (const [a, b] of pairs) if (byId.has(a) && byId.has(b) && a !== b && !hasParent.has(b)) { kids.get(a)!.push(b); hasParent.add(b); }
  const roots = boxes.filter((b) => !hasParent.has(b.id)).map((b) => b.id);
  const seen = new Set<string>();
  const across = (id: string) => (LR ? byId.get(id)!.h : byId.get(id)!.w);
  const along = (id: string) => (LR ? byId.get(id)!.w : byId.get(id)!.h);
  const cross = new Map<string, number>();
  const depth = new Map<string, number>();
  const thick: number[] = [];
  let cursor = 0;
  const walk = (id: string, d: number): number => {
    seen.add(id);
    depth.set(id, d);
    thick[d] = Math.max(thick[d] ?? 0, along(id));
    const ks = kids.get(id)!.filter((k) => !seen.has(k));
    let ctr: number;
    if (!ks.length) { ctr = cursor + across(id) / 2; cursor += across(id) + gap.across; }
    else { const cs = ks.map((k) => walk(k, d + 1)); ctr = (cs[0] + cs[cs.length - 1]) / 2; cursor = Math.max(cursor, ctr + across(id) / 2 + gap.across); }
    cross.set(id, ctr);
    return ctr;
  };
  for (const r of roots) walk(r, 0);
  for (const b of boxes) if (!seen.has(b.id)) walk(b.id, 0);
  const flowAt: number[] = [];
  thick.reduce((f, t, i) => ((flowAt[i] = f), f + t + gap.along), 0);
  const res = new Map<string, Pt>();
  for (const b of boxes) {
    const d = depth.get(b.id)!;
    const a = flowAt[d] + (thick[d] - along(b.id)) / 2;
    const cc = cross.get(b.id)! - across(b.id) / 2;
    res.set(b.id, LR ? { x: a, y: cc } : { x: cc, y: a });
  }
  return res;
}

/** rows of boxes in the given order */
function gridPlace(boxes: Box[], gap: { across: number; along: number }, maxRowW?: number): Map<string, Pt> {
  const n = boxes.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  void maxRowW;
  const colW = Array.from({ length: cols }, (_, ci) => Math.max(0, ...boxes.filter((_, i) => i % cols === ci).map((b) => b.w)));
  const rows = Math.ceil(n / cols);
  const rowH = Array.from({ length: rows }, (_, ri) => Math.max(0, ...boxes.slice(ri * cols, ri * cols + cols).map((b) => b.h)));
  const xs: number[] = [];
  const ys: number[] = [];
  colW.reduce((x, w) => (xs.push(x), x + w + gap.across), 0);
  rowH.reduce((y, h) => (ys.push(y), y + h + gap.across), 0);
  return new Map(boxes.map((b, i) => [b.id, { x: xs[i % cols], y: ys[Math.floor(i / cols)] }]));
}

const extent = (boxes: Box[], pos: Map<string, Pt>) => {
  let w = 0, h = 0;
  for (const b of boxes) { const p = pos.get(b.id)!; w = Math.max(w, p.x + b.w); h = Math.max(h, p.y + b.h); }
  return { w, h };
};

/** star: one box linked to most of the others. Hub first (LR: left, TB: top, centered), spokes in a tight near-square grid beside it. */
function hubPlace(comp: Box[], hub: Box, adj: Map<string, Set<string>>, order: Map<string, number>, dir: ArrangeDirection, gap: { across: number; along: number }): Map<string, Pt> {
  const LR = dir === 'LR';
  const spokes = comp.filter((b) => b !== hub).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  void adj;
  const hubGap = Math.round(gap.across + (gap.along - gap.across) / 3);
  type Layout = { cols: Box[][]; w: number; h: number };
  let best: Layout | null = null;
  let bestScore = Infinity;
  for (let k = 1; k <= spokes.length; k++) {
    // lanes run across the flow; each lane stacks spokes along the cross axis
    const per = Math.ceil(spokes.length / k);
    const lanes: Box[][] = [];
    for (let i = 0; i < spokes.length; i += per) lanes.push(spokes.slice(i, i + per));
    const thick = lanes.map((l) => Math.max(...l.map((b) => (LR ? b.w : b.h))));
    const len = lanes.map((l) => l.reduce((t, b) => t + (LR ? b.h : b.w), 0) + (l.length - 1) * gap.across);
    const flow = thick.reduce((t, v) => t + v, 0) + (lanes.length - 1) * gap.across + hubGap + (LR ? hub.w : hub.h);
    const cross = Math.max(...len, LR ? hub.h : hub.w);
    const w = LR ? flow : cross, h = LR ? cross : flow;
    const score = Math.max(w / h, h / w) * 1000 + (w * h) / 1e6;
    if (score < bestScore) { bestScore = score; best = { cols: lanes, w, h }; }
  }
  const { cols, w, h } = best!;
  const res = new Map<string, Pt>();
  if (LR) {
    res.set(hub.id, { x: 0, y: (h - hub.h) / 2 });
    let x = hub.w + hubGap;
    for (const lane of cols) {
      const tw = Math.max(...lane.map((b) => b.w));
      const lh = lane.reduce((t, b) => t + b.h, 0) + (lane.length - 1) * gap.across;
      let y = (h - lh) / 2;
      for (const b of lane) { res.set(b.id, { x, y }); y += b.h + gap.across; }
      x += tw + gap.across;
    }
  } else {
    res.set(hub.id, { x: (w - hub.w) / 2, y: 0 });
    let y = hub.h + hubGap;
    for (const lane of cols) {
      const th = Math.max(...lane.map((b) => b.h));
      const lw = lane.reduce((t, b) => t + b.w, 0) + (lane.length - 1) * gap.across;
      let x = (w - lw) / 2;
      for (const b of lane) { res.set(b.id, { x, y }); x += b.w + gap.across; }
      y += th + gap.across;
    }
  }
  return res;
}

/** the node linked to (nearly) all the others in a component of 4+, if any */
function findHub(comp: Box[], adj: Map<string, Set<string>>): Box | null {
  if (comp.length < 4) return null;
  let best: Box | null = null;
  for (const b of comp) if (!best || adj.get(b.id)!.size > adj.get(best.id)!.size) best = b;
  const deg = adj.get(best!.id)!.size;
  const need = Math.max(3, Math.ceil((comp.length - 1) * 0.75));
  if (deg < need) return null;
  // the rest must not be hubs themselves (a dense clique has no centre)
  const others = comp.filter((b) => b !== best);
  return others.some((b) => adj.get(b.id)!.size >= deg) ? null : best;
}

/** relative placement of the free boxes: connected components laid out by the algorithm, loose nodes in a grid, all shelf-packed */
function place(c: Ctx, boxes: Box[], strict: Pair[], soft: Pair[], reading: Map<string, number>): Map<string, Pt> {
  const res = new Map<string, Pt>();
  if (!boxes.length) return res;
  const ids = new Set(boxes.map((b) => b.id));
  const adj = new Map<string, Set<string>>(boxes.map((b) => [b.id, new Set()]));
  for (const [a, b] of [...strict, ...soft]) if (ids.has(a) && ids.has(b)) { adj.get(a)!.add(b); adj.get(b)!.add(a); }
  const seen = new Set<string>();
  const comps: Box[][] = [];
  const loose: Box[] = [];
  for (const b of boxes) {
    if (seen.has(b.id)) continue;
    const comp: string[] = [];
    const stack = [b.id];
    seen.add(b.id);
    while (stack.length) { const u = stack.pop()!; comp.push(u); for (const v of adj.get(u)!) if (!seen.has(v)) { seen.add(v); stack.push(v); } }
    if (comp.length === 1) loose.push(b);
    else { const set = new Set(comp); comps.push(boxes.filter((x) => set.has(x.id))); }
  }
  const blocks: { boxes: Box[]; pos: Map<string, Pt>; w: number; h: number }[] = [];
  const algo = c.kind;
  // one star plus a few strays: the strays join the spoke grid so everything stays one tight block
  if (comps.length === 1 && loose.length && algo !== 'erd' && algo !== 'uml') {
    const hub = findHub(comps[0], adj);
    if (hub) {
      const all = [...comps[0], ...loose];
      const order = new Map(reading);
      for (const l of loose) order.set(l.id, reading.get(l.id)! + 1e6);
      return hubPlace(all, hub, adj, order, c.dir, c.gap);
    }
  }
  for (const comp of comps) {
    const set = new Set(comp.map((x) => x.id));
    const st = strict.filter(([a, b]) => set.has(a) && set.has(b));
    const so = soft.filter(([a, b]) => set.has(a) && set.has(b));
    const hub = algo === 'erd' || algo === 'uml' ? null : findHub(comp, adj);
    const pos = hub ? hubPlace(comp, hub, adj, reading, c.dir, c.gap) : algo === 'tree' ? treePlace(comp, st, c.dir, c.gap) : layeredPlace(comp, st, { direction: c.dir, gapAcross: c.gap.across, gapAlong: c.gap.along, soft: so });
    blocks.push({ boxes: comp, pos, ...extent(comp, pos) });
  }
  blocks.sort((a, b) => b.boxes.length - a.boxes.length || b.w * b.h - a.w * a.h);
  if (loose.length) {
    const ordered = [...loose].sort((a, b) => reading.get(a.id)! - reading.get(b.id)!);
    const pos = gridPlace(ordered, c.gap);
    blocks.push({ boxes: ordered, pos, ...extent(ordered, pos) });
  }
  const area = blocks.reduce((s, b) => s + (b.w + c.gap.across) * (b.h + c.gap.across), 0);
  const rowMax = Math.max(Math.max(...blocks.map((b) => b.w)), Math.sqrt(area * 1.8));
  let x = 0, y = 0, rowH = 0;
  blocks.forEach((b, i) => {
    if (i > 0 && x > 0 && x + b.w > rowMax) { y += rowH + c.gap.along; x = 0; rowH = 0; }
    for (const bx of b.boxes) { const p = b.pos.get(bx.id)!; res.set(bx.id, { x: x + p.x, y: y + p.y }); }
    x += b.w + c.gap.along;
    rowH = Math.max(rowH, b.h);
  });
  return res;
}

/**
 * Arrange the children of `parentId`. `only` limits the free set (selection); everything else at that level is an obstacle.
 * Returns the bounding size of all members (for the container to grow to).
 */
function arrangeLevel(c: Ctx, parentId: string | undefined, only: Set<string> | null, anchor: Pt | null): { w: number; h: number } {
  const members = c.nodes.filter((n) => n.parentId === parentId && !hidden(n) && (parentId !== undefined || !n.parentId));
  const parent = parentId ? c.byId.get(parentId) : undefined;
  if (parent?.type === 'cluster') members.sort((a, b) => Number(!LEAD_ROLES.has(a.data.role ?? '')) - Number(!LEAD_ROLES.has(b.data.role ?? '')));
  const isFree = (n: DiagramNode) => !lockedChain(c, n) && (!only || only.has(n.id));
  const free = members.filter(isFree);
  // containers: inside first, then they act as one block
  // a generated cluster (PostgreSQL, MongoDB ...) keeps the interior its profile laid out: page / selection layouts move it as one block
  // (select the cluster alone to re-arrange its inside)
  // (a selected container keeps its inside as is and moves with its whole subtree)
  if (!only) for (const m of free) if (openable(c, m) && !(m.type === 'cluster' && m.data.profileId)) {
    const inner = arrangeLevel(c, m.id, null, { x: PAD.l, y: PAD.t });
    const width = Math.max(MIN_GROUP.w, snapTo(inner.w + PAD.r, c.snap, 'ceil'));
    const height = Math.max(MIN_GROUP.h, snapTo(inner.h + PAD.b, c.snap, 'ceil'));
    c.sizes.set(m.id, { width, height });
    c.out.set(m.id, { ...(c.out.get(m.id) ?? { x: m.position.x, y: m.position.y }), width, height });
  }
  const reading = new Map(members.map((m, i) => [m.id, i]));
  const at = (m: DiagramNode) => m.position;
  const byPos = [...free].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
  byPos.forEach((m, i) => reading.set(m.id, i));
  if (parent?.type === 'cluster') members.filter(isFree).forEach((m, i) => reading.set(m.id, i)); // primary first, then input order

  const boxes: Box[] = free.map((m) => ({ id: m.id, w: sizeOf(c, m).width, h: sizeOf(c, m).height }));
  const { strict, soft } = orient(c, new Set(free.map((m) => m.id)));
  const rel = place(c, boxes, strict, soft, reading);
  const orig = anchor ?? {
    x: free.length ? Math.min(...free.map((m) => at(m).x)) : 0,
    y: free.length ? Math.min(...free.map((m) => at(m).y)) : 0,
  };
  const origin = { x: snapTo(orig.x, c.snap), y: snapTo(orig.y, c.snap) };
  const minX = boxes.length ? Math.min(...boxes.map((b) => rel.get(b.id)!.x)) : 0;
  const minY = boxes.length ? Math.min(...boxes.map((b) => rel.get(b.id)!.y)) : 0;
  const rects = boxes.map((b) => {
    const p = rel.get(b.id)!;
    return { id: b.id, r: { x: snapTo(origin.x + p.x - minX, c.snap), y: snapTo(origin.y + p.y - minY, c.snap), w: b.w, h: b.h } };
  });
  // unselected siblings (and locked ones) are obstacles
  const fixed: Rect[] = members.filter((m) => !isFree(m)).map((m) => ({ x: m.position.x, y: m.position.y, w: sizeOf(c, m).width, h: sizeOf(c, m).height }));
  separate(rects, fixed, 20, c.snap);
  for (const f of rects) {
    c.out.set(f.id, { ...(c.out.get(f.id) ?? {}), x: f.r.x, y: f.r.y });
  }
  const all: Rect[] = [...fixed, ...rects.map((f) => f.r)];
  return { w: all.length ? Math.max(...all.map((r) => r.x + r.w)) : 0, h: all.length ? Math.max(...all.map((r) => r.y + r.h)) : 0 };
}

/** grow ancestors (never shrink) so they still contain the moved / resized children; push overlapped siblings out of the way */
function settleAncestors(c: Ctx, startId: string, pushSiblings = true): void {
  let cur = c.byId.get(startId);
  for (let i = 0; cur?.parentId && i < 64; i++) {
    const p = c.byId.get(cur.parentId);
    if (!p) break;
    const kids = c.nodes.filter((n) => n.parentId === p.id && !hidden(n));
    const pos = (n: DiagramNode) => c.out.get(n.id) ?? n.position;
    const need = {
      w: snapTo(Math.max(...kids.map((k) => pos(k).x + sizeOf(c, k).width)) + PAD.r, c.snap, 'ceil'),
      h: snapTo(Math.max(...kids.map((k) => pos(k).y + sizeOf(c, k).height)) + PAD.b, c.snap, 'ceil'),
    };
    const s = sizeOf(c, p);
    if (need.w > s.width || need.h > s.height) {
      const next = { width: Math.max(s.width, need.w), height: Math.max(s.height, need.h) };
      c.sizes.set(p.id, next);
      c.out.set(p.id, { ...(c.out.get(p.id) ?? { x: p.position.x, y: p.position.y }), ...next });
    }
    cur = p;
  }
  if (!pushSiblings) return;
  // siblings of the grown container
  const grown = c.byId.get(startId)!;
  const sibs = c.nodes.filter((n) => n.parentId === grown.parentId && n.id !== grown.id && !hidden(n));
  const gp = c.out.get(grown.id) ?? grown.position;
  const gs = sizeOf(c, grown);
  const movable = sibs.filter((n) => !lockedChain(c, n)).map((n) => ({ id: n.id, r: { x: (c.out.get(n.id) ?? n.position).x, y: (c.out.get(n.id) ?? n.position).y, w: sizeOf(c, n).width, h: sizeOf(c, n).height } }));
  const still = sibs.filter((n) => lockedChain(c, n)).map((n) => ({ x: n.position.x, y: n.position.y, w: sizeOf(c, n).width, h: sizeOf(c, n).height }));
  separate(movable, [{ x: gp.x, y: gp.y, w: gs.width, h: gs.height }, ...still], 20, c.snap);
  for (const m of movable) {
    const n = c.byId.get(m.id)!;
    if (m.r.x !== n.position.x || m.r.y !== n.position.y) c.out.set(m.id, { ...(c.out.get(m.id) ?? {}), x: m.r.x, y: m.r.y });
  }
}

export function arrangeNodes(nodes: DiagramNode[], edges: DiagramEdge[], opts: Partial<ArrangeOptions> = {}): ArrangeResult {
  const o = { ...DEFAULT_ARRANGE, ...opts };
  const kind: Kind = o.algo === 'auto' ? detectAlgo(nodes, edges) : o.algo;
  const c: Ctx = {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    edges,
    kind,
    dir: o.direction ?? naturalDirection(kind),
    gap: SPACING[o.spacing],
    snap: o.snap,
    out: new Map(),
    sizes: new Map(),
  };
  const sel = o.selection?.filter((id) => c.byId.has(id));
  if (!sel?.length) {
    arrangeLevel(c, undefined, null, null);
  } else if (sel.length === 1 && openable(c, c.byId.get(sel[0])!)) {
    const g = c.byId.get(sel[0])!;
    const inner = arrangeLevel(c, g.id, null, { x: PAD.l, y: PAD.t });
    const width = Math.max(MIN_GROUP.w, snapTo(inner.w + PAD.r, c.snap, 'ceil'));
    const height = Math.max(MIN_GROUP.h, snapTo(inner.h + PAD.b, c.snap, 'ceil'));
    c.sizes.set(g.id, { width, height });
    c.out.set(g.id, { ...(c.out.get(g.id) ?? { x: g.position.x, y: g.position.y }), width, height });
    settleAncestors(c, g.id);
  } else {
    const chosen = new Set(sel);
    const groups = new Map<string | undefined, Set<string>>();
    for (const id of sel) {
      const n = c.byId.get(id)!;
      let covered = false;
      for (let cur = n.parentId ? c.byId.get(n.parentId) : undefined, i = 0; cur && i < 64; cur = cur.parentId ? c.byId.get(cur.parentId) : undefined, i++) if (chosen.has(cur.id)) covered = true;
      if (covered) continue;
      (groups.get(n.parentId) ?? groups.set(n.parentId, new Set()).get(n.parentId)!).add(id);
    }
    // one partition per parent: each is arranged inside its own parent (local coordinates); parentId never changes
    for (const [pid, set] of groups) {
      if (set.size < 2) continue;
      arrangeLevel(c, pid, set, null);
    }
    // grow parents / ancestors to fit (never shrink or move them); grown containers push overlapped siblings aside
    for (const pid of groups.keys()) {
      if (!pid) continue;
      settleAncestors(c, [...groups.get(pid)!][0], false);
      for (let cur = c.byId.get(pid), i = 0; cur && i < 64; cur = cur.parentId ? c.byId.get(cur.parentId) : undefined, i++) if (c.sizes.has(cur.id)) settleAncestors(c, cur.id, true);
    }
  }
  // only report what changed
  const res: ArrangeResult = new Map();
  for (const [id, p] of c.out) {
    const n = c.byId.get(id)!;
    const s = nodeSize(n);
    const moved = p.x !== n.position.x || p.y !== n.position.y;
    const resized = p.width !== undefined && (p.width !== s.width || p.height !== s.height);
    if (moved || resized) res.set(id, p);
  }
  return res;
}
