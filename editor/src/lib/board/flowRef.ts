import type { ReactFlowInstance } from '@xyflow/react';

/** the canvas' React Flow instance, so commands outside the canvas (⌘K, menus, shortcuts) know where the viewport is */
export const flowRef: { current: ReactFlowInstance | null } = { current: null };

/** the visible area in flow coordinates */
export function viewRect(): { x: number; y: number; w: number; h: number } {
  const el = document.querySelector('.react-flow')?.getBoundingClientRect();
  const rf = flowRef.current;
  if (!el || !rf) return { x: 0, y: 0, w: 1000, h: 700 };
  const a = rf.screenToFlowPosition({ x: el.left, y: el.top });
  const b = rf.screenToFlowPosition({ x: el.right, y: el.bottom });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}
export function viewCenter(): { x: number; y: number } {
  const r = viewRect();
  return { x: Math.round((r.x + r.w / 2) / 20) * 20, y: Math.round((r.y + r.h / 2) / 20) * 20 };
}
