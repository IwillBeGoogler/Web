/** Mind map: tree helpers over mindmap nodes + parent->child edges, balanced left/right layout, collapse, Markdown outline. Pure. */
import type { DiagramEdge, DiagramNode } from '../../types';

export const MM_COLORS = ['#5b5bf7', '#0f9d8f', '#e8710a', '#d6409f', '#2f6fdb', '#8e4ec6', '#30a46c', '#d1344a'];
const H_GAP = 56;
const V_GAP = 14;

export function mindmapSize(label: string, root = false): { width: number; height: number } {
  const longest = Math.max(1, ...label.split('\n').map((l) => l.length));
  return root ? { width: Math.max(120, Math.min(280, longest * 10 + 48)), height: 56 } : { width: Math.max(80, Math.min(260, longest * 8 + 36)), height: 38 };
}

export function createRoot(id: string, at: { x: number; y: number }, label = 'Central idea'): DiagramNode {
  const s = mindmapSize(label, true);
  return { id, type: 'mindmap', position: { x: at.x, y: at.y }, width: s.width, height: s.height, data: { label, root: true, accent: MM_COLORS[0] } };
}

export const parentOf = (edges: DiagramEdge[], id: string): string | undefined => edges.find((e) => e.target === id)?.source;
export function childrenOf(nodes: DiagramNode[], edges: DiagramEdge[], id: string): DiagramNode[] {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  return edges.filter((e) => e.source === id).map((e) => byId.get(e.target)).filter((x): x is DiagramNode => !!x && x.type === 'mindmap');
}
export function rootOf(_nodes: DiagramNode[], edges: DiagramEdge[], id: string): string {
  let cur = id;
  for (let i = 0; i < 1000; i++) {
    const p = parentOf(edges, cur);
    if (!p) return cur;
    cur = p;
  }
  return cur;
}

const edgeFor = (id: string, source: string, target: string, color: string): DiagramEdge => ({
  id, source, target, sourceHandle: 'right', targetHandle: 'left', type: 'diagram', data: { lineType: 'curved', color, strokeWidth: 2, arrows: 'none', pinSource: 'right', pinTarget: 'left' },
} as DiagramEdge);

export function addChild(nodes: DiagramNode[], edges: DiagramEdge[], parentId: string, id: string, edgeId: string, label = ''): { node: DiagramNode; edge: DiagramEdge } {
  const parent = nodes.find((x) => x.id === parentId)!;
  const kids = childrenOf(nodes, edges, parentId);
  const branch = parentId === rootOf(nodes, edges, parentId) ? kids.length : (parent.data.branch as number | undefined) ?? 0;
  const accent = MM_COLORS[(branch + (parentId === rootOf(nodes, edges, parentId) ? 1 : 0)) % MM_COLORS.length];
  const s = mindmapSize(label);
  const last = kids[kids.length - 1];
  const node: DiagramNode = {
    id, type: 'mindmap', width: s.width, height: s.height,
    position: last ? { x: last.position.x, y: last.position.y + 50 } : { x: parent.position.x + (parent.width ?? 120) + H_GAP, y: parent.position.y },
    data: { label, accent, branch, ...(parent.data.side ? { side: parent.data.side } : {}) },
  };
  return { node, edge: edgeFor(edgeId, parentId, id, accent) };
}
export function addSibling(nodes: DiagramNode[], edges: DiagramEdge[], id: string, newId: string, edgeId: string, label = ''): { node: DiagramNode; edge: DiagramEdge } {
  const p = parentOf(edges, id);
  return addChild(nodes, edges, p ?? id, newId, edgeId, label);
}

/** descendants hidden by a collapsed ancestor (the collapsed node itself stays visible) */
export function collapsedHidden(nodes: DiagramNode[], edges: DiagramEdge[], rootId: string): Set<string> {
  const out = new Set<string>();
  const visit = (id: string, hidden: boolean) => {
    const me = nodes.find((x) => x.id === id);
    for (const c of childrenOf(nodes, edges, id)) {
      const h = hidden || !!me?.data.collapsed;
      if (h) out.add(c.id);
      visit(c.id, h);
    }
  };
  visit(rootId, false);
  return out;
}

export interface Placed { x: number; y: number; side: 'l' | 'r' | 'c' }

/** Left-right balanced tree. The root keeps its position; first-level branches alternate sides so both halves have a similar height. */
export function layoutMindMap(nodes: DiagramNode[], edges: DiagramEdge[], rootId: string): Map<string, Placed> {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const root = byId.get(rootId);
  const out = new Map<string, Placed>();
  if (!root) return out;
  const hiddenSet = collapsedHidden(nodes, edges, rootId);
  const kidsOf = (id: string) => childrenOf(nodes, edges, id).filter((c) => !hiddenSet.has(c.id));
  const sizeOf = (nd: DiagramNode) => mindmapSize(nd.data.label, nd.id === rootId);
  const heights = new Map<string, number>();
  const height = (id: string): number => {
    const nd = byId.get(id)!;
    const ks = kidsOf(id);
    const own = sizeOf(nd).height;
    const h = ks.length ? Math.max(own, ks.reduce((a, c) => a + height(c.id), 0) + V_GAP * (ks.length - 1)) : own;
    heights.set(id, h);
    return h;
  };
  height(rootId);
  const rs = sizeOf(root);
  const rootPos = { x: root.position.x, y: root.position.y };
  out.set(rootId, { ...rootPos, side: 'c' });
  // split first-level branches: greedy by total height (keeps order: the first half to the right, the rest to the left)
  const first = kidsOf(rootId);
  const total = first.reduce((a, c) => a + heights.get(c.id)!, 0);
  let right: DiagramNode[] = [];
  let left: DiagramNode[] = [];
  if (first.some((c) => c.data.pinSide === 'l' || c.data.pinSide === 'r')) {
    // the user picked a side with a "+" button: those branches stay there, the others fill the lighter side
    let hr = 0;
    let hl = 0;
    const toRight = new Set<string>();
    const toLeft = new Set<string>();
    for (const c of first) {
      if (c.data.pinSide === 'r') { toRight.add(c.id); hr += heights.get(c.id)!; }
      else if (c.data.pinSide === 'l') { toLeft.add(c.id); hl += heights.get(c.id)!; }
    }
    for (const c of first) {
      if (toRight.has(c.id) || toLeft.has(c.id)) continue;
      if (hr <= hl) { toRight.add(c.id); hr += heights.get(c.id)!; }
      else { toLeft.add(c.id); hl += heights.get(c.id)!; }
    }
    right = first.filter((c) => toRight.has(c.id));
    left = first.filter((c) => toLeft.has(c.id));
  } else {
    let acc = 0;
    for (const c of first) {
      const h = heights.get(c.id)!;
      if (right.length === 0 || acc + h / 2 <= total / 2 || (left.length === 0 && c === first[first.length - 1] && first.length > 1)) { right.push(c); acc += h; }
      else left.push(c);
    }
  }
  const place = (id: string, x: number, yTop: number, side: 'l' | 'r') => {
    const nd = byId.get(id)!;
    const s = sizeOf(nd);
    const h = heights.get(id)!;
    out.set(id, { x: side === 'r' ? x : x - s.width, y: yTop + h / 2 - s.height / 2, side });
    let y = yTop;
    const ks = kidsOf(id);
    const used = ks.reduce((a, c) => a + heights.get(c.id)!, 0) + V_GAP * Math.max(0, ks.length - 1);
    y = yTop + (h - used) / 2;
    for (const c of ks) {
      place(c.id, side === 'r' ? x + s.width + H_GAP : x - s.width - H_GAP, y, side);
      y += heights.get(c.id)! + V_GAP;
    }
  };
  const column = (list: DiagramNode[], side: 'l' | 'r') => {
    const sum = list.reduce((a, c) => a + heights.get(c.id)!, 0) + V_GAP * Math.max(0, list.length - 1);
    let y = rootPos.y + rs.height / 2 - sum / 2;
    for (const c of list) {
      place(c.id, side === 'r' ? rootPos.x + rs.width + H_GAP : rootPos.x - H_GAP, y, side);
      y += heights.get(c.id)! + V_GAP;
    }
  };
  column(right, 'r');
  column(left, 'l');
  return out;
}

/** "# Root" then "- child" bullets indented two spaces per level */
export function toOutline(nodes: DiagramNode[], edges: DiagramEdge[], rootId: string): string {
  const root = nodes.find((x) => x.id === rootId);
  if (!root) return '';
  const lines = [`# ${root.data.label}`];
  const walk = (id: string, depth: number) => {
    for (const c of childrenOf(nodes, edges, id)) {
      lines.push(`${'  '.repeat(depth)}- ${c.data.label}`);
      walk(c.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return lines.join('\n');
}

/** Markdown-ish outline to a mind map (root at the origin, not laid out yet). null for empty text. */
export function fromOutline(text: string, gen: (prefix: string) => string): { nodes: DiagramNode[]; edges: DiagramEdge[] } | null {
  interface Item { depth: number; label: string }
  let title: string | null = null;
  const items: Item[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (h && title === null && items.length === 0) { title = h[1].trim(); continue; }
    const m = /^([ \t]*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    const indentRaw = m ? m[1] : /^([ \t]*)/.exec(raw)![1];
    const label = (m ? m[2] : raw.trim()).trim();
    if (!label) continue;
    const cols = indentRaw.replace(/\t/g, '    ').length;
    items.push({ depth: cols, label });
  }
  if (!items.length && title === null) return null;
  // normalise indentation into levels with a stack (any indent step works)
  const stack: number[] = [];
  const levels = items.map((it) => {
    while (stack.length && stack[stack.length - 1] > it.depth) stack.pop();
    if (!stack.length || stack[stack.length - 1] < it.depth) stack.push(it.depth);
    return stack.length - 1;
  });
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  let rootLabel = title;
  let list = items.map((it, i) => ({ level: levels[i], label: it.label }));
  if (rootLabel === null) {
    const tops = list.filter((x) => x.level === 0);
    if (tops.length === 1) {
      rootLabel = tops[0].label;
      list = list.slice(1).map((x) => ({ ...x, level: x.level - 1 }));
    } else rootLabel = 'Mind map';
  }
  const root = createRoot(gen('mm'), { x: 0, y: 0 }, rootLabel);
  nodes.push(root);
  const path: string[] = [root.id];
  for (const it of list) {
    const level = Math.max(0, Math.min(it.level, path.length - 1));
    const parent = path[level];
    const r = addChild(nodes, edges, parent, gen('mm'), gen('e'), it.label);
    nodes.push(r.node);
    edges.push(r.edge);
    path.length = level + 1;
    path.push(r.node.id);
  }
  return { nodes, edges };
}
