import type { DiagramNode, StrokeStyle } from '../types';

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'diamond' | 'text' | 'sticky' | 'arrow' | 'pen' | 'highlighter' | 'eraser' | 'frame' | 'mindmap' | 'stamp' | 'comment';
export interface Rect { x: number; y: number; width: number; height: number }
export interface Pt { x: number; y: number }

const KEY_TOOLS: Record<string, Tool> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', n: 'sticky', s: 'sticky', f: 'frame', w: 'mindmap', e: 'eraser', l: 'highlighter', a: 'arrow', p: 'pen', c: 'comment' };
export const toolForKey = (key: string): Tool | null => KEY_TOOLS[key.toLowerCase()] ?? null;

export function rectFromPoints(a: Pt, b: Pt, fallback = { width: 140, height: 90 }): Rect {
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (w < 6 && h < 6) return { x: a.x - fallback.width / 2, y: a.y - fallback.height / 2, ...fallback };
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: w, height: h };
}

export function strokeDasharray(style: StrokeStyle | undefined, _width = 1.5): string | undefined {
  void _width;
  if (style === 'dashed') return '8 5';
  if (style === 'dotted') return '2 5';
  return undefined;
}

export function createNodeForTool(tool: Tool, r: Rect, id: string): DiagramNode | null {
  const base = { id, position: { x: r.x, y: r.y } };
  switch (tool) {
    case 'rect':
    case 'ellipse':
    case 'diamond':
      return {
        ...base, type: 'shape', width: r.width, height: r.height,
        data: { label: '', shape: tool, fill: '#ffffff', stroke: '#2d3340', strokeWidth: 1.5, strokeStyle: 'solid', radius: tool === 'rect' ? 4 : 0 },
      };
    case 'sticky':
      return {
        ...base, type: 'sticky', width: Math.max(r.width, 120), height: Math.max(r.height, 100),
        data: { label: 'Note', fill: '#fff3a3', stroke: '#e0c84a', strokeWidth: 1, fontSize: 13 },
      };
    case 'text':
      return { ...base, type: 'text', data: { label: 'Text', fontSize: 16 } };
    default:
      return null;
  }
}

export const pointsToPath = (pts: Pt[]): string => pts.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join(' ');
const round = (n: number) => Math.round(n * 10) / 10;

export function createDrawNode(pts: Pt[], id: string, stroke: string, strokeWidth = 2.5): DiagramNode | null {
  if (pts.length < 2) return null;
  const pad = strokeWidth + 2;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const local = pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  return {
    id, type: 'draw', position: { x: minX, y: minY }, width: maxX - minX, height: maxY - minY,
    data: { label: '', path: pointsToPath(local), stroke, strokeWidth },
  };
}

/** Drop points closer than `min` px to the previous one. */
export function decimate(pts: Pt[], min = 2): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.y - l.y) >= min) out.push(p);
  }
  return out;
}
