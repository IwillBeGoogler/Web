/** Board actions: they read the editor stores and write the document through ONE undo step each. */
import type { DiagramEdge, DiagramNode } from '../../types';
import { useSession } from '../../api/session';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resolveSettings } from '../settings';
import { canvasInk } from '../contrast';
import { useBoardStore } from '../../store/boardStore';
import { newId, nodeSize } from '../graph';
import { arrangeAsGrid, groupByColor } from './cluster';
import { createFrame, isFrame, nextFrameName, orderedFrames, reorderFrames } from './frames';
import { createStrokeNode, decodePoints, eraseHits, smoothPoints, type SPt } from './freehand';
import { createRoot, fromOutline, parentOf, rootOf, toOutline } from './mindmap';
import { addChildAt, applyMapLayout, dropTarget, mapNavigate, moveNode, pasteAsChildren, promoteNode, type Side } from './mindmapOps';
import { recognizeShape, recognizedToNode } from './recognize';
import { createSticky, nextSticky } from './sticky';

const st = () => useDiagramStore.getState();
const ANON_KEY = 'sdd:board-anon';

/** who I am on the board: the signed-in user, else a stable per-browser id (so "private" works without an account too) */
export function myBoardId(): string {
  const u = useSession.getState().user;
  if (u) return u.id;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = newId('anon'); localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch {
    return 'anon';
  }
}
function whoOpts(): { author?: string; authorId?: string; private?: boolean } {
  const b = useBoardStore.getState();
  const u = useSession.getState().user;
  return {
    ...(b.showAuthor && u?.name ? { author: u.name } : {}),
    ...(b.showAuthor || b.privateMode ? { authorId: myBoardId() } : {}),
    ...(b.privateMode ? { private: true } : {}),
  };
}

/** somebody else's private sticky: shown as a blurred card until it is revealed */
export const isMasked = (n: DiagramNode, me: string): boolean => n.type === 'sticky' && n.data.private === true && n.data.authorId !== me;

const focus = (id: string) => {
  st().selectOnly('node', id);
  useUiStore.getState().setEditing(id);
};

// ---------------------------------------------------------------- stickies
export function createStickyAt(at: { x: number; y: number }, rect?: { x: number; y: number; width: number; height: number }): string {
  let node = createSticky(newId('n'), at, { color: useBoardStore.getState().stickyColor, ...whoOpts() });
  if (rect) node = { ...node, position: { x: rect.x, y: rect.y }, width: Math.max(rect.width, 100), height: Math.max(rect.height, 80) };
  st().addNode(node);
  focus(node.id);
  return node.id;
}

/** Tab (right) / Shift+Enter (below): a new empty sticky next to `fromId`, in edit mode */
export function addNextStickyFrom(fromId: string, dir: 'right' | 'below'): string | null {
  const from = st().nodes.find((n) => n.id === fromId);
  if (!from || from.type !== 'sticky') return null;
  const node = nextSticky(from, st().nodes, dir, newId('n'), whoOpts());
  st().addNode(node);
  focus(node.id);
  return node.id;
}

export function revealAll(): number {
  let count = 0;
  st().transform((nodes, edges) => {
    count = nodes.filter((n) => n.type === 'sticky' && n.data.private).length;
    if (!count) return null;
    return { edges, nodes: nodes.map((n) => { if (n.type !== 'sticky' || !n.data.private) return n; const { private: _p, ...rest } = n.data; void _p; return { ...n, data: rest as DiagramNode['data'] }; }) };
  });
  return count;
}
export const hasPrivate = (): boolean => st().nodes.some((n) => n.type === 'sticky' && n.data.private);

export function arrangeSelected(mode: 'grid' | 'color'): number {
  const sel = st().nodes.filter((n) => n.selected);
  const pos = mode === 'grid' ? arrangeAsGrid(sel) : groupByColor(sel);
  if (!pos.size) return 0;
  st().transform((nodes, edges) => ({ edges, nodes: nodes.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)) }));
  return pos.size;
}

// ---------------------------------------------------------------- frames
const FRAME_DEFAULT = { width: 800, height: 500 };
export function addFrameFor(centre: { x: number; y: number }, drawn?: { x: number; y: number; width: number; height: number }): string | null {
  const nodes = st().nodes;
  const sel = nodes.filter((n) => n.selected && !isFrame(n) && !n.parentId);
  let rect;
  if (drawn) rect = { x: drawn.x, y: drawn.y, width: Math.max(drawn.width, 160), height: Math.max(drawn.height, 100) };
  else if (sel.length) {
    const rs = sel.map((n) => ({ ...n.position, ...nodeSize(n) }));
    const x = Math.min(...rs.map((r) => r.x)) - 40;
    const y = Math.min(...rs.map((r) => r.y)) - 64;
    rect = { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) + 40 - x, height: Math.max(...rs.map((r) => r.y + r.height)) + 40 - y };
  } else rect = { x: centre.x - FRAME_DEFAULT.width / 2, y: centre.y - FRAME_DEFAULT.height / 2, ...FRAME_DEFAULT };
  const f = createFrame(newId('fr'), rect, nextFrameName(nodes));
  f.data = { ...f.data, order: nodes.filter(isFrame).length };
  // frames go first in the list so they paint below their content
  st().transform((ns, es) => ({ edges: es, nodes: [f, ...ns.map((n) => ({ ...n, selected: false }))] }));
  focus(f.id);
  return f.id;
}
export function reorderFrame(id: string, to: number): void {
  const order = reorderFrames(st().nodes, id, to);
  if (!order.size) return;
  st().transform((nodes, edges) => ({ edges, nodes: nodes.map((n) => (order.has(n.id) ? { ...n, data: { ...n.data, order: order.get(n.id)! } } : n)) }));
}
export const framesInOrder = (): DiagramNode[] => orderedFrames(st().nodes);

// ---------------------------------------------------------------- mind map
const rootsOf = (nodes: DiagramNode[], edges: DiagramEdge[]): string[] => nodes.filter((n) => n.type === 'mindmap' && !parentOf(edges, n.id)).map((n) => n.id);

export function createMindMapAt(at: { x: number; y: number }): string {
  const root = createRoot(newId('mm'), { x: at.x - 70, y: at.y - 28 });
  st().addNode(root);
  focus(root.id);
  useUiStore.getState().setEditing(root.id); // one click: the central topic is ready to type
  return root.id;
}

function addMapNode(parentId: string, label = '', side?: Side): string | null {
  const s = st();
  const parent = s.nodes.find((n) => n.id === parentId);
  if (!parent || parent.type !== 'mindmap') return null;
  const r = addChildAt(s.nodes, s.edges, parentId, newId('mm'), newId('e'), label, side);
  const rid = rootOf(s.nodes, s.edges, parentId);
  s.transform((nodes, edges) => {
    const opened = nodes.map((n) => (n.id === parentId && n.data.collapsed ? { ...n, data: { ...n.data, collapsed: false } } : { ...n, selected: n.id === r.node.id }));
    return applyMapLayout([...opened, { ...r.node, selected: true }], [...edges, r.edge], rid);
  });
  useUiStore.getState().setEditing(r.node.id);
  return r.node.id;
}
export const mmAddChild = (id: string, side?: Side): string | null => addMapNode(id, '', side);
/** Shift+Tab */
export function mmPromote(id: string): boolean {
  const s = st();
  const r = promoteNode(s.nodes, s.edges, id);
  if (!r) return false;
  const rid = rootOf(r.nodes, r.edges, id);
  s.transform(() => applyMapLayout(r.nodes, r.edges, rid));
  return true;
}
/** drag release: onto a node = re-parent (no cycles), elsewhere = reorder among the siblings. The drag already took its undo snapshot. */
export function mmDrop(id: string, point: { x: number; y: number }): boolean {
  const s = st();
  const t = dropTarget(s.nodes, s.edges, id, point);
  const rid = rootOf(s.nodes, s.edges, id);
  const moved = t ? (t.kind === 'parent' ? moveNode(s.nodes, s.edges, id, t.id) : moveNode(s.nodes, s.edges, id, t.parentId, t.index)) : null;
  const base = moved ?? { nodes: s.nodes, edges: s.edges };
  const open = t?.kind === 'parent' ? { ...base, nodes: base.nodes.map((n) => (n.id === t.id && n.data.collapsed ? { ...n, data: { ...n.data, collapsed: false } } : n)) } : base;
  const laid = applyMapLayout(open.nodes, open.edges, rid);
  useDiagramStore.setState({ nodes: laid.nodes, edges: laid.edges }); // layout always wins: the node snaps to its place
  return !!moved;
}
/** paste text / a Markdown list onto a node: every line becomes a child, indentation = depth. false when the text is not a list. */
export function mmPasteText(id: string, text: string): boolean {
  const s = st();
  const r = pasteAsChildren(s.nodes, s.edges, id, text, newId);
  if (!r) return false;
  const rid = rootOf(s.nodes, s.edges, id);
  s.transform((nodes, edges) => applyMapLayout(nodes.map((n) => (n.id === id && n.data.collapsed ? { ...n, data: { ...n.data, collapsed: false } } : n)).concat(r.nodes), [...edges, ...r.edges], rid));
  return true;
}
/** arrow keys: select the neighbour in the tree */
export function mmNavigate(id: string, dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const s = st();
  const to = mapNavigate(s.nodes, s.edges, id, dir);
  if (!to) return false;
  s.selectOnly('node', to);
  return true;
}
export function mmAddSibling(id: string): string | null {
  const p = parentOf(st().edges, id);
  return addMapNode(p ?? id);
}
export function mmToggleCollapse(id: string): void {
  const s = st();
  const n = s.nodes.find((x) => x.id === id);
  if (!n || n.type !== 'mindmap') return;
  const rid = rootOf(s.nodes, s.edges, id);
  s.transform((nodes, edges) => applyMapLayout(nodes.map((x) => (x.id === id ? { ...x, data: { ...x.data, collapsed: !x.data.collapsed } } : x)), edges, rid));
}
export function mmSetLabel(id: string, label: string): void {
  const s = st();
  if (!s.nodes.some((n) => n.id === id && n.type === 'mindmap')) return;
  const rid = rootOf(s.nodes, s.edges, id);
  s.transform((nodes, edges) => applyMapLayout(nodes.map((x) => (x.id === id ? { ...x, data: { ...x.data, label } } : x)), edges, rid));
}
export function mmLayoutAll(): number {
  const s = st();
  const roots = rootsOf(s.nodes, s.edges);
  if (!roots.length) return 0;
  s.transform((nodes, edges) => roots.reduce((acc, r) => applyMapLayout(acc.nodes, acc.edges, r), { nodes, edges }));
  return roots.length;
}
export function mmImport(text: string, at: { x: number; y: number }): string | null {
  const parsed = fromOutline(text, newId);
  if (!parsed) return null;
  const root = parsed.nodes.find((n) => n.data.root)!;
  const moved = parsed.nodes.map((n) => (n.id === root.id ? { ...n, position: { x: at.x - 70, y: at.y - 28 }, selected: true } : n));
  st().transform((nodes, edges) => applyMapLayout([...nodes.map((n) => ({ ...n, selected: false })), ...moved], [...edges, ...parsed.edges], root.id));
  return root.id;
}
export function mmExport(id: string): string {
  const s = st();
  return toOutline(s.nodes, s.edges, rootOf(s.nodes, s.edges, id));
}

// ---------------------------------------------------------------- freehand
/** the ink that reads on this canvas */
export function currentInk(): string {
  const bg = resolveSettings(useSettingsStore.getState().global, st().projectSettings).canvas.background;
  return canvasInk(bg === 'transparent' ? '#ffffff' : bg);
}

export function commitStroke(raw: SPt[], brush: 'pen' | 'highlighter'): string | null {
  const b = useBoardStore.getState();
  const style = brush === 'pen' ? { color: b.penColor === 'auto' ? currentInk() : b.penColor, size: b.penSize } : { color: b.hlColor, size: b.hlSize };
  const pts = smoothPoints(raw, 1);
  let node: DiagramNode | null = null;
  if (brush === 'pen' && b.recognize) {
    const rec = recognizeShape(pts);
    if (rec) node = recognizedToNode(rec, newId('n'), style);
  }
  node ??= createStrokeNode(newId('n'), pts, { ...style, brush });
  if (!node) return null;
  st().addNode(node);
  return node.id;
}

/** Delete the strokes under the eraser. `record: false` for the moves of one gesture (call `snapshot()` once at its start). */
export function eraseAt(pt: { x: number; y: number }, radius: number, record = true): number {
  const hits = new Set(eraseHits(st().nodes, pt, radius));
  if (!hits.size) return 0;
  if (record) st().transform((nodes, edges) => ({ edges, nodes: nodes.filter((n) => !hits.has(n.id)) }));
  else useDiagramStore.setState((s) => ({ nodes: s.nodes.filter((n) => !hits.has(n.id)) }));
  return hits.size;
}

// ---------------------------------------------------------------- stamps
export function stampAt(at: { x: number; y: number }, emoji: string, size = 56): string {
  const node: DiagramNode = { id: newId('n'), type: 'stamp', position: { x: at.x - size / 2, y: at.y - size / 2 }, width: size, height: size, data: { label: '', emoji } };
  st().addNode(node);
  st().selectOnly('node', node.id);
  return node.id;
}

export { decodePoints };
