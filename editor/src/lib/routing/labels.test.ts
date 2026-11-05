import { describe, expect, it } from 'vitest';
import { placeLabels, labelBox } from './labels';
import { LABEL_BEND_CLEARANCE } from './path';
import type { Pt, Rect } from './geometry';

const line = (...p: [number, number][]): Pt[] => p.map(([x, y]) => ({ x, y }));
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('placeLabels (collision-aware, longest straight segment first)', () => {
  it('free space: the middle of the longest segment', () => {
    const pts = line([0, 0], [40, 0], [40, 300], [200, 300]);
    const out = placeLabels([{ id: 'e', points: pts, text: 'hello', offset: 0 }], [], new Map([['e', pts]]));
    expect(out.get('e')).toEqual({ x: 40, y: 150 });
  });
  it('an obstacle on the middle slides the label along the same segment', () => {
    const pts = line([0, 0], [600, 0]);
    const obstacle: Rect = { x: 280, y: -30, width: 40, height: 60 };
    const p = placeLabels([{ id: 'e', points: pts, text: 'hello', offset: 0 }], [obstacle], new Map([['e', pts]])).get('e')!;
    expect(overlap(labelBox(p, 'hello'), obstacle)).toBe(false);
    expect(p.y).toBe(0);
    expect(p.x).toBeGreaterThanOrEqual(LABEL_BEND_CLEARANCE);
  });
  it('two labels never overlap each other', () => {
    const a = line([0, 0], [600, 0]);
    const b = line([0, 8], [600, 8]); // parallel track right next to it
    const out = placeLabels([{ id: 'a', points: a, text: 'SQL', offset: 0 }, { id: 'b', points: b, text: 'cache', offset: 0 }], [], new Map([['a', a], ['b', b]]));
    expect(overlap(labelBox(out.get('a')!, 'SQL'), labelBox(out.get('b')!, 'cache'))).toBe(false);
  });
  it('other edges crossing the chip are avoided when possible', () => {
    const a = line([0, 0], [600, 0]);
    const cross = line([300, -100], [300, 100]);
    const p = placeLabels([{ id: 'a', points: a, text: 'x', offset: 0 }], [], new Map([['a', a], ['c', cross]])).get('a')!;
    expect(Math.abs(p.x - 300)).toBeGreaterThan(8);
  });
  it('a stored position is kept (only pushed off bends)', () => {
    const pts = line([0, 0], [100, 0]);
    expect(placeLabels([{ id: 'e', points: pts, t: 0.25, text: 'x', offset: 0 }], [{ x: 0, y: -50, width: 100, height: 100 }], new Map([['e', pts]])).get('e')).toEqual({ x: 25, y: 0 });
  });
  it('when nothing is free it falls back to the middle of the longest segment', () => {
    const pts = line([0, 0], [100, 0]);
    const wall: Rect = { x: -50, y: -50, width: 300, height: 100 };
    expect(placeLabels([{ id: 'e', points: pts, text: 'x', offset: 0 }], [wall], new Map([['e', pts]])).get('e')).toEqual({ x: 50, y: 0 });
  });
});
