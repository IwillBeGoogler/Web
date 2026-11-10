import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge, umlOf } from '../uml/edges';
import { componentNode } from '../uml2/nodes';
import type { ComponentData } from '../uml2/types';
import { componentModelToDiagram, diagramToComponentModel, isCompNode, isInterfaceNode } from './convert';
import type { ComponentModel } from './types';

const node = (id: string, kind: 'component' | 'node' | 'artifact' | 'provided' | 'required', label: string, extra: Partial<ComponentData> = {}, rest: Partial<DiagramNode> = {}): DiagramNode => {
  const n = componentNode(id, { x: 0, y: 0 }, kind, label);
  return { ...n, ...rest, data: { ...n.data, ...extra } } as DiagramNode;
};

describe('isInterfaceNode / isCompNode', () => {
  it('classify nodes', () => {
    expect(isInterfaceNode(undefined)).toBe(false);
    expect(isInterfaceNode(node('a', 'provided', 'I'))).toBe(true);
    expect(isInterfaceNode(node('a', 'required', 'I'))).toBe(true);
    expect(isInterfaceNode(node('a', 'component', 'I'))).toBe(false);
    expect(isCompNode(node('a', 'node', 'N'))).toBe(true);
    expect(isCompNode(node('a', 'provided', 'I'))).toBe(false);
    expect(isCompNode(undefined)).toBe(false);
    expect(isCompNode({ ...node('a', 'node', 'N'), type: 'class' } as DiagramNode)).toBe(false);
  });
});

describe('componentModelToDiagram', () => {
  it('lays out nested containers, ports, stereotypes, links and implied interface edges', () => {
    const model: ComponentModel = {
      comps: [
        { id: 'k', name: 'Kid', kind: 'component', parent: 'p', provides: ['IA'], requires: [], stereotype: 'svc' },
        { id: 'p', name: 'Parent', kind: 'node', provides: [], requires: [] },
        { id: 'c', name: 'Client', kind: 'component', provides: [], requires: ['IA', 'IMissing'] },
        { id: 'o', name: 'Orphan', kind: 'component', parent: 'gone', provides: [], requires: [] },
      ],
      links: [
        { from: 'c', to: 'p', kind: 'dependency', label: 'uses' },
        { from: 'c', to: 'nope', kind: 'dependency' },
      ],
    };
    const d = componentModelToDiagram(model, { x: 100, y: 200 });
    const ids = Object.fromEntries(d.nodes.map((n) => [(n.data as unknown as ComponentData).label, n]));
    expect(d.nodes).toHaveLength(4);
    // parents sorted before children
    expect(d.nodes.findIndex((n) => n.id === ids.Parent.id)).toBeLessThan(d.nodes.findIndex((n) => n.id === ids.Kid.id));
    expect(ids.Kid.parentId).toBe(ids.Parent.id);
    expect(ids.Orphan.parentId).toBeUndefined();
    expect((ids.Parent.data as unknown as ComponentData).container).toBe(true);
    expect(ids.Parent.width).toBeGreaterThan(0);
    expect(ids.Parent.style).toMatchObject({ width: ids.Parent.width, height: ids.Parent.height });
    expect((ids.Kid.data as unknown as ComponentData).stereotype).toBe('svc');
    expect((ids.Kid.data as unknown as ComponentData).ports!.map((p) => p.name)).toEqual(['IA']);
    expect((ids.Client.data as unknown as ComponentData).container).toBeUndefined();
    expect(ids.Client.position.x).toBeGreaterThanOrEqual(100);
    expect(ids.Kid.position.x).toBeLessThan(100 + 1000);
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0].label).toBe('uses');
    const asm = d.edges[1];
    expect(umlOf(asm)).toMatchObject({ kind: 'assembly', sourcePort: expect.any(String), targetPort: expect.any(String) });
    expect(asm.source).toBe(ids.Client.id);
    expect(asm.target).toBe(ids.Kid.id);
  });
  it('handles cyclic/self parent gracefully and empty model', () => {
    const d = componentModelToDiagram({ comps: [{ id: 'x', name: 'X', kind: 'component', parent: 'missing', provides: [], requires: [] }], links: [] });
    expect(d.nodes).toHaveLength(1);
    expect(componentModelToDiagram({ comps: [], links: [] })).toEqual({ version: 1, nodes: [], edges: [] });
  });
});

describe('diagramToComponentModel', () => {
  it('round trips a generated diagram', () => {
    const model: ComponentModel = {
      comps: [
        { id: 'p', name: 'Parent', kind: 'node', provides: [], requires: [] },
        { id: 'k', name: 'Kid', kind: 'component', parent: 'p', provides: ['IA'], requires: [], stereotype: 's' },
        { id: 'c', name: 'Client', kind: 'component', provides: [], requires: ['IA'] },
      ],
      links: [{ from: 'c', to: 'k', kind: 'dependency', label: 'x' }],
    };
    const d = componentModelToDiagram(model);
    const back = diagramToComponentModel(d.nodes, d.edges);
    expect(back.comps.map((c) => [c.name, c.kind, c.provides, c.requires, c.stereotype, !!c.parent])).toEqual([
      ['Parent', 'node', [], [], undefined, false],
      ['Client', 'component', [], ['IA'], undefined, false],
      ['Kid', 'component', ['IA'], [], 's', true],
    ]);
    // implied port assembly is dropped; explicit dependency kept with label
    expect(back.links).toHaveLength(1);
    expect(back.links[0]).toMatchObject({ kind: 'dependency', label: 'x' });
  });
  it('keeps assembly edges whose ports do not pair, ignores non component edges, and reads old-style lollipop nodes', () => {
    const a = node('a', 'component', 'A', { ports: [{ id: 'p1', name: 'I', kind: 'required', side: 'right' }, { id: 'p2', name: 'J', kind: 'provided', side: 'left' }] });
    const b = node('b', 'component', 'B', { ports: [{ id: 'q1', name: 'I', kind: 'provided', side: 'left' }] }, { parentId: 'zzz' });
    const lolli = node('l', 'provided', 'IOld');
    const sock = node('s', 'required', 'IReq');
    const e = (id: string, s: string, t: string, uml: object, extra: Partial<DiagramEdge> = {}) => umlEdge(id, s, t, uml as never, extra);
    const edges: DiagramEdge[] = [
      e('e1', 'a', 'b', { kind: 'assembly', sourcePort: 'p2', targetPort: 'q1' }),
      e('e2', 'a', 'b', { kind: 'assembly', sourcePort: 'p1', targetPort: 'q1' }), // implied -> dropped
      e('e3', 'a', 'b', { kind: 'association' }), // not dependency/assembly
      { id: 'e4', source: 'a', target: 'b' } as DiagramEdge, // no uml
      e('e5', 'a', 'l', { kind: 'dependency' }),
      e('e6', 'a', 'l', { kind: 'dependency' }), // duplicate -> not repeated
      e('e7', 's', 'b', { kind: 'dependency' }),
      e('e8', 'l', 's', { kind: 'dependency' }), // neither is comp
      e('e9', 'a', 'ghost', { kind: 'dependency' }),
    ];
    const m = diagramToComponentModel([a, b, lolli, sock], edges);
    expect(m.links).toEqual([{ from: 'a', to: 'b', kind: 'assembly' }]);
    expect(m.comps.find((c) => c.id === 'a')!.provides).toEqual(['J', 'IOld']);
    expect(m.comps.find((c) => c.id === 'b')!.requires).toEqual(['IReq']);
    expect(m.comps.find((c) => c.id === 'b')!.parent).toBeUndefined();
  });
  it('ignores non-string/empty edge labels', () => {
    const a = node('a', 'component', 'A'), b = node('b', 'component', 'B');
    const m = diagramToComponentModel([a, b], [umlEdge('e', 'a', 'b', { kind: 'dependency' }, { label: '' })]);
    expect(m.links[0].label).toBeUndefined();
  });
});
