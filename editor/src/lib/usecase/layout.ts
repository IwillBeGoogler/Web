import { shapeSize } from '../uml2/sizes';
import type { UseCaseModel } from './types';

export interface Box { x: number; y: number; w: number; h: number }
export interface UseCaseLayout {
  /** actors and use cases (absolute) */
  boxes: Map<string, Box>;
  /** system boundaries (absolute) */
  boundaries: Map<string, Box>;
  /** which side of the system each actor was put on */
  side: Map<string, 'left' | 'right'>;
}

export const UC_GAP = { actor: 100, col: 70, row: 30, actorRow: 28, padX: 44, padTop: 54, padBottom: 30, block: 44 } as const;

/**
 * Auto-layout of a use case diagram: actors in columns on the left and right of the system, the use cases inside the
 * system boundary in columns (an included / extending use case sits one column right of the use case it belongs to),
 * ordered by the actors they are connected to; every actor is centred on the use cases it uses.
 */
export function layoutUseCase(model: UseCaseModel): UseCaseLayout {
  const boxes = new Map<string, Box>();
  const boundaries = new Map<string, Box>();
  const side = new Map<string, 'left' | 'right'>();
  const size = new Map<string, { w: number; h: number }>();
  for (const a of model.actors) { const s = shapeSize('usecase', { label: a.name, ucKind: 'actor' }); size.set(a.id, { w: s.width, h: s.height }); }
  for (const c of model.cases) { const s = shapeSize('usecase', { label: c.name, ucKind: 'usecase', extensionPoints: c.extensionPoints }); size.set(c.id, { w: s.width, h: s.height }); }

  // ---- actors: the first half on the left, the rest on the right
  const nLeft = model.actors.length > 1 ? Math.ceil(model.actors.length / 2) : model.actors.length;
  model.actors.forEach((a, i) => side.set(a.id, i < nLeft ? 'left' : 'right'));
  const rank = new Map<string, number>(); // 0..1 down the side
  for (const s of ['left', 'right'] as const) {
    const list = model.actors.filter((a) => side.get(a.id) === s);
    list.forEach((a, i) => rank.set(a.id, list.length > 1 ? i / (list.length - 1) : 0.5));
  }
  const actorIds = new Set(model.actors.map((a) => a.id));
  const actorsOf = (caseId: string) => model.relations.filter((r) => r.kind === 'association').flatMap((r) => (r.to === caseId && actorIds.has(r.from) ? [r.from] : r.from === caseId && actorIds.has(r.to) ? [r.to] : []));

  // ---- blocks of use cases: one per boundary, plus the loose ones
  const boundaryIds = new Set(model.boundaries.map((b) => b.id));
  const blockOf = (c: { boundary?: string }) => (c.boundary && boundaryIds.has(c.boundary) ? c.boundary : '');
  const blockKeys = [...model.boundaries.map((b) => b.id), ''].filter((k) => model.cases.some((c) => blockOf(c) === k));
  interface Block { key: string; cols: string[][]; colW: number[]; w: number; h: number; y: number }
  const blocks: Block[] = [];
  const caseIndex = new Map(model.cases.map((c, i) => [c.id, i]));
  const baryActor = (id: string) => { const a = actorsOf(id); return a.length ? a.reduce((s, x) => s + (rank.get(x) ?? 0.5), 0) / a.length : undefined; };
  for (const key of blockKeys) {
    const cases = model.cases.filter((c) => blockOf(c) === key);
    const set = new Set(cases.map((c) => c.id));
    // include: the included case is one column right; extend: the extending case is one column right of the extended one
    const constraints = model.relations.filter((r) => (r.kind === 'include' || r.kind === 'extend') && set.has(r.from) && set.has(r.to)).map((r) => (r.kind === 'include' ? { base: r.from, next: r.to } : { base: r.to, next: r.from }));
    const layer = new Map(cases.map((c) => [c.id, 0]));
    for (let it = 0; it < cases.length; it++) {
      let changed = false;
      for (const k of constraints) if (layer.get(k.next)! < layer.get(k.base)! + 1 && layer.get(k.base)! < cases.length) { layer.set(k.next, layer.get(k.base)! + 1); changed = true; }
      if (!changed) break;
    }
    const nCols = Math.max(...layer.values()) + 1;
    const cols: string[][] = Array.from({ length: nCols }, () => []);
    for (const c of cases) cols[layer.get(c.id)!].push(c.id);
    const pos = new Map<string, number>(); // order key inside the column
    cols.forEach((col, li) => {
      const key2 = (id: string) => {
        const nb = constraints.filter((k) => k.next === id || k.base === id).map((k) => (k.next === id ? k.base : k.next)).filter((o) => layer.get(o)! < li && pos.has(o)).map((o) => pos.get(o)!);
        if (nb.length) return nb.reduce((s, x) => s + x, 0) / nb.length;
        return baryActor(id) ?? 0.5 + (caseIndex.get(id)! + 1) / 1000;
      };
      const keyed = col.map((id) => ({ id, k: key2(id) }));
      keyed.sort((a, b) => a.k - b.k || caseIndex.get(a.id)! - caseIndex.get(b.id)!);
      col.splice(0, col.length, ...keyed.map((x) => x.id));
      col.forEach((id, i) => pos.set(id, col.length > 1 ? i / (col.length - 1) : 0.5));
    });
    const colW = cols.map((col) => Math.max(...col.map((id) => size.get(id)!.w)));
    const colH = cols.map((col) => col.reduce((s, id) => s + size.get(id)!.h, 0) + (col.length - 1) * UC_GAP.row);
    const pad = key ? UC_GAP.padX * 2 : 0;
    blocks.push({ key, cols, colW, w: colW.reduce((s, x) => s + x, 0) + (nCols - 1) * UC_GAP.col + pad, h: Math.max(...colH), y: 0 });
  }
  const frameW = blocks.length ? Math.max(...blocks.map((b) => b.w)) : 0;

  // ---- x of the three zones
  const leftActors = model.actors.filter((a) => side.get(a.id) === 'left');
  const rightActors = model.actors.filter((a) => side.get(a.id) === 'right');
  const leftW = leftActors.length ? Math.max(...leftActors.map((a) => size.get(a.id)!.w)) : 0;
  const bx = leftW ? leftW + UC_GAP.actor : 0;
  const rx = bx + frameW + (frameW ? UC_GAP.actor : 0);

  // ---- y of the blocks (stacked), use cases inside each block
  let y = 0;
  for (const b of blocks) {
    const framed = !!b.key;
    const top = y, inner = framed ? UC_GAP.padTop : 0;
    b.y = top;
    let cx = bx + (framed ? UC_GAP.padX : 0);
    b.cols.forEach((col, li) => {
      const h = col.reduce((s, id) => s + size.get(id)!.h, 0) + (col.length - 1) * UC_GAP.row;
      let cy = top + inner + (b.h - h) / 2;
      for (const id of col) {
        const s = size.get(id)!;
        boxes.set(id, { x: cx + (b.colW[li] - s.w) / 2, y: cy, w: s.w, h: s.h });
        cy += s.h + UC_GAP.row;
      }
      cx += b.colW[li] + UC_GAP.col;
    });
    const total = b.h + inner + (framed ? UC_GAP.padBottom : 0);
    if (framed) boundaries.set(b.key, { x: bx, y: top, w: frameW, h: total });
    y += total + UC_GAP.block;
  }
  const systemH = Math.max(0, y - UC_GAP.block);

  // ---- actors: centred on the use cases they use, then pushed apart
  const place = (list: typeof model.actors, x0: number, wCol: number) => {
    const want = list.map((a) => {
      const ys = model.relations.flatMap((r) => (r.kind === 'association' && r.from === a.id && boxes.has(r.to) ? [r.to] : r.kind === 'association' && r.to === a.id && boxes.has(r.from) ? [r.from] : [])).map((id) => boxes.get(id)!.y + boxes.get(id)!.h / 2);
      return { a, c: ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : systemH / 2 };
    });
    want.sort((p, q) => p.c - q.c || list.indexOf(p.a) - list.indexOf(q.a));
    let floor = -Infinity;
    for (const { a, c } of want) {
      const s = size.get(a.id)!;
      const top = Math.max(c - s.h / 2, floor);
      boxes.set(a.id, { x: x0 + (wCol - s.w) / 2, y: top, w: s.w, h: s.h });
      floor = top + s.h + UC_GAP.actorRow;
    }
  };
  place(leftActors, 0, leftW);
  place(rightActors, rx, rightActors.length ? Math.max(...rightActors.map((a) => size.get(a.id)!.w)) : 0);

  // ---- nothing above zero
  const minY = Math.min(0, ...[...boxes.values(), ...boundaries.values()].map((b) => b.y));
  if (minY < 0) for (const m of [boxes, boundaries]) for (const [k, b] of m) m.set(k, { ...b, y: b.y - minY });
  return { boxes, boundaries, side };
}
