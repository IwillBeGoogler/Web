import { describe, expect, it } from 'vitest';
import { searchClasses } from './search';
import { blankClass } from './geometry';
import { setMemberText } from './edit';
import { classOf } from './geometry';
import type { DiagramNode } from '../../types';

const nodes = (): DiagramNode[] => {
  const a = blankClass('a', { x: 0, y: 0 }, 'class', 'AccountService');
  const d = setMemberText(classOf(a), 'operations', 'o0', '+ deposit(amount: number): void');
  const b = blankClass('b', { x: 0, y: 0 }, 'interface', 'Repository');
  return [{ ...a, data: d as never }, b, { id: 't', type: 'text', position: { x: 0, y: 0 }, data: { label: 'AccountService notes' } } as DiagramNode];
};

describe('class / member search', () => {
  it('finds a class by name', () => {
    const r = searchClasses(nodes(), 'Account');
    expect(r[0]).toMatchObject({ nodeId: 'a', kind: 'class', title: 'AccountService' });
    expect(r.every((h) => h.nodeId !== 't')).toBe(true);
  });
  it('finds members, with their class in the title', () => {
    const r = searchClasses(nodes(), 'deposit');
    expect(r[0]).toMatchObject({ nodeId: 'a', kind: 'member', title: 'AccountService.deposit' });
    expect(r[0].detail).toContain('deposit(amount: number): void');
  });
  it('matches Class.member style queries and ignores short queries', () => {
    expect(searchClasses(nodes(), 'AccountService.dep')[0].kind).toBe('member');
    expect(searchClasses(nodes(), 'a')).toEqual([]);
  });
  it('limits and orders by score', () => {
    expect(searchClasses(nodes(), 'er', 1).length).toBe(1);
  });
});
