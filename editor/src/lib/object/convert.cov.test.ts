import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { diagramToObjectModel, isObjectNode, layoutObjects, objectModelToDiagram, tidyObjects } from './convert';
import { objectNode } from './nodes';

describe('objectModelToDiagram', () => {
  it('builds nodes, slots, links with roles/labels/messages, skips dangling, widens for messages', () => {
    const model = {
      objects: [{ id: 'a', name: 'a', className: 'K', slots: [{ name: 'x', value: '1' }] }, { id: 'b', name: 'b', slots: [] }],
      links: [
        { from: 'a', to: 'b', label: 'owns', srcRole: 's', dstRole: 'd' },
        { from: 'a', to: 'zz' },
        { from: 'b', to: 'a', messages: [{ id: '', seq: '1', text: 'go', dir: 'fwd' as const }, { id: 'keep', seq: '2', text: 'x', dir: 'back' as const }], label: 'ignored' },
      ],
    };
    const d = objectModelToDiagram(model, { x: 10, y: 20 });
    expect(d.nodes).toHaveLength(2);
    expect(d.nodes[0].data).toMatchObject({ label: 'a', className: 'K', slots: [{ id: 's0', name: 'x', value: '1' }] });
    expect(d.nodes[1].data).not.toHaveProperty('className');
    expect(d.nodes.every((n) => n.position.x >= 10 && n.position.y >= 20)).toBe(true);
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0].label).toBe('owns');
    expect((d.edges[0].data as any).uml).toMatchObject({ kind: 'link', sourceRole: 's', targetRole: 'd' });
    const msgs = (d.edges[1].data as any).uml.messages;
    expect(msgs.map((m: any) => m.id)).toEqual(['m2_1', 'keep']);
    expect(d.edges[1].label).toBe('1: go →\n2: x ←');
    // wider spacing with messages
    const plain = objectModelToDiagram({ ...model, links: [model.links[0]] });
    const gap = (dd: typeof d) => Math.abs(dd.nodes[1].position.x - dd.nodes[0].position.x);
    expect(gap(d)).toBeGreaterThan(gap(plain));
  });
  it('edge without label: none', () => {
    const d = objectModelToDiagram({ objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [] }], links: [{ from: 'a', to: 'b' }] });
    expect(d.edges[0].label).toBeUndefined();
    expect(d.edges[0].data!.uml).toEqual({ kind: 'link' });
  });
  it('layoutObjects returns positions for all items', () => {
    const p = layoutObjects([{ id: 'a', w: 100, h: 40 }, { id: 'b', w: 100, h: 40 }], [['a', 'b']]);
    expect(p.get('b')!.x).toBeGreaterThan(p.get('a')!.x);
    const wide = layoutObjects([{ id: 'a', w: 100, h: 40 }, { id: 'b', w: 100, h: 40 }], [['a', 'b']], 300);
    expect(wide.get('b')!.x - wide.get('a')!.x).toBeGreaterThan(p.get('b')!.x - p.get('a')!.x);
  });
});

describe('diagramToObjectModel', () => {
  it('reads objects and links, ignores others', () => {
    const a = objectNode('a', { x: 0, y: 0 }, 'a', { className: 'K', slots: [{ id: 's', name: 'x', value: '1' }] });
    const b = objectNode('b', { x: 0, y: 0 }, 'b');
    delete (b.data as any).slots;
    const cls = { id: 'c', type: 'class', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    const edges: DiagramEdge[] = [
      umlEdge('e1', 'a', 'b', { kind: 'link', sourceRole: 's', targetRole: 't' }, { label: 'owns' }),
      umlEdge('e2', 'b', 'a', { kind: 'link', messages: [{ id: 'm', seq: '1', text: 'x', dir: 'fwd' }] }, { label: 'dropped' }),
      umlEdge('e3', 'a', 'b', { kind: 'link' }, { label: 5 as unknown as string }),
      umlEdge('e4', 'a', 'b', { kind: 'association' }),
      umlEdge('e5', 'a', 'c', { kind: 'link' }),
      { id: 'e6', source: 'a', target: 'b' } as DiagramEdge,
    ];
    const m = diagramToObjectModel([a, b, cls], edges);
    expect(m.objects).toEqual([{ id: 'a', name: 'a', className: 'K', slots: [{ name: 'x', value: '1' }] }, { id: 'b', name: 'b', slots: [] }]);
    expect(m.links).toEqual([
      { from: 'a', to: 'b', label: 'owns', srcRole: 's', dstRole: 't' },
      { from: 'b', to: 'a', messages: [{ id: 'm', seq: '1', text: 'x', dir: 'fwd' }] },
      { from: 'a', to: 'b' },
    ]);
    expect(isObjectNode(a)).toBe(true);
  });
});

describe('tidyObjects', () => {
  it('null when no top-level objects', () => {
    expect(tidyObjects([], [])).toBeNull();
    expect(tidyObjects([{ ...objectNode('a', { x: 0, y: 0 }), parentId: 'g' } as DiagramNode], [])).toBeNull();
  });
  it('lays out from the top-left, keeps others; uses own size or computed', () => {
    const a = objectNode('a', { x: 500, y: 300 }), b = { ...objectNode('b', { x: 900, y: 700 }), width: 222, height: 66 } as DiagramNode;
    const noSize = { ...objectNode('c', { x: 600, y: 400 }) } as DiagramNode;
    delete (noSize as any).width; delete (noSize as any).height;
    const other = { id: 'z', type: 'class', position: { x: 1, y: 2 }, data: {} } as unknown as DiagramNode;
    const r = tidyObjects([a, b, noSize, other], [umlEdge('e', 'a', 'b', { kind: 'link' }), umlEdge('f', 'a', 'z', { kind: 'link' }), umlEdge('g', 'a', 'b', { kind: 'association' })])!;
    expect(r.count).toBe(3);
    const xs = ['a', 'b', 'c'].map((id) => r.nodes.find((n) => n.id === id)!.position);
    expect(Math.min(...xs.map((p) => p.x))).toBe(500);
    expect(Math.min(...xs.map((p) => p.y))).toBe(300);
    expect(r.nodes.find((n) => n.id === 'z')).toBe(other);
    expect(r.nodes.find((n) => n.id === 'b')!.position.x).toBeGreaterThan(r.nodes.find((n) => n.id === 'a')!.position.x);
  });
  it('messages widen spacing', () => {
    const mk = (msg: boolean) => tidyObjects([objectNode('a', { x: 0, y: 0 }), objectNode('b', { x: 0, y: 0 })], [umlEdge('e', 'a', 'b', { kind: 'link', ...(msg ? { messages: [{ id: 'm', seq: '1', text: 'x', dir: 'fwd' as const }] } : {}) })])!.nodes;
    const gap = (ns: DiagramNode[]) => Math.abs(ns[1].position.x - ns[0].position.x);
    expect(gap(mk(true))).toBeGreaterThan(gap(mk(false)));
  });
});
