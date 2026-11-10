import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { blankClass } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { diagramToPackageModel, isPackageNode, isPackageViewNode, packageModelToDiagram } from './convert';
import { layoutPackages } from './layout';
import { packageNode } from './nodes';
import type { PackageModel } from './types';

const model: PackageModel = {
  packages: [{ id: 'outer', name: 'Outer' }, { id: 'inner', name: 'Inner', parent: 'outer' }, { id: 'lost', name: 'Lost', parent: 'ghost' }],
  classes: [
    { id: 'A', name: 'A', kind: 'class', parent: 'inner', attributes: ['- id: number'], operations: ['+ run(): void'] },
    { id: 'B', name: 'B', kind: 'interface', parent: 'outer' },
    { id: 'C', name: 'C', kind: 'enum' },
  ],
  links: [
    { from: 'A', to: 'B', kind: 'dependency', label: 'uses' },
    { from: 'inner', to: 'lost', kind: 'import' },
    { from: 'inner', to: 'nope', kind: 'access' },
  ],
};

describe('packageModelToDiagram', () => {
  it('nests by depth, relative positions inside parents, member overrides, package names on classes', () => {
    const d = packageModelToDiagram(model, { x: 100, y: 200 });
    expect(d.nodes).toHaveLength(6);
    const by = (label: string) => d.nodes.find((n) => (n.data.label as string) === label)!;
    const outer = by('Outer'), inner = by('Inner'), a = by('A'), b = by('B'), c = by('C');
    expect(isPackageNode(outer)).toBe(true);
    expect(inner.parentId).toBe(outer.id);
    expect(a.parentId).toBe(inner.id);
    expect(b.parentId).toBe(outer.id);
    expect(c.parentId).toBeUndefined();
    expect(a.data.package).toBe('Inner');
    expect(b.data.package).toBe('Outer');
    expect(c.data.package).toBeUndefined();
    expect((a.data as any).attributes[0]).toMatchObject({ id: 'a0', name: 'id' });
    expect((a.data as any).operations[0]).toMatchObject({ id: 'o0', name: 'run' });
    expect(outer.position.x).toBeGreaterThanOrEqual(100);
    expect(inner.position.x).toBeLessThan(100); // relative to outer
    expect(outer.style).toMatchObject({ width: outer.width, height: outer.height });
    expect(by('Lost').parentId).toBeUndefined();
    // links: only those with both ends
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0].label).toBe('uses');
    expect(d.edges[1].label).toBe('«import»'); // default stereotype label
  });
  it('unknown parent chain does not crash depth', () => {
    const d = packageModelToDiagram({ packages: [], classes: [{ id: 'x', name: 'X', kind: 'abstract', parent: 'missing' }], links: [] });
    expect(d.nodes[0].parentId).toBeUndefined();
  });
});

describe('diagramToPackageModel', () => {
  it('reads packages/classes, filters link kinds', () => {
    const p1 = packageNode('p1', { x: 0, y: 0 }, 'P1'), p2 = { ...packageNode('p2', { x: 0, y: 0 }, 'P2'), parentId: 'p1' } as DiagramNode;
    const c1 = { ...blankClass('c1', { x: 0, y: 0 }, 'class', 'C1'), parentId: 'p1' } as DiagramNode;
    const c2 = { ...blankClass('c2', { x: 0, y: 0 }, 'enum', 'C2'), parentId: 'stranger' } as DiagramNode;
    const other = { id: 'o', type: 'note', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    const edges: DiagramEdge[] = [
      umlEdge('e1', 'p1', 'p2', { kind: 'import' }, { label: '«import»' }),
      umlEdge('e2', 'p1', 'p2', { kind: 'access' }, { label: 'custom' }),
      umlEdge('e3', 'c1', 'c2', { kind: 'dependency' }),
      umlEdge('e4', 'c1', 'p1', { kind: 'merge' }),
      umlEdge('e5', 'p1', 'o', { kind: 'dependency' }),
      umlEdge('e6', 'p1', 'p2', { kind: 'association' }),
      umlEdge('e7', 'p1', 'p2', { kind: 'merge' }, { label: 9 as unknown as string }),
      { id: 'e8', source: 'p1', target: 'p2' } as DiagramEdge,
    ];
    const m = diagramToPackageModel([p1, p2, c1, c2, other], edges);
    expect(m.packages).toEqual([{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2', parent: 'p1' }]);
    expect(m.classes).toEqual([{ id: 'c1', name: 'C1', kind: 'class', parent: 'p1' }, { id: 'c2', name: 'C2', kind: 'enum' }]);
    expect(m.links).toEqual([
      { from: 'p1', to: 'p2', kind: 'import' },
      { from: 'p1', to: 'p2', kind: 'access', label: 'custom' },
      { from: 'c1', to: 'c2', kind: 'dependency' },
      { from: 'p1', to: 'p2', kind: 'merge' },
    ]);
  });
  it('package label fallback and isPackageViewNode', () => {
    const p = packageNode('p', { x: 0, y: 0 });
    delete (p.data as any).label;
    expect(diagramToPackageModel([p], []).packages[0].name).toBe('');
    expect(isPackageViewNode(p)).toBe(true);
    expect(isPackageViewNode(blankClass('c', { x: 0, y: 0 }))).toBe(true);
    expect(isPackageViewNode({ id: 'x', type: 'note', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode)).toBe(false);
  });
});

describe('layoutPackages', () => {
  it('sizes packages around content, links between nested items count at the package level', () => {
    const items = [
      { id: 'P', w: 100, h: 50 }, { id: 'Q', w: 100, h: 50 },
      { id: 'a', parent: 'P', w: 80, h: 40 }, { id: 'b', parent: 'Q', w: 80, h: 40 }, { id: 'a2', parent: 'P', w: 80, h: 40 },
      { id: 'x', parent: 'unknown', w: 10, h: 10 },
    ];
    const out = layoutPackages(items, [['a', 'b'], ['a2', 'b'], ['a', 'a2'], ['a', 'zz'], ['zz', 'b']]);
    expect(out.get('P')!.h).toBeGreaterThan(40 + 44 + 28);
    expect(out.get('P')!.y).toBeLessThan(out.get('Q')!.y); // dependent above
    expect(out.get('a')!.y).toBeGreaterThanOrEqual(44);
    expect(out.has('x')).toBe(true);
  });
  it('empty', () => {
    expect(layoutPackages([], []).size).toBe(0);
  });
});
