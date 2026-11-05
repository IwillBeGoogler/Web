/** Freehand strokes: compact point encoding, smoothing, perfect-freehand outline, eraser hit-testing. Pure. */
import { getStroke } from 'perfect-freehand';
import type { DiagramNode } from '../../types';

export interface SPt { x: number; y: number; p: number }
export type Brush = 'pen' | 'highlighter';

const Q = 2; // grid: 0.5 px

const b36 = (n: number): string => (n < 0 ? '-' : '') + Math.abs(n).toString(36);

/**
 * "a" | "b" (b = pressure present) + space separated tokens: x0 y0 [p0] then deltas dx dy [p], each base 36 on a 0.5 px grid
 * (pressure 0..35). Example: "a 3k 1c 5 -2 ..."
 */
export function encodePoints(pts: SPt[]): string {
  if (!pts.length) return 'a';
  const pressure = pts.some((p) => Math.abs(p.p - pts[0].p) > 0.02);
  const out: string[] = [pressure ? 'b' : 'a'];
  let px = 0;
  let py = 0;
  for (const p of pts) {
    const x = Math.round(p.x * Q);
    const y = Math.round(p.y * Q);
    out.push(b36(x - px), b36(y - py));
    if (pressure) out.push(Math.max(0, Math.min(35, Math.round(p.p * 35))).toString(36));
    px = x;
    py = y;
  }
  return out.join(' ');
}

export function decodePoints(s: string): SPt[] {
  const t = s.trim().split(/\s+/);
  const head = t.shift();
  if ((head !== 'a' && head !== 'b') || !t.length) return [];
  const step = head === 'b' ? 3 : 2;
  if (t.length % step) return [];
  const out: SPt[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < t.length; i += step) {
    const dx = parseInt(t[i], 36);
    const dy = parseInt(t[i + 1], 36);
    const p = head === 'b' ? parseInt(t[i + 2], 36) / 35 : 0.5;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(p)) return [];
    x += dx;
    y += dy;
    out.push({ x: x / Q, y: y / Q, p });
  }
  return out;
}

/** 3-point weighted average passes (ends fixed): takes the shake out of a mouse stroke */
export function smoothPoints(pts: SPt[], passes = 2): SPt[] {
  if (pts.length < 3) return pts;
  let cur = pts;
  for (let k = 0; k < passes; k++) {
    cur = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      const a = cur[i - 1];
      const b = cur[i + 1];
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4, p: p.p };
    });
  }
  return cur;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
export interface OutlineOpts { size: number; thinning?: number; smoothing?: number; streamline?: number; simulatePressure?: boolean }

/** SVG path (closed) of the stroke polygon; midpoint quadratic curves, the standard perfect-freehand recipe */
export function outlinePath(pts: SPt[], o: OutlineOpts): string {
  if (!pts.length) return '';
  const hasPressure = pts.some((p) => Math.abs(p.p - pts[0].p) > 0.02);
  const poly = getStroke(pts.map((p) => [p.x, p.y, p.p]), {
    size: o.size, thinning: o.thinning ?? 0.5, smoothing: o.smoothing ?? 0.6, streamline: o.streamline ?? 0.4,
    simulatePressure: o.simulatePressure ?? !hasPressure, last: true,
  });
  if (poly.length < 2) return '';
  const d: string[] = [`M${r1(poly[0][0])} ${r1(poly[0][1])}`, 'Q'];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    d.push(`${r1(x0)} ${r1(y0)} ${r1((x0 + x1) / 2)} ${r1((y0 + y1) / 2)}`);
  }
  d.push('Z');
  return d.join(' ');
}

export interface StrokeStyleOpts { color: string; size: number; brush: Brush }

export function createStrokeNode(id: string, pts: SPt[], o: StrokeStyleOpts): DiagramNode | null {
  if (pts.length < 2) return null;
  const pad = o.size / 2 + 2;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const ox = Math.round(minX);
  const oy = Math.round(minY);
  const local = pts.map((p) => ({ ...p, x: p.x - ox, y: p.y - oy }));
  return {
    id, type: 'draw', position: { x: ox, y: oy }, width: Math.ceil(maxX - ox), height: Math.ceil(maxY - oy),
    data: { label: '', pts: encodePoints(local), stroke: o.color, strokeWidth: o.size, brush: o.brush },
  };
}

type HasData = Pick<DiagramNode, 'data'>;
export const strokePoints = (n: HasData): SPt[] => (typeof n.data.pts === 'string' ? decodePoints(n.data.pts) : []);

/** the SVG path d of a draw node, in node-local coordinates (legacy `path` strokes pass through) */
export function drawPathOf(n: HasData): string {
  if (typeof n.data.pts === 'string') {
    const brush = n.data.brush === 'highlighter' ? 'highlighter' : 'pen';
    return outlinePath(smoothPoints(strokePoints(n), 1), { size: (n.data.strokeWidth as number | undefined) ?? 3, ...(brush === 'highlighter' ? { thinning: 0, streamline: 0.6, simulatePressure: false } : {}) });
  }
  return (n.data.path as string | undefined) ?? '';
}

const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** ids of the strokes touched by an eraser of `radius` at flow point `at` */
export function eraseHits(nodes: DiagramNode[], at: { x: number; y: number }, radius: number): string[] {
  const hits: string[] = [];
  for (const n of nodes) {
    if (n.type !== 'draw' || n.data.locked) continue;
    const local = { x: at.x - n.position.x, y: at.y - n.position.y };
    const pts = strokePoints(n);
    if (pts.length) {
      const tol = radius + ((n.data.strokeWidth as number | undefined) ?? 3) / 2;
      const hit = pts.length === 1 ? Math.hypot(local.x - pts[0].x, local.y - pts[0].y) <= tol : pts.some((p, i) => i > 0 && segDist(local, pts[i - 1], p) <= tol);
      if (hit) hits.push(n.id);
    } else {
      const nums = ((n.data.path as string | undefined) ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const legacy: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) legacy.push({ x: nums[i], y: nums[i + 1] });
      const tol = radius + ((n.data.strokeWidth as number | undefined) ?? 2.5) / 2;
      if (legacy.some((p, i) => i > 0 && segDist(local, legacy[i - 1], p) <= tol)) hits.push(n.id);
    }
  }
  return hits;
}
