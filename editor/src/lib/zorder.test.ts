import { describe, expect, it } from 'vitest';
import { reorderZ } from './zorder';
import type { DiagramNode } from '../types';

const n = (id: string, parentId?: string, type: DiagramNode['type'] = 'icon'): DiagramNode => ({
  id, type, position: { x: 0, y: 0 }, data: { label: id }, ...(parentId ? { parentId } : {}),
});
const ids = (l: DiagramNode[]) => l.map((x) => x.id);

describe('reorderZ', () => {
  const base = [n('g', undefined, 'group'), n('a', 'g'), n('b', 'g'), n('x'), n('y')];
  it('bring to front moves root to end', () => {
    expect(ids(reorderZ(base, ['x'], 'front'))).toEqual(['g', 'a', 'b', 'y', 'x']);
  });
  it('send to back moves root to start', () => {
    expect(ids(reorderZ(base, ['y'], 'back'))).toEqual(['y', 'g', 'a', 'b', 'x']);
  });
  it('moving a group carries its children', () => {
    expect(ids(reorderZ(base, ['g'], 'front'))).toEqual(['x', 'y', 'g', 'a', 'b']);
  });
  it('children reorder within their parent only', () => {
    expect(ids(reorderZ(base, ['a'], 'front'))).toEqual(['g', 'b', 'a', 'x', 'y']);
    expect(ids(reorderZ(base, ['b'], 'back'))).toEqual(['g', 'b', 'a', 'x', 'y']);
  });
  it('multiple selection keeps relative order', () => {
    expect(ids(reorderZ([n('p'), n('q'), n('r'), n('s')], ['p', 'r'], 'front'))).toEqual(['q', 's', 'p', 'r']);
  });
  it('noop for unknown ids', () => {
    expect(ids(reorderZ(base, ['zzz'], 'front'))).toEqual(ids(base));
  });
});

describe('reorderZ one step', () => {
  const base = [n('g', undefined, 'group'), n('a', 'g'), n('b', 'g'), n('x'), n('y'), n('z')];
  it('forward swaps with next sibling', () => {
    expect(ids(reorderZ(base, ['x'], 'forward'))).toEqual(['g', 'a', 'b', 'y', 'x', 'z']);
    expect(ids(reorderZ(base, ['z'], 'forward'))).toEqual(ids(base));
  });
  it('backward swaps with previous sibling', () => {
    expect(ids(reorderZ(base, ['y'], 'backward'))).toEqual(['g', 'a', 'b', 'y', 'x', 'z']);
    expect(ids(reorderZ(base, ['g'], 'backward'))).toEqual(ids(base));
  });
  it('forward on group carries children', () => {
    expect(ids(reorderZ(base, ['g'], 'forward'))).toEqual(['x', 'g', 'a', 'b', 'y', 'z']);
  });
});
