import { describe, expect, it } from 'vitest';
import { recognizeShape, recognizedToNode, rdp } from './recognize';

type P = { x: number; y: number };
// deterministic jitter
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);
const jitter = (pts: P[], amt: number, seed = 7): P[] => { const r = rng(seed); return pts.map((p) => ({ x: p.x + r() * amt, y: p.y + r() * amt })); };
const line = (a: P, b: P, n = 25): P[] => Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
const poly = (vs: P[], close = true): P[] => vs.flatMap((v, i) => (i < vs.length - 1 || close ? line(v, vs[(i + 1) % vs.length]) : [v]));
const circle = (cx: number, cy: number, r: number, n = 60, startAngle = 0): P[] => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + r * Math.cos(startAngle + (i / n) * Math.PI * 2), y: cy + r * Math.sin(startAngle + (i / n) * Math.PI * 2) }));

describe('rdp', () => {
  it('reduces a straight run to its end points', () => {
    expect(rdp(line({ x: 0, y: 0 }, { x: 100, y: 0 }), 2)).toHaveLength(2);
  });
});

describe('recognizeShape', () => {
  it('circle', () => {
    const r = recognizeShape(jitter(circle(200, 200, 80), 6));
    expect(r?.kind).toBe('circle');
    expect(r!.bbox.width).toBeGreaterThan(130);
  });
  it('circle starting anywhere and drawn counter-clockwise, slightly open', () => {
    const pts = circle(0, 0, 60, 50, 2.1).reverse().slice(0, 48);
    expect(recognizeShape(jitter(pts, 4, 3))?.kind).toBe('circle');
  });
  it('ellipse is still a circle kind with its own bbox', () => {
    const pts = circle(0, 0, 60).map((p) => ({ x: p.x * 1.8, y: p.y }));
    const r = recognizeShape(jitter(pts, 4));
    expect(r?.kind).toBe('circle');
    expect(r!.bbox.width).toBeGreaterThan(r!.bbox.height * 1.4);
  });
  it('rectangle starting at a corner', () => {
    const r = recognizeShape(jitter(poly([{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 110 }, { x: 0, y: 110 }]), 6));
    expect(r?.kind).toBe('rect');
    expect(r!.bbox.width).toBeGreaterThan(150);
  });
  it('rectangle starting mid-edge', () => {
    const pts = poly([{ x: 90, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 110 }, { x: 0, y: 110 }, { x: 0, y: 0 }, { x: 90, y: 0 }], false);
    expect(recognizeShape(jitter(pts, 5, 11))?.kind).toBe('rect');
  });
  it('triangle', () => {
    const r = recognizeShape(jitter(poly([{ x: 100, y: 0 }, { x: 200, y: 160 }, { x: 0, y: 160 }]), 6));
    expect(r?.kind).toBe('triangle');
    expect(r!.points).toHaveLength(3);
  });
  it('straight line becomes an arrow with from and to', () => {
    const r = recognizeShape(jitter(line({ x: 0, y: 0 }, { x: 240, y: 30 }, 40), 4));
    expect(r?.kind).toBe('arrow');
    expect(Math.hypot(r!.to!.x - 240, r!.to!.y - 30)).toBeLessThan(15);
    expect(Math.hypot(r!.from!.x, r!.from!.y)).toBeLessThan(15);
  });
  it('arrow drawn with a head in one stroke', () => {
    const tip = { x: 240, y: 0 };
    const pts = [...line({ x: 0, y: 0 }, tip, 40), ...line(tip, { x: 205, y: -28 }, 8), ...line({ x: 205, y: -28 }, tip, 8), ...line(tip, { x: 205, y: 28 }, 8)];
    const r = recognizeShape(jitter(pts, 3));
    expect(r?.kind).toBe('arrow');
    expect(Math.hypot(r!.to!.x - 240, r!.to!.y)).toBeLessThan(20);
  });
  it('rejects a scribble, an arc, and tiny marks', () => {
    const zig = poly([{ x: 0, y: 0 }, { x: 60, y: 80 }, { x: 40, y: -10 }, { x: 120, y: 90 }, { x: 70, y: 5 }, { x: 160, y: 60 }], false);
    expect(recognizeShape(zig)).toBeNull();
    const arc = circle(0, 0, 80, 40).slice(0, 22);
    expect(recognizeShape(arc)).toBeNull();
    expect(recognizeShape(line({ x: 0, y: 0 }, { x: 5, y: 5 }, 10))).toBeNull();
    expect(recognizeShape([])).toBeNull();
  });
});

describe('recognizedToNode', () => {
  const style = { color: '#222222', size: 3 };
  it('circle and rect become editable shape nodes with no fill', () => {
    const c = recognizedToNode(recognizeShape(jitter(circle(200, 200, 80), 5))!, 'n1', style);
    expect(c.type).toBe('shape');
    expect(c.data.shape).toBe('ellipse');
    expect(c.data.background).toBe('transparent');
    const r = recognizedToNode(recognizeShape(jitter(poly([{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 110 }, { x: 0, y: 110 }]), 5))!, 'n2', style);
    expect(r.data.shape).toBe('rect');
  });
  it('triangle and arrow become clean draw paths', () => {
    const t = recognizedToNode(recognizeShape(jitter(poly([{ x: 100, y: 0 }, { x: 200, y: 160 }, { x: 0, y: 160 }]), 5))!, 'n3', style);
    expect(t.type).toBe('draw');
    expect(t.data.path).toMatch(/^M[^M]*Z$/);
    const a = recognizedToNode(recognizeShape(line({ x: 0, y: 0 }, { x: 240, y: 0 }, 40))!, 'n4', style);
    expect(a.type).toBe('draw');
    expect((a.data.path as string).match(/M/g)!.length).toBeGreaterThanOrEqual(1);
  });
});
