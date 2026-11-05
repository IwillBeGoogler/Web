import { describe, expect, it } from 'vitest';
import { nearestInDirection, focusOrder } from './nav';
import type { DiagramNode } from '../../types';

const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });
// a 3x2 grid:  a b c / d e f
const grid = [n('a', 0, 0), n('b', 200, 0), n('c', 400, 0), n('d', 0, 150), n('e', 200, 150), n('f', 400, 150)];

describe('nearestInDirection', () => {
  it('moves to the neighbour in that direction', () => {
    expect(nearestInDirection(grid, 'a', 'right')).toBe('b');
    expect(nearestInDirection(grid, 'e', 'left')).toBe('d');
    expect(nearestInDirection(grid, 'b', 'down')).toBe('e');
    expect(nearestInDirection(grid, 'f', 'up')).toBe('c');
  });
  it('returns null at the edge', () => {
    expect(nearestInDirection(grid, 'a', 'left')).toBeNull();
    expect(nearestInDirection(grid, 'a', 'up')).toBeNull();
    expect(nearestInDirection(grid, 'c', 'right')).toBeNull();
  });
  it('prefers the node on the same row over a closer diagonal one', () => {
    const nodes = [n('src', 0, 0), n('near-diag', 120, 140), n('far-row', 500, 0)];
    expect(nearestInDirection(nodes, 'src', 'right')).toBe('far-row');
  });
  it('skips hidden nodes and the unknown source', () => {
    const nodes = [n('a', 0, 0), n('h', 200, 0, { hidden: true }), n('c', 400, 0)];
    expect(nearestInDirection(nodes, 'a', 'right')).toBe('c');
    expect(nearestInDirection(nodes, 'zzz', 'right')).toBeNull();
  });
  it('uses absolute positions of nested nodes', () => {
    const nodes = [n('g', 0, 0, { type: 'group', width: 600, height: 300 }), n('in1', 20, 40, { parentId: 'g' }), n('in2', 300, 40, { parentId: 'g' })];
    expect(nearestInDirection(nodes, 'in1', 'right')).toBe('in2');
  });
});

describe('focusOrder', () => {
  it('reading order: top to bottom, left to right, groups before their content', () => {
    expect(focusOrder(grid).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
