import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { diagramToUseCaseModel, isBoundaryNode, isUseCaseLike, isUseCaseNode, useCaseModelToDiagram } from './convert';
import { tidyUseCase } from './tidy';

const plain = (id: string): DiagramNode => ({ id, type: 'box', position: { x: 5, y: 6 }, data: { label: id } } as unknown as DiagramNode);

describe('usecase node predicates', () => {
  it('classify', () => {
    const d = useCaseModelToDiagram({ actors: [{ id: 'a', name: 'A' }], cases: [{ id: 'c', name: 'C', boundary: 'b' }], boundaries: [{ id: 'b', name: 'B' }], relations: [] });
    expect(d.nodes.filter(isBoundaryNode)).toHaveLength(1);
    expect(d.nodes.filter(isUseCaseNode)).toHaveLength(2);
    expect(d.nodes.filter(isUseCaseLike)).toHaveLength(3);
    expect(isBoundaryNode(undefined)).toBe(false);
    expect(isUseCaseLike(plain('x'))).toBe(false);
  });
});

describe('useCaseModelToDiagram', () => {
  it('applies origin, skips empty boundary, ignores dangling relations, keeps loose cases absolute', () => {
    const d = useCaseModelToDiagram({
      actors: [{ id: 'a', name: 'A' }],
      boundaries: [{ id: 'b', name: 'B' }, { id: 'empty', name: 'E' }],
      cases: [{ id: 'c', name: 'C', boundary: 'b' }, { id: 'l', name: 'Loose', boundary: 'ghost' }],
      relations: [
        { from: 'a', to: 'c', kind: 'association', label: 'x', fromMult: '1', toMult: '*' },
        { from: 'a', to: 'nope', kind: 'association' },
      ],
    }, { x: 100, y: 200 });
    expect(d.nodes.filter(isBoundaryNode)).toHaveLength(1);
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0].label).toBe('x');
    const loose = d.nodes.find((n) => n.data.label === 'Loose')!;
    expect(loose.parentId).toBeUndefined();
    expect(loose.position.x).toBeGreaterThanOrEqual(100);
    const child = d.nodes.find((n) => n.data.label === 'C')!;
    expect(child.parentId).toBeDefined();
  });
});

describe('diagramToUseCaseModel', () => {
  it('defaults boundary label, drops non-uc edges, hides stereotype labels, ignores foreign parent', () => {
    const d = useCaseModelToDiagram({
      actors: [{ id: 'a', name: 'A' }],
      boundaries: [{ id: 'b', name: 'B' }],
      cases: [{ id: 'c1', name: 'C1', boundary: 'b' }, { id: 'c2', name: 'C2' }],
      relations: [{ from: 'c1', to: 'c2', kind: 'include' }],
    });
    const nodes = d.nodes.map((n) => (isBoundaryNode(n) ? { ...n, data: { ...n.data, label: undefined } } : n)) as DiagramNode[];
    const c2 = nodes.find((n) => n.data.label === 'C2')!;
    c2.parentId = 'something-else';
    const inc = d.edges[0];
    const edges: DiagramEdge[] = [
      { ...inc, label: '«include»' },
      umlEdge('e2', 'uc1', 'uc2', { kind: 'association' }, { label: 'real' }),
      { id: 'e3', source: 'uc1', target: 'uc2', data: {} } as unknown as DiagramEdge,
      umlEdge('e4', 'uc1', 'zzz', { kind: 'association' }),
      umlEdge('e5', 'uc1', 'uc2', { kind: 'composition' } as never),
    ];
    const model = diagramToUseCaseModel(nodes, edges);
    expect(model.boundaries[0].name).toBe('System');
    expect(model.cases.find((c) => c.name === 'C2')!.boundary).toBeUndefined();
    expect(model.cases.find((c) => c.name === 'C1')!.boundary).toBe(model.boundaries[0].id);
    expect(model.relations).toHaveLength(2);
    expect(model.relations[0].label).toBeUndefined();
    expect(model.relations[1]).toMatchObject({ kind: 'association', label: 'real' });
  });
});

describe('tidyUseCase edge cases', () => {
  it('leaves non-usecase nodes and empty boundaries untouched, honours page offset', () => {
    const d = useCaseModelToDiagram({
      actors: [{ id: 'a', name: 'A' }],
      boundaries: [{ id: 'b', name: 'B' }],
      cases: [{ id: 'c', name: 'C', boundary: 'b' }],
      relations: [],
    }, { x: 300, y: 400 });
    const emptyB = { ...d.nodes.find(isBoundaryNode)!, id: 'emptyB' };
    const other = plain('foreign');
    const r = tidyUseCase([...d.nodes, emptyB, other], d.edges)!;
    expect(r.count).toBe(2);
    expect(r.nodes.find((n) => n.id === 'foreign')).toBe(other);
    expect(r.nodes.find((n) => n.id === 'emptyB')!.position).toEqual(emptyB.position);
    const sys = r.nodes.find((n) => n.id === 'sys1')!;
    expect(sys.position.x).toBeGreaterThanOrEqual(300);
    expect(sys.position.y).toBeGreaterThanOrEqual(400);
    expect(sys.style).toMatchObject({ width: sys.width, height: sys.height });
  });

  it('boundary without style gets one; degenerate parent cycle falls back to origin 0', () => {
    const d = useCaseModelToDiagram({
      actors: [],
      boundaries: [{ id: 'b', name: 'B' }],
      cases: [{ id: 'c', name: 'C', boundary: 'b' }],
      relations: [],
    });
    const b1 = { ...d.nodes.find(isBoundaryNode)!, style: undefined, parentId: 'sys2', position: { x: 50, y: 60 } } as DiagramNode;
    const b2 = { ...b1, id: 'sys2', parentId: 'sys1' } as DiagramNode;
    const c = d.nodes.find(isUseCaseNode)!;
    const r = tidyUseCase([b1, b2, c], [])!;
    const out = r.nodes.find((n) => n.id === 'sys1')!;
    expect(out.style).toEqual({ width: out.width, height: out.height });
    expect(out.position).toEqual({ x: 0, y: 0 });
  });
});
