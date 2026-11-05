import type { DiagramNode } from '../types';
import { absolutePosition, nodeSize } from './graph';
import type { Rect } from './tooltip';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
export const FALLBACK_SIZE = { width: 1000, height: 700 };

export const isViewport = (v: unknown): v is Viewport =>
  typeof v === 'object' && v !== null &&
  Number.isFinite((v as Viewport).x) && Number.isFinite((v as Viewport).y) && Number.isFinite((v as Viewport).zoom) && (v as Viewport).zoom > 0;

export interface Insets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}
export const NO_INSETS: Insets = { top: 0, left: 0, right: 0, bottom: 0 };
/** Free canvas area next to the floating UI (top bar 76px, palette / inspector panels, dock) */
export const UI_MARGIN = 24;

/**
 * Pan only (zoom stays 100%). The content is centred in the free area (the viewport minus the floating UI); when it does
 * not fit on an axis its top-left corner is placed UI_MARGIN px inside the free area instead, so nothing starts under the top bar.
 */
export function centerViewport(bounds: Rect, size: { width: number; height: number }, insets: Insets = NO_INSETS): Viewport {
  const axis = (start: number, length: number, inStart: number, inEnd: number, total: number) => {
    const avail = total - inStart - inEnd;
    const pos = length + UI_MARGIN * 2 <= avail ? inStart + (avail - length) / 2 : inStart + UI_MARGIN;
    return pos - start;
  };
  return { x: axis(bounds.x, bounds.width, insets.left, insets.right, size.width), y: axis(bounds.y, bounds.height, insets.top, insets.bottom, size.height), zoom: 1 };
}

export function contentBounds(nodes: DiagramNode[]): Rect {
  const rs = nodes.map((n) => {
    const p = absolutePosition(nodes, n);
    const s = nodeSize(n);
    return { x: p.x, y: p.y, r: p.x + s.width, b: p.y + s.height };
  });
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.r)) - x, height: Math.max(...rs.map((r) => r.b)) - y };
}

/** Saved viewport if any, else centred content at 100%, else origin at 100%. */
export function initialViewport(nodes: DiagramNode[], saved: Viewport | undefined, size: { width: number; height: number }, insets: Insets = NO_INSETS): Viewport {
  if (saved && isViewport(saved)) return saved;
  if (!nodes.length) return { ...DEFAULT_VIEWPORT };
  return centerViewport(contentBounds(nodes), size, insets);
}

/** Space under the floating top bar, and the extra space the workspace bar (file tabs + pages row) takes below it. */
export const TOP_INSET = 104;
export const WSBAR_INSET = 78;
/** padding for fitView / click-add: keeps content clear of the floating UI (top bar, tab bar + page row, dock, open side panels) */
export function fitPadding(sidebarOpen: boolean, inspectorOpen: boolean, wsbar: boolean): Record<'top' | 'bottom' | 'left' | 'right', `${number}px`> {
  return { top: `${TOP_INSET + (wsbar ? WSBAR_INSET : 0)}px`, bottom: '96px', left: sidebarOpen ? '324px' : '76px', right: inspectorOpen ? '324px' : '32px' };
}
