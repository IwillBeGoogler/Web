/**
 * Deterministic layered (Sugiyama) placement used by Auto layout: cycle removal, longest-path layering with source compaction,
 * virtual nodes for long edges, median/barycenter sweeps + adjacent transposition (crossing minimisation), and coordinate
 * assignment by isotonic regression (pool-adjacent-violators) so every node sits as close as possible to its neighbours
 * without ever overlapping. Pure maths over boxes; callers map to real nodes.
 */
export interface Box { id: string; w: number; h: number }
export type Pair = [string, string];
export interface Pt { x: number; y: number }
export interface LayeredOptions {
  direction: 'TB' | 'LR';
  /** space between nodes of one layer */
  gapAcross: number;
  /** space between layers */
  gapAlong: number;
  /** same-layer hints (e.g. UML associations): never decide the layer of a node that has strict edges */
  soft?: Pair[];
}

interface LNode { id: string; virtual: boolean; layer: number; along: number; across: number; c: number; w: number }
const VIRTUAL_ACROSS = 10;

/** DFS back edges are reversed so the graph is acyclic (input order decides, so it is deterministic) */
function makeAcyclic(ids: string[], edges: Pair[]): Pair[] {
  const out = new Map<string, string[]>(ids.map((i) => [i, []]));
  const seen = new Set<string>();
  for (const [a, b] of edges) {
    if (a === b || !out.has(a) || !out.has(b) || seen.has(`${a}\u0000${b}`)) continue;
    seen.add(`${a}\u0000${b}`);
    out.get(a)!.push(b);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const dag: Pair[] = [];
  const dagSeen = new Set<string>();
  const add = (a: string, b: string) => { const k = `${a}\u0000${b}`; if (!dagSeen.has(k)) { dagSeen.add(k); dag.push([a, b]); } };
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of out.get(u)!) {
      const s = state.get(v) ?? 0;
      if (s === 1) add(v, u);
      else { add(u, v); if (s === 0) visit(v); }
    }
    state.set(u, 2);
  };
  for (const i of ids) if (!state.get(i)) visit(i);
  return dag;
}

function crossingsBetween(upper: string[], lower: string[], down: Map<string, string[]>, pos: Map<string, number>): number {
  void upper;
  const es: [number, number][] = [];
  for (const u of upper) for (const v of down.get(u) ?? []) es.push([pos.get(u)!, pos.get(v)!]);
  void lower;
  let c = 0;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
  return c;
}

/** minimise sum w_i (x_i - t_i)^2 subject to x non-decreasing (PAV) */
function isotonic(t: number[], w: number[]): number[] {
  const blocks: { sum: number; w: number; n: number }[] = [];
  t.forEach((v, i) => {
    blocks.push({ sum: v * w[i], w: w[i], n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.w <= b.sum / b.w) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, w: a.w + b.w, n: a.n + b.n });
    }
  });
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.w);
  return out;
}

export function layeredPlace(boxes: Box[], edges: Pair[], o: LayeredOptions): Map<string, Pt> {
  const res = new Map<string, Pt>();
  if (!boxes.length) return res;
  const LR = o.direction === 'LR';
  const ids = boxes.map((b) => b.id);
  const box = new Map(boxes.map((b) => [b.id, b]));
  const dag = makeAcyclic(ids, edges);

  // ---- layering: longest path, then sources slide next to their nearest successor
  const preds = new Map<string, string[]>(ids.map((i) => [i, []]));
  const succs = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const [a, b] of dag) { preds.get(b)!.push(a); succs.get(a)!.push(b); }
  const layer = new Map<string, number>();
  const rank = (id: string): number => {
    const hit = layer.get(id);
    if (hit !== undefined) return hit;
    const l = preds.get(id)!.length ? Math.max(...preds.get(id)!.map(rank)) + 1 : 0;
    layer.set(id, l);
    return l;
  };
  ids.forEach(rank);
  for (const id of ids) if (!preds.get(id)!.length && succs.get(id)!.length) layer.set(id, Math.min(...succs.get(id)!.map((s) => layer.get(s)!)) - 1);
  // soft: nodes with no strict edge join the layer of the first soft neighbour that has one
  const hasStrict = (id: string) => preds.get(id)!.length + succs.get(id)!.length > 0;
  for (let pass = 0; pass < 3 && o.soft?.length; pass++)
    for (const [a, b] of o.soft) {
      if (!box.has(a) || !box.has(b)) continue;
      if (!hasStrict(a) && hasStrict(b)) layer.set(a, layer.get(b)!);
      else if (!hasStrict(b) && hasStrict(a)) layer.set(b, layer.get(a)!);
    }
  const minLayer = Math.min(...layer.values());
  if (minLayer !== 0) for (const [k, v] of layer) layer.set(k, v - minLayer);

  // ---- virtual nodes
  const nodes = new Map<string, LNode>();
  for (const b of boxes) nodes.set(b.id, { id: b.id, virtual: false, layer: layer.get(b.id)!, along: LR ? b.w : b.h, across: LR ? b.h : b.w, c: 0, w: 1 });
  const down = new Map<string, string[]>();
  const up = new Map<string, string[]>();
  const link = (a: string, b: string) => { (down.get(a) ?? down.set(a, []).get(a)!).push(b); (up.get(b) ?? up.set(b, []).get(b)!).push(a); };
  let vseq = 0;
  for (const [a, b] of dag) {
    const la = nodes.get(a)!.layer;
    const lb = nodes.get(b)!.layer;
    let prev = a;
    for (let l = la + 1; l < lb; l++) {
      const vid = `\u0000v${vseq++}`;
      nodes.set(vid, { id: vid, virtual: true, layer: l, along: 0, across: VIRTUAL_ACROSS, c: 0, w: 3 });
      link(prev, vid);
      prev = vid;
    }
    link(prev, b);
  }
  const nLayers = Math.max(...[...nodes.values()].map((n) => n.layer)) + 1;
  const layers: string[][] = Array.from({ length: nLayers }, () => []);
  const placed = new Set<string>();
  const dfs = (id: string) => {
    placed.add(id);
    layers[nodes.get(id)!.layer].push(id);
    for (const s of down.get(id) ?? []) if (!placed.has(s)) dfs(s);
  };
  for (const id of [...ids, ...[...nodes.keys()].filter((k) => nodes.get(k)!.virtual)]) {
    if (placed.has(id)) continue;
    if ((up.get(id) ?? []).length === 0) dfs(id);
  }
  for (const id of nodes.keys()) if (!placed.has(id)) dfs(id);

  // ---- ordering
  const softOf = new Map<string, string[]>();
  for (const [a, b] of o.soft ?? []) if (nodes.has(a) && nodes.has(b)) { (softOf.get(a) ?? softOf.set(a, []).get(a)!).push(b); (softOf.get(b) ?? softOf.set(b, []).get(b)!).push(a); }
  const pos = new Map<string, number>();
  const reindex = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  reindex();
  const total = () => { let c = 0; for (let i = 0; i + 1 < nLayers; i++) c += crossingsBetween(layers[i], layers[i + 1], down, pos); return c; };
  const bigGraph = dag.length > 700;
  let best = layers.map((l) => [...l]);
  let bestC = bigGraph ? Infinity : total();
  const sweeps = bigGraph ? 4 : 14;
  for (let s = 0; s < sweeps; s++) {
    const downSweep = s % 2 === 0;
    const order = downSweep ? layers.map((_, i) => i) : layers.map((_, i) => nLayers - 1 - i);
    for (const li of order) {
      const nb = downSweep ? up : down;
      const key = new Map<string, number>();
      for (const id of layers[li]) {
        const ps = [...(nb.get(id) ?? []).map((n) => pos.get(n)!), ...(softOf.get(id) ?? []).filter((n) => nodes.get(n)!.layer === li).map((n) => pos.get(n)!)];
        key.set(id, ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos.get(id)!);
      }
      layers[li] = [...layers[li]].sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
      reindex();
    }
    if (!bigGraph) {
      let improved = true;
      for (let guard = 0; improved && guard < 6; guard++) {
        improved = false;
        for (let li = 0; li < nLayers; li++) {
          const local = () => (li > 0 ? crossingsBetween(layers[li - 1], layers[li], down, pos) : 0) + (li + 1 < nLayers ? crossingsBetween(layers[li], layers[li + 1], down, pos) : 0);
          for (let i = 0; i + 1 < layers[li].length; i++) {
            const before = local();
            [layers[li][i], layers[li][i + 1]] = [layers[li][i + 1], layers[li][i]];
            reindex();
            if (local() < before) improved = true;
            else { [layers[li][i], layers[li][i + 1]] = [layers[li][i + 1], layers[li][i]]; reindex(); }
          }
        }
      }
      const c = total();
      if (c < bestC) { bestC = c; best = layers.map((l) => [...l]); }
    }
  }
  if (!bigGraph) { best.forEach((l, i) => { layers[i] = l; }); reindex(); }

  // ---- across coordinates (centres): pack, then neighbour-pulling sweeps with isotonic separation
  const gapOf = (a: LNode, b: LNode) => (a.virtual && b.virtual ? 12 : a.virtual || b.virtual ? o.gapAcross * 0.5 : o.gapAcross);
  const offsets = (l: string[]) => {
    const off: number[] = [];
    let cur = 0;
    l.forEach((id, i) => { const n = nodes.get(id)!; off.push(cur); cur += n.across + (i + 1 < l.length ? gapOf(n, nodes.get(l[i + 1])!) : 0); });
    return { off, extent: cur };
  };
  const extents = layers.map((l) => offsets(l).extent);
  const widest = Math.max(...extents);
  layers.forEach((l, li) => { const { off } = offsets(l); l.forEach((id, i) => { const n = nodes.get(id)!; n.c = (widest - extents[li]) / 2 + off[i] + n.across / 2; }); });
  const relax = (li: number, nb: Map<string, string[]>) => {
    const l = layers[li];
    const { off } = offsets(l);
    const want = l.map((id) => {
      const n = nodes.get(id)!;
      const ns = [...(nb.get(id) ?? [])];
      return ns.length ? ns.reduce((s, x) => s + nodes.get(x)!.c, 0) / ns.length : n.c;
    });
    const t = l.map((id, i) => want[i] - nodes.get(id)!.across / 2 - off[i]);
    const iso = isotonic(t, l.map((id) => nodes.get(id)!.w));
    l.forEach((id, i) => { const n = nodes.get(id)!; n.c = iso[i] + off[i] + n.across / 2; });
  };
  for (let it = 0; it < 10; it++) {
    for (let li = 1; li < nLayers; li++) relax(li, up);
    for (let li = nLayers - 2; li >= 0; li--) relax(li, down);
  }
  for (let li = 1; li < nLayers; li++) relax(li, up);

  // ---- along coordinates
  const thick = layers.map((l) => Math.max(0, ...l.map((id) => nodes.get(id)!.along)));
  let flow = 0;
  const flowAt = thick.map((t) => { const f = flow; flow += t + o.gapAlong; return f; });
  let minAcross = Infinity;
  for (const n of nodes.values()) if (!n.virtual) minAcross = Math.min(minAcross, n.c - n.across / 2);
  for (const b of boxes) {
    const n = nodes.get(b.id)!;
    const a = flowAt[n.layer] + (thick[n.layer] - n.along) / 2;
    const c = n.c - n.across / 2 - minAcross;
    res.set(b.id, LR ? { x: a, y: c } : { x: c, y: a });
  }
  return res;
}
