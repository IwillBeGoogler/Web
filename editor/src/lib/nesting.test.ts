import { describe, expect, it } from 'vitest';
import { absolutePosition, ancestorsOf, descendantsOf, levelOf, resolveParent, sortParentsFirst, canNest, MAX_NEST_LEVEL, isContainer } from './graph';
import { reorderZ } from './zorder';
import { copySelection, pasteClipboard } from './clipboard';
import { groupNodes, ungroupNode, removeFromGroup } from './grouping';
import { alignNodes } from './arrange';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../types';

const cluster = (id: string, x: number, y: number, w = 800, h = 600, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'cluster', position: { x, y }, width: w, height: h, data: { label: id }, ...extra });
const group = (id: string, x: number, y: number, w = 300, h = 300, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'group', position: { x, y }, width: w, height: h, data: { label: id }, ...extra });
const icon = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });

// cluster C at (100,100) > shard S1 at rel (50,50) > node a at rel (20,30)
const nested = (): DiagramNode[] => [cluster('C', 100, 100), group('S1', 50, 50, 300, 300, { parentId: 'C' }), icon('a', 20, 30, { parentId: 'S1' }), icon('b', 500, 400, { parentId: 'C' })];

describe('nested containers: helpers', () => {
  it('isContainer', () => {
    expect(isContainer(cluster('c', 0, 0))).toBe(true);
    expect(isContainer(group('g', 0, 0))).toBe(true);
    expect(isContainer(icon('i', 0, 0))).toBe(false);
  });
  it('absolutePosition walks the whole chain', () => {
    const ns = nested();
    expect(absolutePosition(ns, ns[2])).toEqual({ x: 170, y: 180 });
    expect(absolutePosition(ns, ns[1])).toEqual({ x: 150, y: 150 });
    expect(absolutePosition(ns, ns[0])).toEqual({ x: 100, y: 100 });
  });
  it('ancestors, descendants and levels', () => {
    const ns = nested();
    expect(ancestorsOf(ns, 'a').map((n) => n.id)).toEqual(['S1', 'C']);
    expect(descendantsOf(ns, 'C').map((n) => n.id).sort()).toEqual(['S1', 'a', 'b']);
    expect(levelOf(ns, 'C')).toBe(1);
    expect(levelOf(ns, 'S1')).toBe(2);
    expect(MAX_NEST_LEVEL).toBe(3);
  });
  it('sortParentsFirst is a stable topological order at any depth', () => {
    const ns = nested();
    const shuffled = [ns[2], ns[3], ns[1], ns[0], icon('free', 0, 0)];
    const out = sortParentsFirst(shuffled).map((n) => n.id);
    expect(out.indexOf('C')).toBeLessThan(out.indexOf('S1'));
    expect(out.indexOf('S1')).toBeLessThan(out.indexOf('a'));
    expect(out.indexOf('C')).toBeLessThan(out.indexOf('b'));
    expect(out).toHaveLength(5);
  });
});

describe('nesting rules and depth limit', () => {
  it('clusters can contain sub-groups up to 3 levels; plain groups cannot contain groups', () => {
    const ns = [cluster('C', 0, 0), group('S', 10, 10, 200, 200, { parentId: 'C' }), group('AZ', 5, 5, 100, 100, { parentId: 'S' })];
    expect(levelOf(ns, 'AZ')).toBe(3);
    expect(canNest(ns, group('X', 0, 0), 'AZ')).toBe(false); // would be level 4
    expect(canNest(ns, group('X', 0, 0), 'S')).toBe(true); // level 3
    expect(canNest(ns, group('X', 0, 0), 'C')).toBe(true);
    expect(canNest([group('P', 0, 0)], group('X', 0, 0), 'P')).toBe(false); // plain group cannot hold a group
    expect(canNest(ns, icon('i', 0, 0), 'AZ')).toBe(true); // leaf nodes always fit
  });
  it('moving a group with its own sub-groups checks the whole subtree height', () => {
    const ns = [cluster('C', 0, 0), cluster('Outer', 2000, 0), group('S', 10, 10, 200, 200, { parentId: 'Outer' }), group('T', 5, 5, 100, 100, { parentId: 'S' })];
    // Outer(1)>S(2)>T(3): nesting Outer under C would reach level 4
    expect(canNest(ns, ns[1], 'C')).toBe(false);
  });
  it('resolveParent picks the deepest container under the node centre', () => {
    const ns = nested();
    const dropped = icon('x', 160, 170, {}); // abs centre (210,200) is inside S1 (150..450) and C
    const r = resolveParent(ns, dropped);
    expect(r.parentId).toBe('S1');
    expect(r.position).toEqual({ x: 10, y: 20 }); // relative to S1 abs (150,150)
    const outside = icon('y', 600, 500, {});
    expect(resolveParent(ns, outside).parentId).toBe('C');
    expect(resolveParent(ns, icon('z', 5000, 5000, {})).parentId).toBeUndefined();
  });
  it('resolveParent keeps absolute position when leaving a nested container', () => {
    const ns = nested();
    const a = { ...ns[2], position: { x: 2000, y: 2000 } }; // dragged far outside everything
    const r = resolveParent(ns.map((n) => (n.id === 'a' ? a : n)), a);
    expect(r.parentId).toBeUndefined();
    expect(r.position).toEqual({ x: 2150, y: 2150 });
  });
  it('a plain group never nests into another plain group', () => {
    const ns = [group('P', 0, 0, 600, 600)];
    expect(resolveParent(ns, group('Q', 100, 100, 100, 100)).parentId).toBeUndefined();
  });
});

describe('store: add / delete / select with nesting', () => {
  const s = () => useDiagramStore.getState();
  it('addNode places a leaf into the deepest container; delete cascades through the whole subtree', () => {
    s().reset();
    for (const n of [cluster('C', 100, 100), group('S1', 50, 50, 300, 300, { parentId: 'C' })]) s().addNode(n);
    s().addNode(icon('a', 170, 180)); // abs: inside S1
    expect(s().nodes.find((n) => n.id === 'a')!.parentId).toBe('S1');
    s().deleteNodes(['C']);
    expect(s().nodes).toHaveLength(0);
  });
  it('a locked descendant survives while its containers are deleted (lifted, absolute position kept)', () => {
    s().reset();
    for (const n of [cluster('C', 100, 100), group('S1', 50, 50, 300, 300, { parentId: 'C' }), icon('a', 20, 30, { parentId: 'S1', data: { label: 'a', locked: true } })]) s().addNode(n);
    expect(s().deleteNodes(['C'])).toBe(1);
    expect(s().nodes.map((n) => n.id)).toEqual(['a']);
    expect(s().nodes[0].parentId).toBeUndefined();
    expect(absolutePosition(s().nodes, s().nodes[0])).toEqual({ x: 170, y: 180 });
  });
  it('nudging a cluster moves it once (descendants follow, not double-moved)', () => {
    s().reset();
    for (const n of nested()) s().addNode({ ...n, selected: n.id === 'C' || n.id === 'a' });
    s().nudgeSelection(10, 10);
    expect(s().nodes.find((n) => n.id === 'C')!.position).toEqual({ x: 110, y: 110 });
    expect(s().nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 20, y: 30 });
  });
  it('selectChildren selects all descendants', () => {
    s().reset();
    for (const n of nested()) s().addNode(n);
    s().selectChildren('C');
    expect(s().nodes.filter((n) => n.selected).map((n) => n.id).sort()).toEqual(['S1', 'a', 'b']);
  });
});

describe('z-order, clipboard, grouping, align with nesting', () => {
  it('reorderZ keeps subtrees contiguous at any depth', () => {
    const ns = [cluster('C', 0, 0), group('S1', 5, 5, 100, 100, { parentId: 'C' }), icon('a', 1, 1, { parentId: 'S1' }), icon('b', 1, 1, { parentId: 'C' }), icon('x', 900, 0)];
    expect(reorderZ(ns, ['C'], 'front').map((n) => n.id)).toEqual(['x', 'C', 'S1', 'a', 'b']);
    expect(reorderZ(ns, ['S1'], 'front').map((n) => n.id)).toEqual(['C', 'b', 'S1', 'a', 'x']);
    expect(reorderZ(ns, ['a'], 'back').map((n) => n.id)).toEqual(['C', 'S1', 'a', 'b', 'x']);
  });
  it('copy/paste a cluster copies the full subtree with remapped parents', () => {
    const ns = nested().map((n) => (n.id === 'C' ? { ...n, selected: true } : n));
    const clip = copySelection(ns, [])!;
    expect(clip.nodes.map((n) => n.id).sort()).toEqual(['C', 'S1', 'a', 'b']);
    const out = pasteClipboard(clip, { x: 20, y: 20 });
    const byLabel = (l: string) => out.nodes.find((n) => n.data.label === l)!;
    expect(byLabel('S1').parentId).toBe(byLabel('C').id);
    expect(byLabel('a').parentId).toBe(byLabel('S1').id);
    expect(byLabel('C').position).toEqual({ x: 120, y: 120 });
    expect(byLabel('a').position).toEqual({ x: 20, y: 30 });
    const ids = out.nodes.map((n) => n.id);
    expect(out.nodes.findIndex((n) => n.id === byLabel('C').id)).toBeLessThan(ids.indexOf(byLabel('a').id));
  });
  it('copying a nested leaf alone detaches it with its absolute position', () => {
    const ns = nested().map((n) => (n.id === 'a' ? { ...n, selected: true } : n));
    const clip = copySelection(ns, [])!;
    expect(clip.nodes[0].parentId).toBeUndefined();
    expect(clip.nodes[0].position).toEqual({ x: 170, y: 180 });
  });
  it('ungroup lifts children to the dissolved group parent, keeping absolute positions', () => {
    const out = ungroupNode(nested(), 'S1');
    const a = out.find((n) => n.id === 'a')!;
    expect(a.parentId).toBe('C');
    expect(absolutePosition(out, a)).toEqual({ x: 170, y: 180 });
    expect(out.some((n) => n.id === 'S1')).toBe(false);
  });
  it('removeFromGroup moves up one level', () => {
    const out = removeFromGroup(nested(), ['a']);
    const a = out.find((n) => n.id === 'a')!;
    expect(a.parentId).toBe('C');
    expect(absolutePosition(out, a)).toEqual({ x: 170, y: 180 });
  });
  it('grouping nodes that share a parent creates the group inside that parent', () => {
    const ns = [cluster('C', 100, 100), icon('p', 20, 40, { parentId: 'C' }), icon('q', 220, 40, { parentId: 'C' })];
    const r = groupNodes(ns, ['p', 'q'], 'G', 10, 20, 'group')!;
    const g = r.nodes.find((n) => n.id === 'G')!;
    expect(g.parentId).toBe('C');
    expect(absolutePosition(r.nodes, r.nodes.find((n) => n.id === 'p')!)).toEqual({ x: 120, y: 140 });
  });
  it('align uses absolute coordinates through nested parents', () => {
    const ns = nested();
    const out = alignNodes(ns, ['a', 'b'], 'left'); // a abs x 170, b abs x 600 -> both 170
    expect(absolutePosition(out, out.find((n) => n.id === 'b')!).x).toBe(170);
    expect(absolutePosition(out, out.find((n) => n.id === 'a')!).x).toBe(170);
  });
});
