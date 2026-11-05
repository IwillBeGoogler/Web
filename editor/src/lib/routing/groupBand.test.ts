import { describe, expect, it } from 'vitest';
import { routeOrthogonal, smartRoute } from './router';
import type { Port, Rect } from './geometry';

const src: Port = { pt: { x: 0, y: 100 }, side: 'right' };
const dst: Port = { pt: { x: 300, y: 100 }, side: 'left' };
const block: Rect = { x: 100, y: 60, width: 100, height: 85 };

describe('group border band', () => {
  it('detours away from a border band when it costs a little more', () => {
    const plain = routeOrthogonal(src, dst, [block])!;
    expect(Math.min(...plain.map((p) => p.y))).toBeLessThan(100); // cheaper way is over the top (y = 48)
    const group: Rect = { x: -50, y: 50, width: 450, height: 350 }; // top border at y = 50: y = 48 lies in its band
    const banded = routeOrthogonal(src, dst, [block], { bands: [group] })!;
    expect(Math.max(...banded.map((p) => p.y))).toBeGreaterThan(100); // under the block instead
  });

  it('crossing a border perpendicularly stays free', () => {
    const a: Port = { pt: { x: -100, y: 0 }, side: 'right' };
    const b: Port = { pt: { x: 300, y: 50 }, side: 'left' };
    const group: Rect = { x: 0, y: -500, width: 200, height: 1000 };
    expect(routeOrthogonal(a, b, [], { bands: [group] })).toEqual(routeOrthogonal(a, b, []));
  });

  it('falls back through pad 8 and 4 before 2', () => {
    // gap of 20px between two blocks: pad 12 needs 24, pad 8 needs 16
    const top: Rect = { x: 100, y: 0, width: 100, height: 90 };
    const bot: Rect = { x: 100, y: 110, width: 100, height: 90 };
    const s: Port = { pt: { x: 0, y: 100 }, side: 'right' };
    const d: Port = { pt: { x: 300, y: 100 }, side: 'left' };
    const wall: Rect[] = [{ x: 90, y: -400, width: 120, height: 400 }, { x: 90, y: 200, width: 120, height: 400 }];
    const r = smartRoute(s, d, [top, bot, ...wall]);
    expect(r.routed).toBe(true);
  });
});
