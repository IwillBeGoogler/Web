import { describe, expect, it } from 'vitest';
import { computeGuides } from './guides';

const r = (x: number, y: number, w = 100, h = 60) => ({ x, y, width: w, height: h });

describe('computeGuides', () => {
  it('no guides when nothing is near', () => {
    const g = computeGuides(r(0, 0), [r(500, 500)], 5);
    expect(g.lines).toEqual([]);
    expect(g.dx).toBe(0);
    expect(g.dy).toBe(0);
  });
  it('snaps left edges and reports a vertical line', () => {
    const g = computeGuides(r(103, 0), [r(100, 300)], 5);
    expect(g.dx).toBe(-3);
    expect(g.lines.some((l) => l.orientation === 'v' && l.pos === 100)).toBe(true);
    expect(g.lines.find((l) => l.orientation === 'v')!.from).toBeLessThanOrEqual(0); // spans both nodes
    expect(g.lines.find((l) => l.orientation === 'v')!.to).toBeGreaterThanOrEqual(360);
  });
  it('snaps centres and right edges, and horizontal alignment', () => {
    // dragged centre x = 253+50 = 303; other centre 300 -> dx -3
    expect(computeGuides(r(253, 0), [r(250, 300, 100, 60)], 5).dx).toBe(-3);
    // dragged centre y = 100+30 = 130 vs other 128+30 = 158? no; use top edges
    const g = computeGuides(r(0, 202), [r(400, 200)], 5);
    expect(g.dy).toBe(-2);
    expect(g.lines.some((l) => l.orientation === 'h' && l.pos === 200)).toBe(true);
  });
  it('threshold is respected and the closest candidate wins', () => {
    expect(computeGuides(r(110, 0), [r(100, 300)], 5).dx).toBe(0);
    const g = computeGuides(r(103, 0), [r(100, 300), r(104, 600)], 5);
    expect(g.dx).toBe(1); // 104 is closer than 100
  });
});
