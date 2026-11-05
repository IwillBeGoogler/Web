import { describe, expect, it } from 'vitest';
import { RectGrid } from './spatial';
import type { Rect } from './geometry';

const rect = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, width: w, height: h });

describe('RectGrid', () => {
  it('returns exactly the rectangles that intersect the query window', () => {
    const g = new RectGrid<string>(200);
    const items: [string, Rect][] = [];
    for (let i = 0; i < 400; i++) items.push([`n${i}`, rect((i % 20) * 150, Math.floor(i / 20) * 110)]);
    for (const [id, r] of items) g.insert(id, r);
    const q = { x: 700, y: 500, width: 400, height: 300 };
    const brute = items.filter(([, r]) => r.x < q.x + q.width && r.x + r.width > q.x && r.y < q.y + q.height && r.y + r.height > q.y).map(([id]) => id).sort();
    expect(g.query(q).sort()).toEqual(brute);
  });
  it('returns an item once even when it spans several cells', () => {
    const g = new RectGrid<string>(50);
    g.insert('big', rect(0, 0, 500, 500));
    expect(g.query({ x: 0, y: 0, width: 500, height: 500 })).toEqual(['big']);
  });
  it('handles negative coordinates and an empty grid', () => {
    const g = new RectGrid<string>(100);
    expect(g.query(rect(0, 0))).toEqual([]);
    g.insert('a', rect(-350, -220));
    expect(g.query({ x: -400, y: -250, width: 100, height: 100 })).toEqual(['a']);
    expect(g.query({ x: 10, y: 10, width: 10, height: 10 })).toEqual([]);
  });
});
