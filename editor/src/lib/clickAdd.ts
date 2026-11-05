import type { DiagramNode } from '../types';
import { useDiagramStore } from '../store/diagramStore';
import { clickPlace, type Rect } from './placement';
import { isContainer } from './graph';
import { FALLBACK_SIZE, TOP_INSET, WSBAR_INSET, type Insets } from './viewport';

/** Space taken by the floating UI (top bar, dock, open side panels): same numbers as useFit. */
export const clickInsets = (sidebarOpen: boolean, inspectorOpen: boolean, wsbar = false): Insets => ({ top: TOP_INSET + (wsbar ? WSBAR_INSET : 0), bottom: 96, left: sidebarOpen ? 324 : 32, right: inspectorOpen ? 324 : 32 });

/** Visible canvas area in flow coordinates, minus the floating UI. */
export function visibleFlowArea(pane: { left: number; top: number; width: number; height: number } | null, insets: Insets, toFlow: (p: { x: number; y: number }) => { x: number; y: number }): Rect {
  const w = pane?.width || FALLBACK_SIZE.width;
  const h = pane?.height || FALLBACK_SIZE.height;
  const l = pane?.left ?? 0;
  const t = pane?.top ?? 0;
  const tl = toFlow({ x: l + insets.left, y: t + insets.top });
  const br = toFlow({ x: l + w - insets.right, y: t + h - insets.bottom });
  return { x: tl.x, y: tl.y, width: Math.max(0, br.x - tl.x), height: Math.max(0, br.y - tl.y) };
}

let lastAddedId: string | null = null;
export const resetClickAnchor = () => {
  lastAddedId = null;
};

export interface ClickAddDeps {
  view: Rect;
  zoom: number;
  /** React Flow's setCenter(x, y, {zoom, duration}) */
  setCenter: (x: number, y: number, o?: { zoom?: number; duration?: number }) => unknown;
  /** flow-space offset between the pane centre and the centre of `view` (the floating UI is not symmetric) */
  centerShift?: { x: number; y: number };
}

/**
 * Add palette / command-palette items at an EMPTY spot of the visible viewport (next to the selected / last added node,
 * left to right, wrapping). When the viewport is full the node goes just outside and the view pans to it.
 */
export function clickAdd(made: DiagramNode[], deps: ClickAddDeps): ClickPlacement2 {
  const st = useDiagramStore.getState();
  const selected = st.nodes.find((n) => n.selected && !isContainer(n));
  const group = st.nodes.find((n) => n.selected && isContainer(n));
  const anchor = selected ?? st.nodes.find((n) => n.id === lastAddedId);
  const res = clickPlace(st.nodes, made, { view: deps.view, anchor, group: selected ? undefined : group });
  st.addNodes(res.nodes);
  lastAddedId = res.nodes[0]?.id ?? null;
  if (res.outside) {
    const s = deps.centerShift ?? { x: 0, y: 0 };
    void deps.setCenter(res.focus.x + res.focus.width / 2 + s.x, res.focus.y + res.focus.height / 2 + s.y, { zoom: deps.zoom, duration: 300 });
  }
  return { outside: res.outside, nodes: res.nodes };
}
export interface ClickPlacement2 {
  outside: boolean;
  nodes: DiagramNode[];
}
