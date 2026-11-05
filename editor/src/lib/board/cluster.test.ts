import { describe, expect, it } from 'vitest';
import { arrangeAsGrid, groupByColor } from './cluster';
import { createSticky } from './sticky';
import type { DiagramNode } from '../../types';

const st = (id: string, x: number, y: number, color = 'yellow'): DiagramNode => ({ ...createSticky(id, { x: 0, y: 0 }, { color }), position: { x, y } });
const pos = (m: Map<string, { x: number; y: number }>, id: string) => m.get(id)!;

describe('arrangeAsGrid', () => {
  it('lays out in rows by reading order with a gap, starting at the top-left of the selection', () => {
    const nodes = [st('a', 500, 300), st('b', 0, 0), st('c', 300, 0), st('d', 600, 0)];
    const m = arrangeAsGrid(nodes, { columns: 2 });
    // reading order: b (0,0), c (300,0), d (600,0), a (500,300)
    expect(pos(m, 'b')).toEqual({ x: 0, y: 0 });
    expect(pos(m, 'c').x).toBeGreaterThan(160);
    expect(pos(m, 'c').y).toBe(0);
    expect(pos(m, 'd').x).toBe(0);
    expect(pos(m, 'd').y).toBeGreaterThan(140);
    expect(pos(m, 'a').y).toBe(pos(m, 'd').y);
  });
  it('picks a near-square number of columns by default', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => st(`n${i}`, i * 10, 0));
    const m = arrangeAsGrid(nodes);
    const xs = new Set([...m.values()].map((p) => p.x));
    expect(xs.size).toBe(3);
  });
  it('returns nothing for fewer than two nodes', () => {
    expect(arrangeAsGrid([st('a', 0, 0)]).size).toBe(0);
  });
  it('never overlaps', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => st(`n${i}`, i, i));
    const m = arrangeAsGrid(nodes);
    const rects = [...m.values()].map((p) => ({ x: p.x, y: p.y, w: 160, h: 140 }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });
});

describe('groupByColor', () => {
  it('puts each colour in its own column, ordered by the palette, keeping reading order inside', () => {
    const nodes = [st('p1', 0, 0, 'pink'), st('y1', 10, 10, 'yellow'), st('p2', 20, 0, 'pink'), st('b1', 30, 0, 'blue')];
    const m = groupByColor(nodes);
    expect(pos(m, 'y1').x).toBeLessThan(pos(m, 'p1').x); // yellow first in the palette
    expect(pos(m, 'p1').x).toBe(pos(m, 'p2').x);
    expect(pos(m, 'p2').y).toBeGreaterThan(pos(m, 'p1').y);
    expect(new Set([pos(m, 'y1').x, pos(m, 'p1').x, pos(m, 'b1').x]).size).toBe(3);
  });
  it('anchors at the selection top-left', () => {
    const nodes = [st('a', 100, 200, 'blue'), st('b', 300, 250, 'pink')];
    const m = groupByColor(nodes);
    expect(Math.min(...[...m.values()].map((p) => p.x))).toBe(100);
    expect(Math.min(...[...m.values()].map((p) => p.y))).toBe(200);
  });
  it('leaves non-sticky nodes alone', () => {
    const t: DiagramNode = { id: 't', type: 'text', position: { x: 0, y: 0 }, data: { label: 't' } };
    expect(groupByColor([t, st('a', 0, 0)]).has('t')).toBe(false);
  });
});
