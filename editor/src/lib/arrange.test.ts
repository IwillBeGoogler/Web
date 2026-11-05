import { describe, expect, it } from 'vitest';
import { alignNodes, distributeNodes } from './arrange';
import type { DiagramNode } from '../types';

const n = (id: string, x: number, y: number, w = 100, h = 50, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: w, height: h, data: { label: id }, ...extra,
});
const pos = (nodes: DiagramNode[], id: string) => nodes.find((x) => x.id === id)!.position;

describe('alignNodes', () => {
  const base = [n('a', 0, 0, 100, 50), n('b', 200, 100, 60, 30), n('c', 50, 300, 80, 80)];
  const ids = ['a', 'b', 'c'];
  it('left', () => {
    const r = alignNodes(base, ids, 'left');
    expect([pos(r, 'a').x, pos(r, 'b').x, pos(r, 'c').x]).toEqual([0, 0, 0]);
  });
  it('right', () => {
    const r = alignNodes(base, ids, 'right'); // max right = 260
    expect([pos(r, 'a').x, pos(r, 'b').x, pos(r, 'c').x]).toEqual([160, 200, 180]);
  });
  it('center', () => {
    const r = alignNodes(base, ids, 'center'); // (0+260)/2 = 130
    expect([pos(r, 'a').x, pos(r, 'b').x, pos(r, 'c').x]).toEqual([80, 100, 90]);
  });
  it('top / bottom / middle', () => {
    expect(alignNodes(base, ids, 'top').map((x) => x.position.y)).toEqual([0, 0, 0]);
    expect(alignNodes(base, ids, 'bottom').map((x) => x.position.y)).toEqual([330, 350, 300]); // bottom = 380
    expect(alignNodes(base, ids, 'middle').map((x) => x.position.y)).toEqual([165, 175, 150]); // mid=190
  });
  it('needs 2+ nodes and ignores unselected and locked', () => {
    expect(alignNodes(base, ['a'], 'left')).toEqual(base);
    const withLock = [n('a', 0, 0), n('b', 200, 0, 100, 50, { data: { label: 'b', locked: true } }), n('c', 300, 0)];
    const r = alignNodes(withLock, ['a', 'b', 'c'], 'right');
    expect(pos(r, 'b').x).toBe(200); // untouched
  });
  it('works across parents using absolute coordinates', () => {
    const nodes: DiagramNode[] = [
      { id: 'g', type: 'group', position: { x: 100, y: 100 }, width: 500, height: 500, data: { label: 'g' } },
      n('a', 50, 0, 100, 50, { parentId: 'g' }), // abs x 150
      n('b', 20, 200), // abs x 20
    ];
    const r = alignNodes(nodes, ['a', 'b'], 'left'); // target abs x = 20
    expect(pos(r, 'a').x).toBe(-80); // relative to g
    expect(pos(r, 'b').x).toBe(20);
  });
});

describe('distributeNodes', () => {
  it('horizontal equal gaps', () => {
    const nodes = [n('a', 0, 0, 100), n('b', 120, 0, 100), n('c', 400, 0, 100)];
    const r = distributeNodes(nodes, ['a', 'b', 'c'], 'horizontal'); // span 0..500, widths 300, gap 100
    expect([pos(r, 'a').x, pos(r, 'b').x, pos(r, 'c').x]).toEqual([0, 200, 400]);
  });
  it('vertical equal gaps, sorted by position not order', () => {
    const nodes = [n('c', 0, 300, 50, 50), n('a', 0, 0, 50, 50), n('b', 0, 60, 50, 50)];
    const r = distributeNodes(nodes, ['a', 'b', 'c'], 'vertical'); // span 0..350, heights 150, gap 100
    expect(pos(r, 'b').y).toBe(150);
    expect(pos(r, 'a').y).toBe(0);
    expect(pos(r, 'c').y).toBe(300);
  });
  it('needs 3+ nodes', () => {
    const nodes = [n('a', 0, 0), n('b', 500, 0)];
    expect(distributeNodes(nodes, ['a', 'b'], 'horizontal')).toEqual(nodes);
  });
});
