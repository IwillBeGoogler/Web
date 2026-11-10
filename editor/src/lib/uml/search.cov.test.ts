import { describe, expect, it } from 'vitest';
import { searchClasses } from './search';
import { blankClass, classOf } from './geometry';
import type { DiagramNode } from '../../types';

describe('searchClasses branches', () => {
  it('short query returns nothing', () => expect(searchClasses([blankClass('a', { x: 0, y: 0 })], ' a ')).toEqual([]));
  it('shows generics in detail and respects limit', () => {
    const a = blankClass('a', { x: 0, y: 0 }, 'class', 'Repo');
    const n = { ...a, data: { ...classOf(a), generics: 'T' } as never } as DiagramNode;
    const hits = searchClasses([n], 'Repo');
    expect(hits[0].detail).toContain('Repo<T>');
    expect(searchClasses([n], 'Repo', 1)).toHaveLength(1);
  });
  it('ties sort by title; unmatched class yields nothing', () => {
    const x = blankClass('x', { x: 0, y: 0 }, 'class', 'Zeta');
    const y = blankClass('y', { x: 0, y: 0 }, 'class', 'Zeta2');
    const hits = searchClasses([y, x], 'Zeta');
    expect(hits.map((h) => h.nodeId).includes('x')).toBe(true);
    expect(searchClasses([x], 'qqqqq')).toEqual([]);
  });
  it('matches members by Class.member', () => {
    const a = blankClass('a', { x: 0, y: 0 }, 'class', 'Order');
    const hits = searchClasses([a], 'Order.attr');
    expect(hits.some((h) => h.kind === 'member')).toBe(true);
  });
});
