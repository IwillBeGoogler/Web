import { describe, expect, it } from 'vitest';
import { computeTooltipPosition, isTruncated } from './tooltip';

const vp = { width: 1000, height: 700 };
const tip = { width: 200, height: 60 };

describe('computeTooltipPosition', () => {
  it('sits above the anchor, centred', () => {
    const p = computeTooltipPosition({ x: 400, y: 300, width: 80, height: 60 }, tip, vp);
    expect(p.placement).toBe('top');
    expect(p.x).toBe(440 - 100);
    expect(p.y).toBe(300 - 8 - 60);
  });
  it('flips below when there is no room above', () => {
    const p = computeTooltipPosition({ x: 400, y: 20, width: 80, height: 60 }, tip, vp);
    expect(p.placement).toBe('bottom');
    expect(p.y).toBe(20 + 60 + 8);
  });
  it('clamps horizontally inside the viewport', () => {
    const left = computeTooltipPosition({ x: 0, y: 300, width: 40, height: 40 }, tip, vp);
    expect(left.x).toBe(6);
    expect(left.arrowX).toBeGreaterThanOrEqual(10);
    const right = computeTooltipPosition({ x: 980, y: 300, width: 40, height: 40 }, tip, vp);
    expect(right.x).toBe(1000 - 200 - 6);
    expect(right.arrowX).toBeLessThanOrEqual(190);
  });
  it('stays on top when it fits neither way but top is the only option', () => {
    const p = computeTooltipPosition({ x: 400, y: 20, width: 80, height: 660 }, tip, { width: 1000, height: 700 });
    expect(p.y).toBeGreaterThanOrEqual(6);
  });
});

describe('isTruncated', () => {
  it('detects horizontal and vertical overflow', () => {
    expect(isTruncated({ scrollWidth: 120, clientWidth: 100 })).toBe(true);
    expect(isTruncated({ scrollWidth: 100, clientWidth: 100 })).toBe(false);
    expect(isTruncated({ scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 20 })).toBe(true);
  });
});
