import type { DiagramNode } from '../types';
import { absolutePosition, ancestorsOf, isContainer, nodeSize, resolveParent } from './graph';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PlaceOptions {
  pad?: number;
  grid?: number;
  /** candidate rects must stay inside (e.g. the inner area of a group) */
  bounds?: Rect;
  maxSteps?: number;
}

export const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.width + pad && a.x + a.width + pad > b.x && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
const inside = (r: Rect, b: Rect) => r.x >= b.x && r.y >= b.y && r.x + r.width <= b.x + b.width && r.y + r.height <= b.y + b.height;

/**
 * Nearest free position for `rect` on the grid: the spot itself if it is free, otherwise a spiral search that
 * prefers moving right, then down, then left / up. Returns the new top-left.
 */
export function findFreeSpot(rect: Rect, obstacles: Rect[], opts: PlaceOptions = {}): { x: number; y: number } {
  const pad = opts.pad ?? 16;
  const grid = opts.grid ?? 20;
  const free = (r: Rect) => (!opts.bounds || inside(r, opts.bounds)) && !obstacles.some((o) => overlaps(r, o, pad));
  if (free(rect)) return { x: rect.x, y: rect.y };
  const R = opts.maxSteps ?? 40;
  const cands: { i: number; j: number; score: number }[] = [];
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      if (!i && !j) continue;
      // right is cheapest, then down; left and up cost more
      const score = Math.hypot(i > 0 ? i * 0.7 : -i * 1.8, j > 0 ? j * 1.2 : -j * 2.2);
      cands.push({ i, j, score });
    }
  cands.sort((a, b) => a.score - b.score);
  for (const c of cands) {
    const r = { ...rect, x: rect.x + c.i * grid, y: rect.y + c.j * grid };
    if (free(r)) return { x: r.x, y: r.y };
  }
  return { x: rect.x, y: rect.y };
}

const absRect = (nodes: DiagramNode[], n: DiagramNode): Rect => {
  const p = absolutePosition(nodes, n);
  const s = nodeSize(n);
  return { x: p.x, y: p.y, width: s.width, height: s.height };
};

/**
 * Place new node(s) so they never stack on existing ones. The first incoming node is the anchor; the rest keep their
 * relative offsets (e.g. a group and its children). The anchor may land inside a group (resolveParent) and then
 * stays inside that group.
 */
export function placeInto(existing: DiagramNode[], incoming: DiagramNode[], opts: PlaceOptions = {}): DiagramNode[] {
  if (!incoming.length) return incoming;
  const anchor = incoming[0];
  const placed = anchor.parentId ? anchor : resolveParent(existing, anchor);
  const parent = placed.parentId ? existing.find((n) => n.id === placed.parentId) : undefined;
  const incomingIds = new Set(incoming.map((n) => n.id));
  const roots = incoming.filter((n) => !n.parentId || !incomingIds.has(n.parentId));
  // bounding box of everything that moves together (absolute)
  const rootOf = (n: DiagramNode) => (n.id === anchor.id ? placed : n);
  const rects = roots.map((n) => {
    const r = rootOf(n);
    const base = r.parentId && existing.some((e) => e.id === r.parentId) ? absolutePosition(existing, { ...r }) : r.position;
    const s = nodeSize(r);
    return { x: base.x, y: base.y, width: s.width, height: s.height };
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const box = { x: minX, y: minY, width: Math.max(...rects.map((r) => r.x + r.width)) - minX, height: Math.max(...rects.map((r) => r.y + r.height)) - minY };
  const movingContainer = roots.some(isContainer);
  const skip = new Set<string>(parent ? [parent.id, ...ancestorsOf(existing, parent.id).map((x) => x.id)] : []);
  const obstacles = existing
    .filter((n) => !n.hidden && (movingContainer ? !skip.has(n.id) : !isContainer(n)))
    .map((n) => absRect(existing, n));
  let bounds: Rect | undefined = opts.bounds;
  if (parent) {
    const pr = absRect(existing, parent);
    bounds = { x: pr.x + 8, y: pr.y + 44, width: pr.width - 16, height: pr.height - 52 };
  }
  const spot = findFreeSpot(box, obstacles, { ...opts, bounds });
  const dx = spot.x - box.x;
  const dy = spot.y - box.y;
  const pAbs = parent ? absolutePosition(existing, parent) : { x: 0, y: 0 };
  return incoming.map((n) => {
    if (n.id === anchor.id) {
      const abs = { x: rects[roots.indexOf(n)].x + dx, y: rects[roots.indexOf(n)].y + dy };
      return { ...placed, position: parent ? { x: abs.x - pAbs.x, y: abs.y - pAbs.y } : abs, ...(parent ? { parentId: parent.id } : {}) };
    }
    if (roots.includes(n)) {
      const r = rects[roots.indexOf(n)];
      return { ...n, position: { x: r.x + dx - (n.parentId ? 0 : 0), y: r.y + dy } };
    }
    return n; // descendants stay relative to their (moved) parent
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Click-to-add (palette click, command palette): look for room in the VISIBLE viewport first.
// ---------------------------------------------------------------------------------------------------------------

export interface ClickPlaceOptions {
  /** visible canvas area in flow coordinates, already reduced by the floating UI (top bar, panels, dock) */
  view: Rect;
  /** node to place next to: the selected node, else the one added last */
  anchor?: DiagramNode;
  /** selected group: the new node goes inside it */
  group?: DiagramNode;
  grid?: number;
  pad?: number;
}
export interface ClickPlacement {
  nodes: DiagramNode[];
  /** no free spot inside the viewport: the node sits just outside and the caller should pan to `focus` */
  outside: boolean;
  /** absolute rect of the placed anchor node */
  focus: Rect;
}

const snapDown = (v: number, g: number) => Math.floor(v / g) * g;
const snapUp = (v: number, g: number) => Math.ceil(v / g) * g;
const within = (r: Rect, b: Rect) => r.x >= b.x && r.y >= b.y && r.x + r.width <= b.x + b.width && r.y + r.height <= b.y + b.height;

/** Top-left (absolute) where the moving box should go, or null when nothing in `area` is free. */
function scanArea(size: { width: number; height: number }, area: Rect, free: (r: Rect) => boolean, grid: number, prefer: (r: Rect) => number, start?: { x: number; y: number }): { x: number; y: number } | null {
  const x0 = snapUp(area.x, grid);
  const y0 = snapUp(area.y, grid);
  const maxX = area.x + area.width - size.width;
  const maxY = area.y + area.height - size.height;
  if (maxX < x0 || maxY < y0) return null;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = start ? Math.max(y0, start.y) : y0; y <= maxY; y += grid)
    for (let x = x0; x <= maxX; x += grid) {
      const r = { x, y, width: size.width, height: size.height };
      if (!free(r)) continue;
      const d = prefer(r);
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}

export function clickPlace(existing: DiagramNode[], incoming: DiagramNode[], opts: ClickPlaceOptions): ClickPlacement {
  const grid = opts.grid ?? 20;
  const pad = opts.pad ?? 16;
  if (!incoming.length) return { nodes: incoming, outside: false, focus: { x: 0, y: 0, width: 0, height: 0 } };
  const anchorNode = incoming[0];
  const ids = new Set(incoming.map((n) => n.id));
  const roots = incoming.filter((n) => !n.parentId || !ids.has(n.parentId));
  const rects = roots.map((n) => ({ n, s: nodeSize(n), p: n.position }));
  const minX = Math.min(...rects.map((r) => r.p.x));
  const minY = Math.min(...rects.map((r) => r.p.y));
  const box = { width: Math.max(...rects.map((r) => r.p.x + r.s.width)) - minX, height: Math.max(...rects.map((r) => r.p.y + r.s.height)) - minY };

  const group = opts.group && isContainer(opts.group) && !isContainer(anchorNode) ? opts.group : undefined;
  const skip = new Set<string>(group ? [group.id, ...ancestorsOf(existing, group.id).map((x) => x.id)] : []);
  const obstacles = existing.filter((n) => !n.hidden && !skip.has(n.id)).map((n) => absRect(existing, n));
  const free = (r: Rect) => !obstacles.some((o) => overlaps(r, o, pad));

  let inner: Rect | undefined;
  if (group) {
    const g = absRect(existing, group);
    inner = { x: g.x + 8, y: g.y + 44, width: g.width - 16, height: g.height - 52 };
  }
  const viewArea = inner ? intersect(inner, opts.view) : opts.view;
  const vc = { x: opts.view.x + opts.view.width / 2, y: opts.view.y + opts.view.height / 2 };
  const fromCenter = (r: Rect) => Math.hypot(r.x + r.width / 2 - vc.x, r.y + r.height / 2 - vc.y);

  let spot: { x: number; y: number } | null = null;
  const a = opts.anchor && opts.anchor.id !== anchorNode.id && !opts.anchor.hidden && !isContainer(opts.anchor) && existing.some((n) => n.id === opts.anchor!.id) ? absRect(existing, opts.anchor) : undefined;
  const okIn = (r: Rect, area: Rect | undefined) => !!area && within(r, area) && free(r);
  if (a && viewArea) {
    // 1. right of the anchor, same row
    const right = { x: snapUp(a.x + a.width + pad, grid), y: snapDown(a.y, grid), ...box };
    if (okIn(right, viewArea)) spot = right;
    else {
      // 2. wrap: start of the anchor's row, one row down (rows read left to right)
      const row = existing.filter((n) => !n.hidden && !isContainer(n)).map((n) => absRect(existing, n)).filter((r) => r.y < a.y + a.height && r.y + r.height > a.y);
      const rowStart = Math.max(snapUp(viewArea.x, grid), snapDown(Math.min(a.x, ...row.map((r) => r.x)), grid));
      const rowBottom = Math.max(a.y + a.height, ...row.map((r) => r.y + r.height));
      const startY = snapUp(rowBottom + pad, grid);
      const wrapped = { x: rowStart, y: startY, ...box };
      if (okIn(wrapped, viewArea)) spot = wrapped;
      else {
        // 3. first free cell in reading order from that row on
        const hit = scanArea(box, viewArea, free, grid, (r) => r.y * 10000 + r.x, { x: 0, y: startY });
        if (hit) spot = hit;
      }
    }
  }
  // inside a group fill from the top-left (reading order); on the open canvas the closest free cell to the centre
  if (!spot && viewArea) spot = scanArea(box, viewArea, free, grid, group ? (r) => r.y * 10000 + r.x : fromCenter);

  let outside = false;
  if (!spot && inner) {
    // selected group, but nothing free in the visible part of it: anywhere inside the group
    spot = scanArea(box, inner, free, grid, (r) => r.y * 10000 + r.x);
    outside = !!spot && !within({ ...spot, ...box }, opts.view);
  }
  let useGroup = group && spot ? group : undefined;
  if (!spot) {
    // nothing free in view: nearest free spot outside it (right, then down), and the caller pans there
    const seed = { x: snapDown(vc.x - box.width / 2, grid), y: snapDown(vc.y - box.height / 2, grid), ...box };
    const outsideObstacles = [...existing.filter((n) => !n.hidden).map((n) => absRect(existing, n))];
    spot = findFreeSpot(seed, outsideObstacles, { pad, grid, maxSteps: 80 });
    outside = true;
    useGroup = undefined;
  }

  const dx = spot.x - minX;
  const dy = spot.y - minY;
  const pAbs = useGroup ? absolutePosition(existing, useGroup) : { x: 0, y: 0 };
  const moved = incoming.map((n) => {
    if (!roots.includes(n)) return n;
    const abs = { x: n.position.x + dx, y: n.position.y + dy };
    return useGroup ? { ...n, parentId: useGroup.id, position: { x: abs.x - pAbs.x, y: abs.y - pAbs.y } } : { ...n, position: abs };
  });
  // final safety net (also resolves nesting for items dropped over a group)
  const nodes = useGroup ? moved : placeInto(existing, moved, { pad, grid });
  const first = nodes[0];
  return { nodes, outside, focus: absRect([...existing, ...nodes], first) };
}

function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bt = Math.min(a.y + a.height, b.y + b.height);
  return r > x && bt > y ? { x, y, width: r - x, height: bt - y } : undefined;
}
