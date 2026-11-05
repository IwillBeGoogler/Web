import { describe, expect, it } from 'vitest';
import { arrowMetrics, shortenEnds, resolveMarkers, ARROW_BASE } from './arrow';
import { BUILTIN_SETTINGS, resolveSettings, validateSettings } from './settings';
import { polylineLength } from './routing/geometry';
import type { DiagramEdge, DiagramNode } from '../types';

describe('arrowMetrics', () => {
  it('is ~8px long at stroke 1.5 (size M) and slim', () => {
    const m = arrowMetrics(1.5, 'M');
    expect(m.length).toBeCloseTo(8, 5);
    expect(m.width).toBeLessThan(m.length);
    expect(m.width).toBeGreaterThan(m.length / 2);
  });
  it('scales with stroke width and with the S/M/L setting', () => {
    expect(arrowMetrics(3, 'M').length).toBeCloseTo(16, 5);
    expect(arrowMetrics(1.5, 'S').length).toBeLessThan(arrowMetrics(1.5, 'M').length);
    expect(arrowMetrics(1.5, 'L').length).toBeGreaterThan(arrowMetrics(1.5, 'M').length);
    expect(ARROW_BASE.S).toBeLessThan(ARROW_BASE.M);
  });
  it('is clamped so hairlines stay visible and thick lines stay sane', () => {
    expect(arrowMetrics(0.5, 'M').length).toBeGreaterThanOrEqual(6);
    expect(arrowMetrics(8, 'M').length).toBeLessThanOrEqual(8 * 2.5);
  });
  it('defaults to M', () => {
    expect(arrowMetrics(1.5).length).toBe(arrowMetrics(1.5, 'M').length);
  });
});

describe('shortenEnds (line ends at the arrowhead base)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }];
  it('cuts the end along the last segment', () => {
    const out = shortenEnds(pts, 0, 8);
    expect(out[out.length - 1]).toEqual({ x: 100, y: 42 });
    expect(out[0]).toEqual({ x: 0, y: 0 });
  });
  it('cuts the start along the first segment', () => {
    expect(shortenEnds(pts, 8, 0)[0]).toEqual({ x: 8, y: 0 });
  });
  it('cuts across a short last segment', () => {
    const out = shortenEnds([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 5 }], 0, 8);
    expect(out[out.length - 1].x).toBeCloseTo(97, 5);
    expect(out[out.length - 1].y).toBe(0);
  });
  it('never inverts a very short line', () => {
    const out = shortenEnds([{ x: 0, y: 0 }, { x: 10, y: 0 }], 8, 8);
    expect(polylineLength(out)).toBeGreaterThan(0);
    expect(out[0].x).toBeLessThan(out[out.length - 1].x);
  });
  it('is a no-op without cuts', () => {
    expect(shortenEnds(pts, 0, 0)).toEqual(pts);
  });
});

describe('arrowSize setting', () => {
  it('defaults to M and validates', () => {
    expect(BUILTIN_SETTINGS.edge.arrowSize).toBe('M');
    expect(resolveSettings({ edge: { arrowSize: 'L' } }).edge.arrowSize).toBe('L');
    expect(validateSettings({ edge: { arrowSize: 'XL' } }).edge).toBeUndefined();
    expect(validateSettings({ edge: { arrowSize: 'S' } }).edge).toEqual({ arrowSize: 'S' });
  });
});

describe('resolveMarkers', () => {
  const nodes: DiagramNode[] = [
    { id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a' } },
    { id: 'j', type: 'junction', position: { x: 0, y: 0 }, data: { label: '' } },
  ];
  const edge = (source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id: 'e', source, target, data });
  it('follows the arrows setting, none at junctions', () => {
    expect(resolveMarkers(nodes, edge('a', 'a'), 'end')).toEqual({ start: 'none', end: 'arrow' });
    expect(resolveMarkers(nodes, edge('a', 'j'), 'both')).toEqual({ start: 'arrow', end: 'none' });
    expect(resolveMarkers(nodes, edge('j', 'a'), 'both')).toEqual({ start: 'none', end: 'arrow' });
    expect(resolveMarkers(nodes, edge('a', 'a', { endMarker: 'diamond' }), 'none')).toEqual({ start: 'none', end: 'diamond' });
  });
});
