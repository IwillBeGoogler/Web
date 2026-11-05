import { describe, expect, it } from 'vitest';
import { createStrokeNode, decodePoints, encodePoints, eraseHits, outlinePath, smoothPoints, strokePoints, type SPt } from './freehand';

const wave = (n = 60): SPt[] => Array.from({ length: n }, (_, i) => ({ x: i * 3.3, y: Math.sin(i / 5) * 40 + 50, p: 0.5 }));

describe('encodePoints / decodePoints', () => {
  it('round-trips within the 0.5 px grid', () => {
    const pts = wave();
    const back = decodePoints(encodePoints(pts));
    expect(back).toHaveLength(pts.length);
    back.forEach((b, i) => {
      expect(Math.abs(b.x - pts[i].x)).toBeLessThanOrEqual(0.26);
      expect(Math.abs(b.y - pts[i].y)).toBeLessThanOrEqual(0.26);
    });
  });
  it('keeps pressure when it varies, drops it when constant', () => {
    const varied = wave(10).map((p, i) => ({ ...p, p: i / 10 }));
    expect(decodePoints(encodePoints(varied))[5].p).toBeCloseTo(0.5, 1);
    expect(encodePoints(wave(10).map((p) => ({ ...p, p: 0.5 }))).startsWith('a')).toBe(true);
    expect(encodePoints(varied).startsWith('b')).toBe(true);
  });
  it('is compact: well under the SVG path text', () => {
    const pts = wave(200);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    expect(encodePoints(pts).length).toBeLessThan(path.length * 0.6);
  });
  it('handles empty, negative and garbage input', () => {
    expect(decodePoints(encodePoints([]))).toEqual([]);
    expect(decodePoints(encodePoints([{ x: -10.5, y: -3, p: 0.5 }, { x: -12, y: 4, p: 0.5 }]))[1].x).toBeCloseTo(-12, 0);
    expect(decodePoints('')).toEqual([]);
    expect(decodePoints('zzz not a stroke')).toEqual([]);
  });
});

describe('smoothPoints', () => {
  it('reduces jitter but keeps the ends', () => {
    const noisy = Array.from({ length: 40 }, (_, i) => ({ x: i * 4, y: (i % 2 ? 3 : -3), p: 0.5 }));
    const s = smoothPoints(noisy);
    const amp = (a: SPt[]) => Math.max(...a.map((p) => p.y)) - Math.min(...a.map((p) => p.y));
    expect(amp(s.slice(2, -2))).toBeLessThan(amp(noisy.slice(2, -2)));
    expect(s[0]).toEqual(noisy[0]);
    expect(s[s.length - 1]).toEqual(noisy[noisy.length - 1]);
    expect(s).toHaveLength(noisy.length);
  });
  it('leaves tiny strokes alone', () => {
    const two = [{ x: 0, y: 0, p: 0.5 }, { x: 5, y: 5, p: 0.5 }];
    expect(smoothPoints(two)).toEqual(two);
  });
});

describe('outlinePath', () => {
  it('returns a closed path of finite numbers', () => {
    const d = outlinePath(wave(), { size: 4 });
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/NaN|Infinity/);
  });
  it('is empty for no points and a dot for one', () => {
    expect(outlinePath([], { size: 4 })).toBe('');
    expect(outlinePath([{ x: 5, y: 5, p: 0.5 }], { size: 6 })).toContain('Z');
  });
  it('highlighter is a wider outline than the pen', () => {
    const w = (d: string) => { const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number); const ys = n.filter((_, i) => i % 2); return Math.max(...ys) - Math.min(...ys); };
    expect(w(outlinePath(wave(), { size: 20, thinning: 0 }))).toBeGreaterThan(w(outlinePath(wave(), { size: 3 })));
  });
});

describe('createStrokeNode / strokePoints', () => {
  it('builds a draw node whose points are node-local and decode back', () => {
    const pts = wave().map((p) => ({ ...p, x: p.x + 1000, y: p.y + 500 }));
    const n = createStrokeNode('d1', pts, { color: '#ff0000', size: 3, brush: 'pen' })!;
    expect(n.type).toBe('draw');
    expect(n.data.brush).toBe('pen');
    expect(typeof n.data.pts).toBe('string');
    expect(n.position.x).toBeGreaterThan(900);
    const local = strokePoints(n);
    expect(Math.min(...local.map((p) => p.x))).toBeLessThan(10);
  });
  it('rejects one-point strokes', () => {
    expect(createStrokeNode('d', [{ x: 0, y: 0, p: 0.5 }], { color: '#000', size: 3, brush: 'pen' })).toBeNull();
  });
  it('highlighter keeps its translucency flag', () => {
    const n = createStrokeNode('h', wave(), { color: '#ffd400', size: 18, brush: 'highlighter' })!;
    expect(n.data.brush).toBe('highlighter');
  });
});

describe('eraseHits', () => {
  const stroke = (id: string, x: number, y: number) => createStrokeNode(id, [0, 20, 40, 60, 80, 100].map((i) => ({ x: x + i, y, p: 0.5 })), { color: '#000', size: 3, brush: 'pen' })!;
  it('hits strokes whose line passes within the radius, ignores others', () => {
    const a = stroke('a', 0, 0);
    const b = stroke('b', 0, 300);
    const hits = eraseHits([a, b, { id: 's', type: 'sticky', position: { x: 0, y: 0 }, data: { label: '' } }], { x: 50, y: 6 }, 10);
    expect(hits).toEqual(['a']);
  });
  it('misses when the pointer is far', () => {
    expect(eraseHits([stroke('a', 0, 0)], { x: 50, y: 80 }, 10)).toEqual([]);
  });
  it('hits legacy path strokes by bounding box', () => {
    const legacy = { id: 'l', type: 'draw' as const, position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: '', path: 'M0 0 L100 100' } };
    expect(eraseHits([legacy], { x: 50, y: 50 }, 10)).toEqual(['l']);
    expect(eraseHits([legacy], { x: 90, y: 5 }, 4)).toEqual([]);
  });
});
