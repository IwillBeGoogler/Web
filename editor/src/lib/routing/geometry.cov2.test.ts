import { describe, expect, it } from 'vitest';
import { center, ensureEndSegments, nearestSides, nearestT, opposite, orthogonalize, pointAtT, segmentIntersectsRect } from './geometry';
import { computeHops, curvedRoute, hopPoints, labelAnchor, polylineToPath } from './path';

describe('geometry', () => {
  it('opposite flips every side', () => {
    expect([opposite('top'), opposite('bottom'), opposite('left'), opposite('right')]).toEqual(['bottom', 'top', 'right', 'left']);
  });
  it('nearestSides copes with zero-sized rects and picks vertical when the gap is mostly vertical', () => {
    expect(nearestSides({ x: 0, y: 0, width: 0, height: 0 }, { x: 10, y: 0, width: 0, height: 0 })).toEqual(['right', 'left']);
    expect(nearestSides({ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 10, width: 0, height: 0 })).toEqual(['bottom', 'top']);
    expect(nearestSides({ x: 0, y: 100, width: 50, height: 50 }, { x: 10, y: 0, width: 50, height: 50 })).toEqual(['top', 'bottom']);
  });
  it('a degenerate rect is never intersected', () => {
    expect(segmentIntersectsRect({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: -5, width: 0, height: 10 })).toBe(false);
    expect(segmentIntersectsRect({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0, width: 10, height: 0 })).toBe(false);
    expect(center({ x: 0, y: 0, width: 10, height: 20 })).toEqual({ x: 5, y: 10 });
  });
  it('pointAtT handles empty, single-point and zero-length polylines', () => {
    expect(pointAtT([], 0.5)).toEqual({ pt: { x: 0, y: 0 }, angle: 0 });
    expect(pointAtT([{ x: 3, y: 4 }], 0.5)).toEqual({ pt: { x: 3, y: 4 }, angle: 0 });
    expect(pointAtT([{ x: 1, y: 1 }, { x: 1, y: 1 }], 0.5).pt).toEqual({ x: 1, y: 1 });
    expect(pointAtT([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.25)).toEqual({ pt: { x: 2.5, y: 0 }, angle: 0 });
  });
  it('nearestT: a zero-length polyline is 0.5; zero-length segments inside a real one are skipped', () => {
    expect(nearestT([{ x: 1, y: 1 }, { x: 1, y: 1 }], { x: 5, y: 5 })).toBe(0.5);
    expect(nearestT([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 3 })).toBeCloseTo(0.5);
  });
  it('orthogonalize: short input is returned as is; the first leg direction is inferred when not given', () => {
    const one = [{ x: 0, y: 0 }];
    expect(orthogonalize(one)).toBe(one);
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 10, y: 4 }])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }]);
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 4, y: 10 }])).toEqual([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 4, y: 10 }]);
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 10, y: 4 }], false)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 }]);
  });
  it('a short last leg is not stretched when that would fold the previous leg back over itself', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 50 }, { x: 10, y: 50 }];
    const out = ensureEndSegments(pts, 16);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 50 });
    expect(out[out.length - 2]).toEqual({ x: 5, y: 50 });
  });
});

describe('path', () => {
  it('hopPoints ignores diagonal segments on either side; computeHops pairs every edge', () => {
    const h = [{ x: 0, y: 5 }, { x: 20, y: 5 }];
    const v = [{ x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(hopPoints([{ x: 0, y: 0 }, { x: 10, y: 10 }, ...h], v)).toEqual([{ x: 10, y: 5 }]);
    expect(hopPoints(h, [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([]);
    expect(computeHops(new Map([['h', h], ['v', v]])).get('h')).toEqual([{ x: 10, y: 5 }]);
    expect(computeHops(new Map([['h', h], ['v', v]])).has('v')).toBe(false);
  });
  it('polylineToPath: empty input, hops in both directions, hops too close together, zero-length neighbours', () => {
    expect(polylineToPath([])).toBe('');
    const right = polylineToPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], { hops: [{ x: 50, y: 0 }] });
    expect(right).toContain('A5,5 0 0 1 55,0');
    const left = polylineToPath([{ x: 100, y: 0 }, { x: 0, y: 0 }], { hops: [{ x: 50, y: 0 }] });
    expect(left).toContain('A5,5 0 0 0 45,0');
    const near = polylineToPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], { hops: [{ x: 40, y: 0 }, { x: 46, y: 0 }, { x: 70, y: 0 }] });
    expect(near.match(/A5,5/g)).toHaveLength(2);
    const sorted = polylineToPath([{ x: 100, y: 0 }, { x: 0, y: 0 }], { hops: [{ x: 30, y: 0 }, { x: 70, y: 0 }] });
    expect(sorted.indexOf('L75,0')).toBeLessThan(sorted.indexOf('L35,0'));
    const rounded = polylineToPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }], { radius: 8 });
    expect(rounded.startsWith('M0,0')).toBe(true);
    expect(rounded).not.toContain('NaN');
  });
  it('curvedRoute with coincident ports and waypoints stays finite', () => {
    const p = { pt: { x: 10, y: 10 }, side: 'right' as const };
    const same = curvedRoute(p, { pt: { x: 10, y: 10 }, side: 'left' }, [{ x: 10, y: 10 }, { x: 10, y: 10 }], 5);
    expect(same.d).not.toContain('NaN');
    expect(same.points.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
  });
  it('labelAnchor with a single point or none', () => {
    expect(labelAnchor([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
    expect(labelAnchor([])).toEqual({ x: 0, y: 0 });
  });
});
