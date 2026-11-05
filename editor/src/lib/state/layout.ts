import { isBorderPoint, type StateDef, type StateKind, type StateModel } from './types';

export interface Box { x: number; y: number; w: number; h: number }

export const SZ = {
  minW: 110,
  h: 40,
  actLine: 15,
  actPad: 10,
  initial: 20,
  final: 28,
  choice: 34,
  barLong: 96,
  barShort: 8,
  history: 30,
  point: 16,
  gapMain: 70,
  gapCross: 50,
  compPadX: 28,
  compTop: 38,
  compBottom: 24,
  regionGap: 36,
  charW: 7.4,
} as const;

/** Size of a (non composite) state node; composite states are sized from their content. */
export function stateSize(s: { kind: StateKind; name: string; activity?: string; vertical?: boolean }): { w: number; h: number } {
  switch (s.kind) {
    case 'initial': return { w: SZ.initial, h: SZ.initial };
    case 'final': return { w: SZ.final, h: SZ.final };
    case 'choice': return { w: SZ.choice, h: SZ.choice };
    case 'fork': case 'join': return s.vertical ? { w: SZ.barShort, h: SZ.barLong } : { w: SZ.barLong, h: SZ.barShort };
    case 'history': case 'deepHistory': return { w: SZ.history, h: SZ.history };
    case 'entryPoint': case 'exitPoint': return { w: SZ.point, h: SZ.point };
    default: {
      const lines = s.activity ? s.activity.split('\n').filter(Boolean) : [];
      const widest = Math.max(s.name.length, ...lines.map((l) => l.length * 0.92));
      return { w: Math.round(Math.max(SZ.minW, widest * SZ.charW + 36) / 10) * 10, h: SZ.h + (lines.length ? lines.length * SZ.actLine + SZ.actPad : 0) };
    }
  }
}

/**
 * Layered layout for a state machine. Returns a box per state: absolute for top level states, relative to the composite's
 * top left corner for nested ones (that is what React Flow wants for `parentId` children). Edges leaving a composite count
 * for the composite itself.
 */
export function layoutStates(model: StateModel): Map<string, Box> {
  const out = new Map<string, Box>();
  const byId = new Map(model.states.map((s) => [s.id, s]));
  const LR = model.direction === 'LR';

  function scope(parent: string | undefined, region?: number): { w: number; h: number } {
    const kids = model.states.filter((s) => s.parent === parent && !isBorderPoint(s.kind) && (region === undefined || (s.region ?? 0) === region));
    if (!kids.length) return { w: 0, h: 0 };
    const size = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      if (k.composite) {
        const inner = composite(k.id);
        const w = Math.max(inner.w + SZ.compPadX * 2, 170), h = inner.h + SZ.compTop + SZ.compBottom;
        for (const c of model.states) if (c.parent === k.id && !isBorderPoint(c.kind)) { const b = out.get(c.id)!; out.set(c.id, { ...b, x: b.x + (w - inner.w) / 2, y: b.y + SZ.compTop }); }
        size.set(k.id, { w, h: inner.h ? h : 80 });
        pinPoints(k.id, w, inner.h ? h : 80);
      } else size.set(k.id, stateSize({ ...k, vertical: LR }));
    }
    const ids = kids.map((k) => k.id);
    const top = (id: string): string | undefined => {
      let cur: StateDef | undefined = byId.get(id);
      while (cur && cur.parent !== parent) cur = cur.parent ? byId.get(cur.parent) : undefined;
      return cur?.id;
    };
    const seen = new Set<string>();
    let edges: [string, string][] = [];
    for (const t of model.transitions) {
      const a = top(t.from), b = top(t.to);
      if (!a || !b || !ids.includes(a) || !ids.includes(b) || a === b || seen.has(`${a}>${b}`)) continue;
      seen.add(`${a}>${b}`);
      edges.push([a, b]);
    }
    // break cycles: DFS from initial states first; an edge to a node on the stack is reversed
    const out_ = new Map<string, string[]>();
    for (const [a, b] of edges) out_.set(a, [...(out_.get(a) ?? []), b]);
    const state = new Map<string, 0 | 1 | 2>();
    const back = new Set<string>();
    const visit = (n: string) => {
      state.set(n, 1);
      for (const m of out_.get(n) ?? []) {
        if (state.get(m) === 1) back.add(`${n}>${m}`);
        else if (!state.get(m)) visit(m);
      }
      state.set(n, 2);
    };
    const roots = [...ids.filter((i) => byId.get(i)!.kind === 'initial'), ...ids];
    for (const r of roots) if (!state.get(r)) visit(r);
    edges = edges.map(([a, b]) => (back.has(`${a}>${b}`) ? [b, a] : [a, b]));
    // longest path layering
    const preds = new Map<string, string[]>();
    for (const [a, b] of edges) preds.set(b, [...(preds.get(b) ?? []), a]);
    const layer = new Map<string, number>();
    const depth = (n: string): number => {
      if (layer.has(n)) return layer.get(n)!;
      layer.set(n, 0);
      const l = Math.max(-1, ...(preds.get(n) ?? []).map(depth)) + 1;
      layer.set(n, l);
      return l;
    };
    ids.forEach(depth);
    const nLayers = Math.max(...ids.map((i) => layer.get(i)!)) + 1;
    const layers: string[][] = Array.from({ length: nLayers }, () => []);
    for (const i of ids) layers[layer.get(i)!].push(i);
    // crossing reduction: barycentre sweeps
    const adj = new Map<string, string[]>();
    for (const [a, b] of edges) { adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); }
    const pos = new Map<string, number>();
    const index = () => layers.forEach((l) => l.forEach((n, i) => pos.set(n, i)));
    index();
    for (let sweep = 0; sweep < 4; sweep++) {
      const order = sweep % 2 ? [...layers.keys()].reverse() : [...layers.keys()];
      for (const li of order) {
        const bary = (n: string) => {
          const ns = (adj.get(n) ?? []).filter((m) => layer.get(m) !== li && Math.abs(layer.get(m)! - li) === 1);
          return ns.length ? ns.reduce((s, m) => s + pos.get(m)!, 0) / ns.length : pos.get(n)!;
        };
        layers[li].sort((a, b) => bary(a) - bary(b) || pos.get(a)! - pos.get(b)!);
        index();
      }
    }
    // left to right: widen the gap between two layers so the longest transition label between them fits
    const gaps = Array.from({ length: nLayers }, () => SZ.gapMain as number);
    if (LR) {
      for (const t of model.transitions) {
        const a = top(t.from), b = top(t.to);
        if (!a || !b || !t.label || !layer.has(a) || !layer.has(b) || !ids.includes(a) || !ids.includes(b)) continue;
        const la = layer.get(a)!, lb = layer.get(b)!;
        if (Math.abs(la - lb) !== 1) continue;
        const i = Math.min(la, lb);
        gaps[i] = Math.max(gaps[i], Math.round(t.label.length * SZ.charW + 24));
      }
    }
    // coordinates
    const main = (n: string) => (LR ? size.get(n)!.w : size.get(n)!.h);
    const cross = (n: string) => (LR ? size.get(n)!.h : size.get(n)!.w);
    const totals = layers.map((l) => l.reduce((s, n) => s + cross(n), 0) + Math.max(0, l.length - 1) * SZ.gapCross);
    const widest = Math.max(...totals);
    let m0 = 0;
    for (let li = 0; li < nLayers; li++) {
      const thick = Math.max(...layers[li].map(main));
      let c0 = (widest - totals[li]) / 2;
      for (const n of layers[li]) {
        const s = size.get(n)!;
        const mp = m0 + (thick - main(n)) / 2;
        out.set(n, LR ? { x: mp, y: c0, w: s.w, h: s.h } : { x: c0, y: mp, w: s.w, h: s.h });
        c0 += cross(n) + SZ.gapCross;
      }
      m0 += thick + gaps[li];
    }
    const lastGap = gaps[nLayers - 1];
    return LR ? { w: m0 - lastGap, h: widest } : { w: widest, h: m0 - lastGap };
  }
  /** entry points on the leading border (top / left), exit points on the trailing border, centred on the line, spread evenly */
  function pinPoints(id: string, w: number, h: number): void {
    for (const kind of ['entryPoint', 'exitPoint'] as const) {
      const pts = model.states.filter((c) => c.parent === id && c.kind === kind);
      pts.forEach((p, i) => {
        const s = SZ.point, f = (i + 1) / (pts.length + 1);
        const lead = kind === 'entryPoint';
        out.set(p.id, LR ? { x: (lead ? 0 : w) - s / 2, y: h * f - s / 2, w: s, h: s } : { x: w * f - s / 2, y: (lead ? 0 : h) - s / 2, w: s, h: s });
      });
    }
  }
  /** content size of a composite: one scope, or one scope per concurrent region side by side (stacked in left to right diagrams) */
  function composite(id: string): { w: number; h: number } {
    const regs = [...new Set(model.states.filter((c) => c.parent === id && !isBorderPoint(c.kind)).map((c) => c.region ?? 0))].sort((a, b) => a - b);
    if (regs.length <= 1) return scope(id);
    let off = 0, w = 0, h = 0;
    for (const r of regs) {
      const sz = scope(id, r);
      for (const c of model.states) if (c.parent === id && !isBorderPoint(c.kind) && (c.region ?? 0) === r) { const b = out.get(c.id)!; out.set(c.id, LR ? { ...b, y: b.y + off } : { ...b, x: b.x + off }); }
      if (LR) { off += sz.h + SZ.regionGap; w = Math.max(w, sz.w); h = off - SZ.regionGap; } else { off += sz.w + SZ.regionGap; h = Math.max(h, sz.h); w = off - SZ.regionGap; }
    }
    return { w, h };
  }
  scope(undefined);
  return out;
}
