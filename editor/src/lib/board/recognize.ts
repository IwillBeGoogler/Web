/** Shape recognition for freehand strokes: rough circle / rectangle / triangle / arrow to a clean shape. Pure. */
import type { DiagramNode } from '../../types';

export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; width: number; height: number }
export type ShapeKind = 'circle' | 'rect' | 'triangle' | 'arrow';
export interface Recognized {
  kind: ShapeKind;
  bbox: Box;
  /** triangle: the three corners */
  points?: Pt[];
  /** arrow: the shaft ends */
  from?: Pt;
  to?: Pt;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function pathLength(p: Pt[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]);
  return l;
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer-Douglas-Peucker */
export function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  let max = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) { max = d; at = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, at + 1), eps);
  return [...left.slice(0, -1), ...rdp(pts.slice(at), eps)];
}

function bboxOf(p: Pt[]): Box {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** turning angle (degrees) at b between a->b and b->c */
function turn(a: Pt, b: Pt, c: Pt): number {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(a2 - a1) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** corners of a closed loop: RDP, then drop near-collinear vertices (a start point in the middle of an edge) */
function corners(pts: Pt[], eps: number): Pt[] {
  let v = rdp(pts, eps);
  if (dist(v[0], v[v.length - 1]) < eps * 3) v = v.slice(0, -1);
  let changed = true;
  while (changed && v.length > 3) {
    changed = false;
    for (let i = 0; i < v.length; i++) {
      const prev = v[(i + v.length - 1) % v.length];
      const next = v[(i + 1) % v.length];
      if (turn(prev, v[i], next) < 30) {
        v = v.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return v;
}

export function recognizeShape(raw: Pt[]): Recognized | null {
  if (raw.length < 8) return null;
  const len = pathLength(raw);
  const box = bboxOf(raw);
  const diag = Math.hypot(box.width, box.height);
  if (len < 40 || diag < 30) return null;
  const first = raw[0];
  const last = raw[raw.length - 1];

  if (dist(first, last) < Math.max(0.2 * len, 0.25 * diag) && Math.min(box.width, box.height) > 0.15 * diag) {
    // ---- closed
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // radius spread in the box's own aspect (so an ellipse counts as round)
    const rs = raw.map((p) => Math.hypot((p.x - c.x) / (box.width / 2 || 1), (p.y - c.y) / (box.height / 2 || 1)));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length);
    if (sd / mean < 0.1) return { kind: 'circle', bbox: box };
    const cs = corners(raw, diag * 0.08);
    if (cs.length === 3) return { kind: 'triangle', bbox: box, points: cs };
    if (cs.length === 4) return { kind: 'rect', bbox: box };
    if (cs.length >= 5 && sd / mean < 0.2) return { kind: 'circle', bbox: box };
    return null;
  }

  // ---- open: straight line or an arrow with a head
  const simple = rdp(raw, Math.max(4, len * 0.04));
  if (simple.length === 2) return { kind: 'arrow', bbox: box, from: first, to: last };
  if (simple.length >= 4) {
    const segs = simple.slice(1).map((p, i) => dist(simple[i], p));
    const shaft = segs[0];
    const rest = segs.slice(1);
    if (shaft >= 0.5 * len && rest.length >= 2 && rest.every((s) => s <= 0.4 * shaft)) return { kind: 'arrow', bbox: box, from: simple[0], to: simple[1] };
  }
  return null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** the clean replacement of a recognised stroke (shape nodes for circle / rectangle, draw paths for the rest) */
export function recognizedToNode(rec: Recognized, id: string, style: { color: string; size: number }): DiagramNode {
  const b = rec.bbox;
  if (rec.kind === 'circle' || rec.kind === 'rect') {
    const w = Math.round(b.width);
    const h = Math.round(b.height);
    const round = rec.kind === 'circle' && Math.abs(w - h) < Math.max(w, h) * 0.15;
    const size = round ? Math.round((w + h) / 2) : 0;
    return {
      id, type: 'shape', position: { x: Math.round(b.x + (round ? (w - size) / 2 : 0)), y: Math.round(b.y + (round ? (h - size) / 2 : 0)) },
      width: round ? size : w, height: round ? size : h,
      data: { label: '', shape: rec.kind === 'circle' ? 'ellipse' : 'rect', background: 'transparent', stroke: style.color, strokeWidth: style.size, strokeStyle: 'solid', radius: rec.kind === 'rect' ? 4 : 0 },
    };
  }
  const pad = style.size + 2;
  let pts: Pt[][];
  if (rec.kind === 'triangle') pts = [[...rec.points!, rec.points![0]]];
  else {
    const f = rec.from!;
    const t = rec.to!;
    const ang = Math.atan2(t.y - f.y, t.x - f.x);
    const head = Math.min(26, Math.max(12, dist(f, t) * 0.18));
    const wing = (s: number): Pt => ({ x: t.x - head * Math.cos(ang + s * 0.5), y: t.y - head * Math.sin(ang + s * 0.5) });
    pts = [[f, t], [wing(1), t, wing(-1)]];
  }
  const all = pts.flat();
  const bb = bboxOf(all);
  const ox = Math.round(bb.x - pad);
  const oy = Math.round(bb.y - pad);
  const d = pts.map((run, k) => run.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x - ox)} ${r1(p.y - oy)}`).join(' ') + (rec.kind === 'triangle' && k === 0 ? ' Z' : '')).join(' ');
  return {
    id, type: 'draw', position: { x: ox, y: oy }, width: Math.ceil(bb.width + pad * 2), height: Math.ceil(bb.height + pad * 2),
    data: { label: '', path: d, stroke: style.color, strokeWidth: style.size },
  };
}
