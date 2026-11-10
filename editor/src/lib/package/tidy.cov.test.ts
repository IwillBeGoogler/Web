import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { blankClass } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { packageNode } from './nodes';
import { nestInPackage, tidyPackages } from './tidy';

const cls = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}) => ({ ...blankClass(id, { x, y }, 'class', id), ...extra }) as DiagramNode;

describe('tidyPackages', () => {
  it('null when there are no packages', () => {
    expect(tidyPackages([], [])).toBeNull();
    expect(tidyPackages([cls('a', 0, 0)], [])).toBeNull();
  });
  it('layers dependents above, offsets by top-left, sizes containers, keeps foreign nodes', () => {
    const p1 = packageNode('p1', { x: 400, y: 300 }, 'P1'), p2 = packageNode('p2', { x: 900, y: 900 }, 'P2');
    const a = cls('a', 0, 0, { parentId: 'p1' }), b = cls('b', 0, 0, { parentId: 'p2' });
    const bare = { ...cls('c', 700, 700) } as DiagramNode;
    delete (bare as any).width; delete (bare as any).height;
    const stray = { id: 'z', type: 'note', position: { x: 1, y: 2 }, data: {} } as unknown as DiagramNode;
    const edges: DiagramEdge[] = [umlEdge('e', 'a', 'b', { kind: 'dependency' })];
    const r = tidyPackages([p1, p2, a, b, bare, stray], edges)!;
    expect(r.count).toBe(5);
    const n = (id: string) => r.nodes.find((x) => x.id === id)!;
    expect(n('p1').position.y).toBeLessThan(n('p2').position.y);
    expect(Math.min(n('p1').position.x, n('p2').position.x, n('c').position.x)).toBe(400);
    expect(Math.min(n('p1').position.y, n('p2').position.y, n('c').position.y)).toBe(300);
    expect(n('a').parentId).toBe('p1');
    expect(n('a').position.y).toBeGreaterThanOrEqual(44);
    expect(n('p1').height).toBeGreaterThan(n('a').height! + 44);
    expect(n('p1').style).toMatchObject({ width: n('p1').width, height: n('p1').height });
    expect(n('z')).toBe(stray);
  });
  it('container without style, node with parent outside model treated top-level', () => {
    const p = packageNode('p', { x: 10, y: 20 }, 'P');
    delete (p as any).style;
    const k = cls('k', 0, 0, { parentId: 'p' });
    const orphan = cls('o', 300, 300, { parentId: 'gone' });
    const r = tidyPackages([p, k, orphan], [])!;
    expect(r.nodes.find((x) => x.id === 'p')!.style).toMatchObject({ width: expect.any(Number) });
    expect(r.nodes.find((x) => x.id === 'o')!.position.x).toBeGreaterThanOrEqual(10);
  });
});

describe('nestInPackage', () => {
  it('null when nothing eligible', () => {
    expect(nestInPackage([cls('a', 0, 0)], ['x'], 'N')).toBeNull();
    expect(nestInPackage([cls('a', 0, 0, { parentId: 'q' })], ['a'], 'N')).toBeNull();
    expect(nestInPackage([{ id: 'n', type: 'note', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode], ['n'], 'N')).toBeNull();
  });
  it('wraps picks in a selected package, children relative', () => {
    const a = cls('a', 100, 100, { width: 100, height: 50, selected: true }), p = packageNode('pp', { x: 400, y: 300 }, 'PP', 200, 100);
    const bare = cls('b', 0, 0); delete (bare as any).width; delete (bare as any).height;
    const r = nestInPackage([a, p, bare, cls('c', 9, 9)], ['a', 'pp', 'b'], 'N')!;
    const box = r.find((n) => n.id === 'N')!;
    expect(box).toMatchObject({ selected: true, position: { x: -28, y: -44 } });
    expect(box.width).toBe(600 - 0 + 56);
    expect(box.height).toBe(400 + 44 + 28);
    expect(r.find((n) => n.id === 'a')).toMatchObject({ parentId: 'N', selected: false, position: { x: 128, y: 144 } });
    expect(r.find((n) => n.id === 'c')!.parentId).toBeUndefined();
    expect(r.findIndex((n) => n.id === 'N')).toBeLessThan(r.findIndex((n) => n.id === 'a'));
  });
  it('defaults 160x96 when size unset', () => {
    const b = cls('b', 0, 0); delete (b as any).width; delete (b as any).height;
    const box = nestInPackage([b], ['b'], 'N')!.find((n) => n.id === 'N')!;
    expect(box.width).toBe(160 + 56);
    expect(box.height).toBe(96 + 72);
  });
});
