import { describe, expect, it } from 'vitest';
import { groupNodes, ungroupNode, removeFromGroup } from './grouping';
import type { DiagramNode } from '../types';

const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: 100, height: 50, data: { label: id }, ...extra,
});

describe('groupNodes', () => {
  it('wraps nodes in a new group with padding, converting to relative positions', () => {
    const r = groupNodes([n('a', 100, 100), n('b', 300, 200), n('c', 900, 900)], ['a', 'b'], 'g1', 20)!;
    const g = r.nodes.find((x) => x.id === 'g1')!;
    expect(g.type).toBe('group');
    expect(g.position).toEqual({ x: 80, y: 60 }); // minX-20, minY-40 (title room)
    expect(g.width).toBe(340); // 100..400 + 2*20
    expect(r.nodes.find((x) => x.id === 'a')).toMatchObject({ parentId: 'g1', position: { x: 20, y: 40 } });
    expect(r.nodes.find((x) => x.id === 'c')!.parentId).toBeUndefined();
    expect(r.nodes.map((x) => x.id).indexOf('g1')).toBeLessThan(r.nodes.map((x) => x.id).indexOf('a'));
    expect(r.nodes.find((x) => x.id === 'g1')!.selected).toBe(true);
  });
  it('ignores locked nodes; null when nothing to group', () => {
    expect(groupNodes([n('a', 0, 0, { data: { label: 'a', locked: true } })], ['a'], 'x')).toBeNull();
  });
  it('wraps a selected group whole', () => {
    const g: DiagramNode = { id: 'grp', type: 'group', position: { x: 0, y: 0 }, width: 200, height: 100, data: { label: 'g' } };
    const r = groupNodes([g, n('a', 10, 10, { parentId: 'grp' })], ['grp', 'a'], 'x')!;
    expect(r.nodes.find((x) => x.id === 'grp')!.parentId).toBe('x');
    expect(r.nodes.find((x) => x.id === 'a')!.parentId).toBe('grp');
  });
});

describe('ungroupNode / removeFromGroup', () => {
  const nodes: DiagramNode[] = [
    { id: 'g', type: 'group', position: { x: 100, y: 100 }, width: 400, height: 300, data: { label: 'g' } },
    n('a', 10, 20, { parentId: 'g' }),
    n('b', 30, 40, { parentId: 'g' }),
  ];
  it('ungroup keeps children with absolute positions and drops group', () => {
    const r = ungroupNode(nodes, 'g');
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ position: { x: 110, y: 120 } });
    expect(r[0].parentId).toBeUndefined();
  });
  it('removeFromGroup detaches only given ids', () => {
    const r = removeFromGroup(nodes, ['a']);
    expect(r.find((x) => x.id === 'a')).toMatchObject({ position: { x: 110, y: 120 } });
    expect(r.find((x) => x.id === 'a')!.parentId).toBeUndefined();
    expect(r.find((x) => x.id === 'b')!.parentId).toBe('g');
  });
});
