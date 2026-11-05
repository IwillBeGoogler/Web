import type { DiagramEdge, DiagramNode } from '../../types';
import { nodeSize } from '../graph';
import { umlOf } from './edges';

export const GAP_X = 110;
/** vertical gap between rows: leaves room for multiplicity / role labels and the 16px relation markers */
export const GAP_Y = 90;
const COMPONENT_GAP = 110;
/** a row wider than this wraps onto further rows (a hub with many associated classes would otherwise be one very long line) */
export const MAX_ROW_W = 1000;
/** separate diagrams are placed side by side up to this width, then on the next shelf */
const SHELF_W = 1800;

export interface UmlLayoutOptions {
  origin?: { x: number; y: number };
}
interface L { id: string; w: number; h: number; rank: number; x: number; y: number; parents: Set<string>; children: Set<string>; links: Set<string>; order: number }

const HIERARCHY = new Set(['inheritance', 'realization']);

/**
 * Layered layout for class diagrams. Inheritance and realization decide the rows (parents above children, siblings in one row);
 * plain associations, aggregations, compositions and dependencies pull classes into the SAME row, side by side. Rows are
 * ordered by barycentre to cut crossings, parents are centred over their children, and separate diagrams sit next to each other.
 */
export function layoutClasses(nodes: DiagramNode[], edges: DiagramEdge[], opts: UmlLayoutOptions = {}): Map<string, { x: number; y: number }> {
  const byId = new Map<string, L>();
  let seq = 0;
  for (const n of nodes) {
    if (n.type !== 'class') continue;
    const s = nodeSize(n);
    byId.set(n.id, { id: n.id, w: s.width, h: s.height, rank: 0, x: 0, y: 0, parents: new Set(), children: new Set(), links: new Set(), order: seq++ });
  }
  const out = new Map<string, { x: number; y: number }>();
  if (!byId.size) return out;

  const hier: [string, string][] = []; // [parent, child]
  const assoc: [string, string][] = [];
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue;
    const k = umlOf(e)?.kind;
    byId.get(e.source)!.links.add(e.target);
    byId.get(e.target)!.links.add(e.source);
    if (k && HIERARCHY.has(k)) hier.push([e.target, e.source]);
    else assoc.push([e.source, e.target]);
  }
  // acyclic hierarchy (drop DFS back edges)
  const kids = new Map<string, string[]>();
  for (const [p, c] of hier) (kids.get(p) ?? kids.set(p, []).get(p)!).push(c);
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of kids.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) continue;
      byId.get(u)!.children.add(v);
      byId.get(v)!.parents.add(u);
      if (s === 0) visit(v);
    }
    state.set(u, 2);
  };
  for (const id of byId.keys()) if (!state.get(id)) visit(id);

  // connected components (all links)
  const seen = new Set<string>();
  const comps: L[][] = [];
  for (const id of byId.keys()) {
    if (seen.has(id)) continue;
    const comp: L[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(byId.get(u)!);
      for (const v of byId.get(u)!.links) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    comp.sort((a, b) => a.order - b.order);
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length || a.at(0)!.order - b.at(0)!.order);

  const origin = opts.origin ?? { x: 0, y: 0 };
  let cursorX = 0;
  let shelfY = 0;
  let shelfH = 0;
  for (const comp of comps) {
    const box = layoutComponent(comp, byId, assoc);
    if (cursorX > 0 && cursorX + box.width > SHELF_W) { shelfY += shelfH + COMPONENT_GAP; cursorX = 0; shelfH = 0; }
    for (const n of comp) out.set(n.id, { x: Math.round(n.x - box.minX + cursorX + origin.x), y: Math.round(n.y + shelfY + origin.y) });
    cursorX += box.width + COMPONENT_GAP;
    shelfH = Math.max(shelfH, box.height);
  }
  return out;
}

function layoutComponent(comp: L[], all: Map<string, L>, assoc: [string, string][]): { minX: number; width: number; height: number } {
  const inComp = new Set(comp.map((n) => n.id));
  // ranks from the hierarchy: longest path below a root
  const memo = new Map<string, number>();
  const depth = (n: L): number => {
    const hit = memo.get(n.id);
    if (hit !== undefined) return hit;
    memo.set(n.id, 0);
    let d = 0;
    for (const p of n.parents) if (inComp.has(p)) d = Math.max(d, depth(all.get(p)!) + 1);
    memo.set(n.id, d);
    return d;
  };
  comp.forEach((n) => { n.rank = depth(n); });
  // classes outside any hierarchy join the row of what they are associated with (side by side)
  const inHier = (n: L) => n.parents.size > 0 || n.children.size > 0;
  const ranked = new Set(comp.filter(inHier).map((n) => n.id));
  if (!ranked.size && comp.length) ranked.add(comp[0].id); // no hierarchy at all: the first class anchors row 0
  for (let pass = 0; pass < comp.length && ranked.size < comp.length; pass++) {
    for (const [a, b] of assoc) {
      if (!inComp.has(a) || !inComp.has(b)) continue;
      const A = all.get(a)!;
      const B = all.get(b)!;
      if (ranked.has(a) && !ranked.has(b)) { B.rank = A.rank; ranked.add(b); }
      else if (ranked.has(b) && !ranked.has(a)) { A.rank = B.rank; ranked.add(a); }
    }
  }
  const ranks = [...new Set(comp.map((n) => n.rank))].sort((a, b) => a - b);
  const rows = ranks.map((r) => comp.filter((n) => n.rank === r));
  // order inside rows: barycentre sweeps over all links
  const pos = new Map<string, number>();
  const reindex = () => rows.forEach((row) => row.forEach((n, i) => pos.set(n.id, i / Math.max(1, row.length - 1 || 1))));
  reindex();
  for (let sweep = 0; sweep < 8; sweep++) {
    const order = sweep % 2 === 0 ? rows.map((_, i) => i) : rows.map((_, i) => rows.length - 1 - i);
    for (const ri of order) {
      const row = rows[ri];
      const keyed = row.map((n, i) => {
        const ns = [...n.links].filter((id) => inComp.has(id) && all.get(id)!.rank !== n.rank);
        const k = ns.length ? ns.reduce((a, id) => a + (pos.get(id) ?? 0), 0) / ns.length : -1;
        return { n, k, i };
      });
      const movable = keyed.filter((x) => x.k >= 0).sort((a, b) => a.k - b.k || a.i - b.i);
      let mi = 0;
      rows[ri] = keyed.map((x) => (x.k < 0 ? x.n : movable[mi++].n));
      rows[ri].forEach((n, i) => pos.set(n.id, i / Math.max(1, rows[ri].length - 1 || 1)));
    }
  }
  // keep associated classes of one row adjacent: pull a class next to its same-row partner
  for (const row of rows) {
    for (const [a, b] of assoc) {
      const ia = row.findIndex((n) => n.id === a);
      const ib = row.findIndex((n) => n.id === b);
      if (ia < 0 || ib < 0 || Math.abs(ia - ib) <= 1) continue;
      const [moved] = row.splice(ib, 1);
      row.splice(ia + (ib > ia ? 1 : 0), 0, moved);
    }
  }
  // wrap rows that are too wide into consecutive rows (order kept, so ranks still run top to bottom)
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let w = 0;
    let cut = -1;
    for (let i = 0; i < row.length; i++) {
      w += row[i].w + GAP_X;
      if (w - GAP_X > MAX_ROW_W && i > 0) { cut = i; break; }
    }
    if (cut > 0) rows.splice(ri + 1, 0, row.splice(cut));
  }
  // y per row
  let y = 0;
  rows.forEach((row) => {
    const h = Math.max(...row.map((n) => n.h));
    row.forEach((n) => { n.y = y; });
    y += h + GAP_Y;
  });
  // x: pack, then centre parents over children (bottom-up) and resolve overlaps (left to right)
  rows.forEach((row) => {
    let x = 0;
    row.forEach((n) => { n.x = x; x += n.w + GAP_X; });
  });
  const resolve = (row: L[]) => {
    const s = [...row].sort((a, b) => a.x - b.x || a.order - b.order);
    for (let i = 1; i < s.length; i++) s[i].x = Math.max(s[i].x, s[i - 1].x + s[i - 1].w + GAP_X);
  };
  for (let round = 0; round < 6; round++) {
    for (let ri = rows.length - 1; ri >= 0; ri--) {
      for (const n of rows[ri]) {
        const ks = [...n.children].filter((c) => inComp.has(c) && all.get(c)!.rank > n.rank).map((c) => all.get(c)!);
        if (!ks.length) continue;
        const mid = ks.reduce((a, k) => a + k.x + k.w / 2, 0) / ks.length;
        n.x = mid - n.w / 2;
      }
      resolve(rows[ri]);
    }
    // children follow a lone parent back down so a chain stays vertical
    for (let ri = 0; ri < rows.length; ri++) {
      for (const n of rows[ri]) {
        const ps = [...n.parents].filter((p) => inComp.has(p) && all.get(p)!.rank < n.rank).map((p) => all.get(p)!);
        if (ps.length !== 1 || ps[0].children.size !== 1) continue;
        n.x = ps[0].x + ps[0].w / 2 - n.w / 2;
      }
      resolve(rows[ri]);
    }
  }
  const minX = Math.min(...comp.map((n) => n.x));
  const maxX = Math.max(...comp.map((n) => n.x + n.w));
  return { minX, width: maxX - minX, height: Math.max(...comp.map((n) => n.y + n.h)) };
}
