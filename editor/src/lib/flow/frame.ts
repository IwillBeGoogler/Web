import { chevronSpots, packetCount, packetDistances, pointAt, SPEED_PX, type FlowStyle } from './geometry';
import type { FlowPath } from './paths';

export interface FlowItem { kind: 'packet' | 'chevron'; x: number; y: number; angle: number; color: string; style: FlowStyle; /** 0..1 pulse phase (pulse style) */ phase: number; pathId: string }

/** deterministic per-path phase so neighbouring lines do not move in lockstep */
const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

/**
 * Everything to draw at time `t` (seconds). With reduced motion there are no moving packets: static chevrons along each line show the
 * direction instead (t is ignored).
 */
export function computeFrame(paths: FlowPath[], t: number, reducedMotion: boolean, visible?: (p: FlowPath) => boolean): FlowItem[] {
  const items: FlowItem[] = [];
  for (const p of paths) {
    if (visible && !visible(p)) continue;
    if (reducedMotion) {
      for (const c of chevronSpots(p.m)) items.push({ kind: 'chevron', ...c, color: p.color, style: p.look.style, phase: 0, pathId: p.id });
      continue;
    }
    const n = packetCount(p.m.total, p.look.density);
    const ds = packetDistances(p.m.total, n, t, SPEED_PX[p.look.speed], phaseOf(p.id));
    const gap = p.m.total / Math.max(1, n);
    for (const d of ds) {
      const at = pointAt(p.m, d);
      items.push({ kind: 'packet', x: at.x, y: at.y, angle: at.angle, color: p.color, style: p.look.style, phase: (d % gap) / gap, pathId: p.id });
    }
  }
  return items;
}
