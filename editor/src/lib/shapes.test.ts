import { describe, expect, it } from 'vitest';
import { createDrawNode, createNodeForTool, rectFromPoints, strokeDasharray, toolForKey, pointsToPath } from './shapes';

describe('rectFromPoints', () => {
  it('normalizes reversed drag', () => {
    expect(rectFromPoints({ x: 100, y: 80 }, { x: 40, y: 20 })).toEqual({ x: 40, y: 20, width: 60, height: 60 });
  });
  it('click (tiny drag) yields default size centred on point', () => {
    const r = rectFromPoints({ x: 200, y: 200 }, { x: 201, y: 201 }, { width: 100, height: 60 });
    expect(r).toEqual({ x: 150, y: 170, width: 100, height: 60 });
  });
});

describe('createNodeForTool', () => {
  const r = { x: 10, y: 20, width: 120, height: 80 };
  it('shapes', () => {
    expect(createNodeForTool('rect', r, 'a')).toMatchObject({ id: 'a', type: 'shape', data: { shape: 'rect' }, width: 120, height: 80, position: { x: 10, y: 20 } });
    expect(createNodeForTool('ellipse', r, 'a')!.data.shape).toBe('ellipse');
    expect(createNodeForTool('diamond', r, 'a')!.data.shape).toBe('diamond');
  });
  it('sticky and text', () => {
    expect(createNodeForTool('sticky', r, 'a')).toMatchObject({ type: 'sticky', data: { fill: '#fff3a3' } });
    expect(createNodeForTool('text', r, 'a')!.type).toBe('text');
  });
  it('non-creating tools return null', () => {
    for (const t of ['select', 'hand', 'arrow', 'pen'] as const) expect(createNodeForTool(t, r, 'a')).toBeNull();
  });
});

describe('freehand', () => {
  it('builds path relative to bbox', () => {
    const pts = [{ x: 100, y: 100 }, { x: 150, y: 120 }, { x: 200, y: 100 }];
    const node = createDrawNode(pts, 'd', '#000')!;
    expect(node.type).toBe('draw');
    expect(node.position.x).toBeLessThan(100);
    expect(node.data.path!.startsWith('M')).toBe(true);
    expect(node.width).toBeGreaterThanOrEqual(100);
  });
  it('rejects single point', () => {
    expect(createDrawNode([{ x: 1, y: 1 }], 'd', '#000')).toBeNull();
  });
  it('pointsToPath', () => {
    expect(pointsToPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M1 2 L3 4');
  });
});

describe('style + keys', () => {
  it('strokeDasharray', () => {
    expect(strokeDasharray('solid', 2)).toBeUndefined();
    expect(strokeDasharray('dashed', 2)).toBe('8 5');
    expect(strokeDasharray('dotted', 2)).toBe('2 5');
  });
  it('toolForKey', () => {
    const m: Record<string, string> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', d: 'diamond', t: 'text', n: 'sticky', a: 'arrow', p: 'pen' };
    for (const [k, t] of Object.entries(m)) expect(toolForKey(k)).toBe(t);
    expect(toolForKey('V')).toBe('select');
    expect(toolForKey('x')).toBeNull();
  });
});
