/**
 * Auto-layout containers (Figma "auto layout" for cards, stickies, icons ...). A `group` with `data.autoLayout` owns the position
 * of its children: direction (row / column / grid), gap, padding, alignment and hug / fill sizing. Pure maths first, then the
 * functions that apply it to a node list.
 */
import type { AutoLayoutConfig, DiagramNode, LayoutSizing } from '../../types';
import { groupNodes } from '../grouping';
import { ancestorsOf, nodeSize } from '../graph';

export const DEFAULT_AUTOLAYOUT: AutoLayoutConfig = { mode: 'row', gap: 16, padding: 16, align: 'start', justify: 'start', hugW: true, hugH: true };
const MIN_FILL = 20;

export interface LayoutItem { id: string; width: number; height: number; sizing?: LayoutSizing }
export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  sizes: Map<string, { width: number; height: number }>;
  width: number;
  height: number;
}

const place = (align: AutoLayoutConfig['align'], start: number, room: number, size: number): number =>
  align === 'center' ? start + (room - size) / 2 : align === 'end' ? start + room - size : start;

/** where every child goes, how big it is, and how big the container becomes */
export function computeAutoLayout(c: AutoLayoutConfig, container: { width: number; height: number }, items: LayoutItem[]): LayoutResult {
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { width: number; height: number }>();
  const pad = c.padding;
  const n = items.length;
  if (!n) return { positions, sizes, width: c.hugW ? pad * 2 : container.width, height: c.hugH ? pad * 2 : container.height };

  if (c.mode === 'grid') {
    const cols = Math.max(1, Math.floor(c.columns ?? 3));
    const rows = Math.ceil(n / cols);
    const gapY = c.gapY ?? c.gap;
    const fillW = items.some((i) => i.sizing?.w === 'fill');
    const fillH = items.some((i) => i.sizing?.h === 'fill');
    const colW = Array.from({ length: cols }, (_, ci) => Math.max(0, ...items.filter((_, i) => i % cols === ci).map((i) => i.width)));
    const rowH = Array.from({ length: rows }, (_, ri) => Math.max(0, ...items.slice(ri * cols, ri * cols + cols).map((i) => i.height)));
    if (fillW && !c.hugW) colW.fill(Math.max(MIN_FILL, (container.width - pad * 2 - c.gap * (cols - 1)) / cols));
    if (fillH && !c.hugH) rowH.fill(Math.max(MIN_FILL, (container.height - pad * 2 - gapY * (rows - 1)) / rows));
    const xs: number[] = [];
    let x = pad;
    for (const w of colW) { xs.push(x); x += w + c.gap; }
    const ys: number[] = [];
    let y = pad;
    for (const h of rowH) { ys.push(y); y += h + gapY; }
    items.forEach((it, i) => {
      const ci = i % cols;
      const ri = Math.floor(i / cols);
      const w = it.sizing?.w === 'fill' || c.align === 'stretch' ? colW[ci] : it.width;
      const h = it.sizing?.h === 'fill' || c.align === 'stretch' ? rowH[ri] : it.height;
      sizes.set(it.id, { width: w, height: h });
      positions.set(it.id, { x: place(c.align, xs[ci], colW[ci], w), y: place(c.align, ys[ri], rowH[ri], h) });
    });
    const totalW = colW.reduce((a, b) => a + b, 0) + c.gap * (cols - 1) + pad * 2;
    const totalH = rowH.reduce((a, b) => a + b, 0) + gapY * (rows - 1) + pad * 2;
    return { positions, sizes, width: c.hugW ? totalW : container.width, height: c.hugH ? totalH : container.height };
  }

  const row = c.mode === 'row';
  const mainOf = (w: number, h: number) => (row ? w : h);
  const hugMain = row ? c.hugW : c.hugH;
  const hugCross = row ? c.hugH : c.hugW;
  const mainFill = (i: LayoutItem) => (row ? i.sizing?.w : i.sizing?.h) === 'fill';
  const crossFill = (i: LayoutItem) => (row ? i.sizing?.h : i.sizing?.w) === 'fill' || c.align === 'stretch';
  const innerMain = mainOf(container.width, container.height) - pad * 2;
  const baseMain = items.map((i) => mainOf(i.width, i.height));
  const gaps = c.gap * (n - 1);
  const mainSizes = [...baseMain];
  if (!hugMain) {
    const fills = items.map((i, k) => (mainFill(i) ? k : -1)).filter((k) => k >= 0);
    if (fills.length) {
      const fixed = baseMain.reduce((a, b, k) => a + (fills.includes(k) ? 0 : b), 0);
      const share = Math.max(MIN_FILL, (innerMain - fixed - gaps) / fills.length);
      for (const k of fills) mainSizes[k] = share;
    }
  }
  const contentMain = mainSizes.reduce((a, b) => a + b, 0) + gaps;
  const innerCross = hugCross
    ? Math.max(0, ...items.map((i) => (row ? i.height : i.width)))
    : (row ? container.height : container.width) - pad * 2;
  const extra = hugMain ? 0 : Math.max(0, innerMain - contentMain);
  let cursor = pad + (c.justify === 'center' ? extra / 2 : c.justify === 'end' ? extra : 0);
  const between = c.justify === 'between' && n > 1 ? extra / (n - 1) : 0;
  items.forEach((it, k) => {
    const crossBase = row ? it.height : it.width;
    const cross = crossFill(it) ? innerCross : crossBase;
    const crossPos = place(c.align === 'stretch' ? 'start' : c.align, pad, innerCross, cross);
    const main = mainSizes[k];
    sizes.set(it.id, row ? { width: main, height: cross } : { width: cross, height: main });
    positions.set(it.id, row ? { x: cursor, y: crossPos } : { x: crossPos, y: cursor });
    cursor += main + c.gap + between;
  });
  const totalMain = contentMain + pad * 2;
  const totalCross = innerCross + pad * 2;
  return {
    positions, sizes,
    width: row ? (hugMain ? totalMain : container.width) : (hugCross ? totalCross : container.width),
    height: row ? (hugCross ? totalCross : container.height) : (hugMain ? totalMain : container.height),
  };
}

const takesPart = (n: DiagramNode) => !n.hidden && !n.data.hidden && !n.data.layoutAbsolute;

function layoutOne(nodes: DiagramNode[], containerId: string): DiagramNode[] {
  const box = nodes.find((n) => n.id === containerId);
  const cfg = box?.data.autoLayout;
  if (!box || !cfg) return nodes;
  const kids = nodes.filter((n) => n.parentId === containerId && takesPart(n));
  const items: LayoutItem[] = kids.map((k) => ({ id: k.id, ...nodeSize(k), sizing: k.data.layoutSizing }));
  const r = computeAutoLayout(cfg, nodeSize(box), items);
  let changed = false;
  const next = nodes.map((n) => {
    if (n.id === containerId) {
      const s = nodeSize(n);
      if (s.width === r.width && s.height === r.height) return n;
      changed = true;
      return { ...n, width: r.width, height: r.height, style: { ...(n.style ?? {}), width: r.width, height: r.height } };
    }
    const p = r.positions.get(n.id);
    if (!p) return n;
    const sz = r.sizes.get(n.id)!;
    const cur = nodeSize(n);
    if (n.position.x === p.x && n.position.y === p.y && cur.width === sz.width && cur.height === sz.height) return n;
    changed = true;
    const resized = cur.width !== sz.width || cur.height !== sz.height;
    return { ...n, position: p, ...(resized ? { width: sz.width, height: sz.height, style: { ...(n.style ?? {}), width: sz.width, height: sz.height } } : {}) };
  });
  return changed ? next : nodes;
}

/** lay out one container */
export const applyAutoLayout = layoutOne;

/** lay out every auto-layout container, innermost first; returns the same array when nothing moved */
export function reflowAll(nodes: DiagramNode[]): DiagramNode[] {
  const boxes = nodes.filter((n) => n.data.autoLayout);
  if (!boxes.length) return nodes;
  const depth = (n: DiagramNode) => ancestorsOf(nodes, n.id).length;
  const order = [...boxes].sort((a, b) => depth(b) - depth(a)).map((b) => b.id);
  return order.reduce((acc, id) => layoutOne(acc, id), nodes);
}

/** index where a child dropped at `point` (container coordinates) lands among `rects` (the other children, in order) */
export function dropIndex(c: AutoLayoutConfig, rects: { x: number; y: number; width: number; height: number }[], point: { x: number; y: number }): number {
  if (c.mode === 'grid') {
    let best = rects.length;
    let bestD = Infinity;
    rects.forEach((r, i) => {
      const d = Math.hypot(r.x + r.width / 2 - point.x, r.y + r.height / 2 - point.y);
      if (d < bestD) { bestD = d; best = point.x > r.x + r.width / 2 ? i + 1 : i; }
    });
    return Math.min(best, rects.length);
  }
  const row = c.mode === 'row';
  let idx = 0;
  rects.forEach((r, i) => { if ((row ? point.x : point.y) > (row ? r.x + r.width / 2 : r.y + r.height / 2)) idx = i + 1; });
  return idx;
}

/** move a child to position `index` among its siblings (the layout order is the array order) */
export function reorderChild(nodes: DiagramNode[], id: string, index: number): DiagramNode[] {
  const node = nodes.find((n) => n.id === id);
  if (!node?.parentId) return nodes;
  const sibs = nodes.filter((n) => n.parentId === node.parentId && n.id !== id);
  const i = Math.max(0, Math.min(index, sibs.length));
  const rest = nodes.filter((n) => n.id !== id);
  if (i >= sibs.length) {
    const last = sibs[sibs.length - 1];
    const at = last ? rest.findIndex((n) => n.id === last.id) + 1 : rest.findIndex((n) => n.id === node.parentId) + 1;
    return [...rest.slice(0, at), node, ...rest.slice(at)];
  }
  const at = rest.findIndex((n) => n.id === sibs[i].id);
  return [...rest.slice(0, at), node, ...rest.slice(at)];
}

/** wrap a selection of cards / stickies / icons in a new auto-layout container (a `group`) */
export function wrapInAutoLayout(nodes: DiagramNode[], ids: string[], groupId: string, over: Partial<AutoLayoutConfig> = {}): { nodes: DiagramNode[]; groupId: string } | null {
  const cfg: AutoLayoutConfig = { ...DEFAULT_AUTOLAYOUT, ...over };
  const r = groupNodes(nodes, ids, groupId, cfg.padding, 0, 'group', { label: 'Auto layout', autoLayout: cfg });
  if (!r) return null;
  // the children keep their current visual order along the main axis
  const kids = r.nodes.filter((n) => n.parentId === groupId);
  const key = (n: DiagramNode) => (cfg.mode === 'column' ? n.position.y : n.position.x);
  const sorted = [...kids].sort((a, b) => key(a) - key(b));
  const without = r.nodes.filter((n) => n.parentId !== groupId);
  const out = [...without.slice(0, without.findIndex((n) => n.id === groupId) + 1), ...sorted, ...without.slice(without.findIndex((n) => n.id === groupId) + 1)];
  return { nodes: reflowAll(out), groupId };
}

/** turn auto layout on (with a config) or off (null) for an existing group */
export function setAutoLayout(nodes: DiagramNode[], groupId: string, cfg: AutoLayoutConfig | null): DiagramNode[] {
  const next = nodes.map((n) => {
    if (n.id !== groupId) return n;
    const { autoLayout: _a, ...data } = n.data;
    void _a;
    return { ...n, data: cfg ? { ...data, autoLayout: cfg } : data };
  });
  return cfg ? reflowAll(next) : next;
}
