import { describe, expect, it } from 'vitest';
import { deleteElements } from './deletion';
import { absolutePosition } from './graph';
import { collapseCluster } from '../clusters/collapse';
import type { DiagramEdge, DiagramNode } from '../types';

const group = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'group', position: { x, y }, width: 400, height: 300, data: { label: id }, ...extra });
const icon = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });
const edge = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra });
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe('deleteElements', () => {
  it('removes nodes, their descendants and touching edges', () => {
    const r = deleteElements([group('g', 100, 100), icon('a', 10, 10, { parentId: 'g' }), icon('b', 600, 0)], [edge('e', 'a', 'b'), edge('f', 'b', 'b2')], ['g'], []);
    expect(ids(r.nodes)).toEqual(['b']);
    expect(ids(r.edges)).toEqual(['f']);
    expect(r.kept).toEqual([]);
  });
  it('locked nodes survive; their deleted container is dissolved and they keep their absolute position', () => {
    const nodes = [group('g', 100, 100), icon('a', 10, 20, { parentId: 'g', data: { label: 'a', locked: true } }), icon('b', 50, 50, { parentId: 'g' })];
    const r = deleteElements(nodes, [], ['g'], []);
    expect(ids(r.nodes)).toEqual(['a']);
    expect(r.kept).toEqual(['a']);
    expect(r.nodes[0].parentId).toBeUndefined();
    expect(absolutePosition(r.nodes, r.nodes[0])).toEqual({ x: 110, y: 120 });
  });
  it('a locked node deleted directly is kept; a locked edge is kept', () => {
    const r = deleteElements([icon('a', 0, 0, { data: { label: 'a', locked: true } }), icon('b', 200, 0)], [edge('e', 'a', 'b', { data: { locked: true } })], ['a'], ['e']);
    expect(ids(r.nodes)).toEqual(['a', 'b']);
    expect(ids(r.edges)).toEqual(['e']);
  });
  it('locked grandchildren are lifted to the nearest surviving ancestor', () => {
    const nodes = [
      { ...group('C', 0, 0), type: 'cluster' as const },
      group('S', 20, 20, { parentId: 'C' }),
      icon('a', 5, 5, { parentId: 'S', data: { label: 'a', locked: true } }),
    ];
    const r = deleteElements(nodes, [], ['S'], []);
    expect(ids(r.nodes)).toEqual(['C', 'a']);
    expect(r.nodes.find((n) => n.id === 'a')!.parentId).toBe('C');
    expect(absolutePosition(r.nodes, r.nodes[1])).toEqual({ x: 25, y: 25 });
  });
  it('deleting a merged (collapsed-cluster) edge deletes every underlying edge', () => {
    const nodes = collapseCluster([{ ...group('C'), type: 'cluster' as const }, icon('m1', 10, 50, { parentId: 'C' }), icon('m2', 150, 50, { parentId: 'C' }), icon('app', 900, 0)], 'C');
    const edges = [edge('e1', 'app', 'm1', { label: 'writes' }), edge('e2', 'app', 'm2', { label: 'writes' }), edge('other', 'app', 'app2', { label: 'x' })];
    const r = deleteElements(nodes, edges, [], ['e1']); // e1 is the id of the merged display edge
    expect(ids(r.edges)).toEqual(['other']);
  });
});
