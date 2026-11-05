/** Precision tools (pure): measure distances, ruler ticks, guides + snapping, constraints on resize. */
import type { DiagramNode, Guide, NodeConstraints } from '../../types';
import { nodeSize } from '../graph';
import { contentInFrame } from '../board/frames';

export interface Rect { x: number; y: number; width: number; height: number }
export interface Measure { axis: 'x' | 'y'; from: { x: number; y: number }; to: { x: number; y: number }; value: number }

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const mid = (a: number, b: number) => (a + b) / 2;
const z = (n: number) => (Object.is(n, -0) ? 0 : n);
const contains = (o: Rect, i: Rect) => i.x >= o.x && i.y >= o.y && right(i) <= right(o) && bottom(i) <= bottom(o);

/** distances between the selection and the hovered node (Alt-hover). Nested: the four insets. Overlapping: nothing. */
export function measureBetween(a: Rect, b: Rect): Measure[] {
  const [outer, inner] = contains(a, b) ? [a, b] : contains(b, a) ? [b, a] : [null, null];
  if (outer && inner) {
    const cx = inner.x + inner.width / 2;
    const cy = inner.y + inner.height / 2;
    return [
      { axis: 'x', from: { x: outer.x, y: cy }, to: { x: inner.x, y: cy }, value: z(inner.x - outer.x) },
      { axis: 'x', from: { x: right(inner), y: cy }, to: { x: right(outer), y: cy }, value: z(right(outer) - right(inner)) },
      { axis: 'y', from: { x: cx, y: outer.y }, to: { x: cx, y: inner.y }, value: z(inner.y - outer.y) },
      { axis: 'y', from: { x: cx, y: bottom(inner) }, to: { x: cx, y: bottom(outer) }, value: z(bottom(outer) - bottom(inner)) },
    ];
  }
  const out: Measure[] = [];
  const overlapY = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  const overlapX = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const gapX = a.x >= right(b) ? a.x - right(b) : b.x >= right(a) ? b.x - right(a) : null;
  const gapY = a.y >= bottom(b) ? a.y - bottom(b) : b.y >= bottom(a) ? b.y - bottom(a) : null;
  if (gapX !== null) {
    const [l, r] = a.x >= right(b) ? [b, a] : [a, b];
    const y = overlapY > 0 ? mid(Math.max(a.y, b.y), Math.min(bottom(a), bottom(b))) : mid(a.y, bottom(a));
    out.push({ axis: 'x', from: { x: right(l), y }, to: { x: r.x, y }, value: gapX });
  }
  if (gapY !== null) {
    const [t, btm] = a.y >= bottom(b) ? [b, a] : [a, b];
    const x = overlapX > 0 ? mid(Math.max(a.x, b.x), Math.min(right(a), right(b))) : mid(a.x, right(a));
    out.push({ axis: 'y', from: { x, y: bottom(t) }, to: { x, y: btm.y }, value: gapY });
  }
  return out;
}

/** while dragging: the gap to the nearest neighbour on each side (only neighbours that overlap the moving rect on the other axis) */
export function dragDistances(moving: Rect, others: Rect[]): Measure[] {
  const out: Measure[] = [];
  const bandY = (o: Rect) => Math.min(bottom(moving), bottom(o)) - Math.max(moving.y, o.y) > 0;
  const bandX = (o: Rect) => Math.min(right(moving), right(o)) - Math.max(moving.x, o.x) > 0;
  const nearest = (cands: { o: Rect; gap: number }[]) => cands.sort((p, q) => p.gap - q.gap)[0];
  const l = nearest(others.filter((o) => bandY(o) && right(o) <= moving.x).map((o) => ({ o, gap: moving.x - right(o) })));
  const r = nearest(others.filter((o) => bandY(o) && o.x >= right(moving)).map((o) => ({ o, gap: o.x - right(moving) })));
  const t = nearest(others.filter((o) => bandX(o) && bottom(o) <= moving.y).map((o) => ({ o, gap: moving.y - bottom(o) })));
  const b = nearest(others.filter((o) => bandX(o) && o.y >= bottom(moving)).map((o) => ({ o, gap: o.y - bottom(moving) })));
  const cy = moving.y + moving.height / 2;
  const cx = moving.x + moving.width / 2;
  if (l) out.push({ axis: 'x', from: { x: right(l.o), y: cy }, to: { x: moving.x, y: cy }, value: l.gap });
  if (r) out.push({ axis: 'x', from: { x: right(moving), y: cy }, to: { x: r.o.x, y: cy }, value: r.gap });
  if (t) out.push({ axis: 'y', from: { x: cx, y: bottom(t.o) }, to: { x: cx, y: moving.y }, value: t.gap });
  if (b) out.push({ axis: 'y', from: { x: cx, y: bottom(moving) }, to: { x: cx, y: b.o.y }, value: b.gap });
  return out;
}

// ---- guides ---------------------------------------------------------------------------------------------------------------
export const addGuide = (guides: Guide[], g: Guide): Guide[] => [...guides.filter((x) => x.id !== g.id), g];
export const moveGuide = (guides: Guide[], id: string, pos: number): Guide[] => guides.map((g) => (g.id === id ? { ...g, pos } : g));
export const removeGuide = (guides: Guide[], id: string): Guide[] => guides.filter((g) => g.id !== id);

/** shift that makes an edge or the centre of `r` sit on a guide (within `threshold`) */
export function snapToGuides(r: Rect, guides: Guide[], threshold: number): { dx: number; dy: number } {
  const pull = (points: number[], axis: 'x' | 'y'): number => {
    let best = 0;
    let bestAbs = Infinity;
    for (const g of guides) {
      if (g.axis !== axis) continue;
      for (const p of points) {
        const d = g.pos - p;
        if (Math.abs(d) <= threshold && Math.abs(d) < bestAbs) { best = d; bestAbs = Math.abs(d); }
      }
    }
    return z(best);
  };
  return { dx: pull([r.x, r.x + r.width / 2, right(r)], 'x'), dy: pull([r.y, r.y + r.height / 2, bottom(r)], 'y') };
}

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
/** ruler marks between flow coordinates `from` and `to`: a major tick at least ~50 screen px apart */
export function rulerTicks(from: number, to: number, zoom: number): { major: number; ticks: number[] } {
  const major = STEPS.find((s) => s * zoom >= 50) ?? STEPS[STEPS.length - 1];
  const ticks: number[] = [];
  for (let v = Math.ceil(from / major) * major; v <= to; v += major) ticks.push(z(v));
  return { major, ticks };
}

// ---- constraints ----------------------------------------------------------------------------------------------------------
const axis = (pos: number, size: number, from: number, to: number, mode: 'start' | 'end' | 'center' | 'stretch' | 'scale'): [number, number] => {
  const d = to - from;
  switch (mode) {
    case 'end': return [pos + d, size];
    case 'center': return [pos + d / 2, size];
    case 'stretch': return [pos, size + d];
    case 'scale': { const s = from > 0 ? to / from : 1; return [pos * s, size * s]; }
    default: return [pos, size];
  }
};
const H = { left: 'start', right: 'end', center: 'center', stretch: 'stretch', scale: 'scale' } as const;
const V = { top: 'start', bottom: 'end', center: 'center', stretch: 'stretch', scale: 'scale' } as const;

/** a child (rect relative to its frame) after the frame went from `from` to `to` */
export function applyConstraints(child: Rect, from: { width: number; height: number }, to: { width: number; height: number }, c: NodeConstraints): Rect {
  const [x, width] = axis(child.x, child.width, from.width, to.width, H[c.h]);
  const [y, height] = axis(child.y, child.height, from.height, to.height, V[c.v]);
  return { x: z(x), y: z(y), width: z(width), height: z(height) };
}

/** apply the constraints of the children of container / frame `id` for a resize `from` -> `to` (`nodes` still hold the OLD frame size) */
export function resizeWithConstraints(nodes: DiagramNode[], id: string, from: { width: number; height: number }, to: { width: number; height: number }): DiagramNode[] {
  const box = nodes.find((n) => n.id === id);
  if (!box || (from.width === to.width && from.height === to.height)) return nodes;
  const isFrame = box.type === 'frame';
  const kids = new Map((isFrame ? contentInFrame(nodes, box) : nodes.filter((n) => n.parentId === id)).filter((k) => k.data.constraints).map((k) => [k.id, k]));
  if (!kids.size) return nodes;
  const origin = isFrame ? box.position : { x: 0, y: 0 };
  return nodes.map((n) => {
    const k = kids.get(n.id);
    if (!k) return n;
    const s = nodeSize(k);
    const r = applyConstraints({ x: k.position.x - origin.x, y: k.position.y - origin.y, width: s.width, height: s.height }, from, to, k.data.constraints!);
    const resized = r.width !== s.width || r.height !== s.height;
    return { ...k, position: { x: r.x + origin.x, y: r.y + origin.y }, ...(resized ? { width: r.width, height: r.height, style: { ...(k.style ?? {}), width: r.width, height: r.height } } : {}) };
  });
}
