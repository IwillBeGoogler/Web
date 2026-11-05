import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from './diagramStore';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const icon = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  type: 'icon',
  position: { x, y },
  data: { label: id, iconId: 'service' },
  ...extra,
});
const group = (id: string, x = 0, y = 0, w = 300, h = 200): DiagramNode => ({
  id,
  type: 'group',
  position: { x, y },
  width: w,
  height: h,
  style: { width: w, height: h },
  data: { label: id },
});

beforeEach(() => s().reset());

describe('nodes', () => {
  it('adds a node', () => {
    s().addNode(icon('a'));
    expect(s().nodes.map((n) => n.id)).toEqual(['a']);
  });
  it('updates node data', () => {
    s().addNode(icon('a'));
    s().updateNodeData('a', { label: 'Prometheus', subtitle: ':9090' });
    expect(s().nodes[0].data).toMatchObject({ label: 'Prometheus', subtitle: ':9090', iconId: 'service' });
  });
  it('deletes node and its edges', () => {
    s().addNode(icon('a'));
    s().addNode(icon('b'));
    s().addEdge({ source: 'a', target: 'b' });
    s().deleteNodes(['a']);
    expect(s().nodes.map((n) => n.id)).toEqual(['b']);
    expect(s().edges).toHaveLength(0);
  });
});

describe('groups', () => {
  it('adds group and nests node dropped inside with relative position', () => {
    s().addNode(group('g', 100, 100));
    s().addNode(icon('a', 150, 160));
    const a = s().nodes.find((n) => n.id === 'a')!;
    expect(a.parentId).toBe('g');
    expect(a.position).toEqual({ x: 50, y: 60 });
    expect(s().nodes[0].id).toBe('g'); // parents first
  });
  it('does not nest node outside group', () => {
    s().addNode(group('g', 100, 100));
    s().addNode(icon('a', 900, 900));
    expect(s().nodes.find((n) => n.id === 'a')!.parentId).toBeUndefined();
  });
  it('deleting group deletes children', () => {
    s().addNode(group('g'));
    s().addNode(icon('a', 10, 10));
    s().deleteNodes(['g']);
    expect(s().nodes).toHaveLength(0);
  });
  it('endDrag reparents into / out of group preserving absolute position', () => {
    s().addNode(group('g', 100, 100));
    s().addNode(icon('a', 800, 800));
    s().setNodePosition('a', { x: 150, y: 150 });
    s().endDrag('a');
    expect(s().nodes.find((n) => n.id === 'a')).toMatchObject({ parentId: 'g', position: { x: 50, y: 50 } });
    s().setNodePosition('a', { x: 900, y: 900 }); // relative
    s().endDrag('a');
    const a = s().nodes.find((n) => n.id === 'a')!;
    expect(a.parentId).toBeUndefined();
    expect(a.position).toEqual({ x: 1000, y: 1000 });
  });
});

describe('edges', () => {
  beforeEach(() => {
    s().addNode(icon('a'));
    s().addNode(icon('b'));
  });
  it('adds orthogonal styled edge with arrowhead', () => {
    s().addEdge({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    const e = s().edges[0];
    expect(e.type).toBe('smoothstep');
    expect((e as unknown as { pathOptions: { borderRadius: number } }).pathOptions.borderRadius).toBe(0);
    expect(e.markerEnd).toMatchObject({ type: 'arrowclosed', color: '#2d3340' });
  });
  it('updates label, dashed and color', () => {
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    s().updateEdge(id, { label: 'Metrics', dashed: true, color: '#0f7b6c' });
    const e = s().edges[0];
    expect(e.label).toBe('Metrics');
    expect(e.style).toMatchObject({ stroke: '#0f7b6c', strokeDasharray: '6 4' });
    expect(e.markerEnd).toMatchObject({ color: '#0f7b6c' });
    s().updateEdge(id, { dashed: false });
    expect(s().edges[0].style?.strokeDasharray).toBeUndefined();
  });
  it('deletes edge', () => {
    s().addEdge({ source: 'a', target: 'b' });
    s().deleteEdges([s().edges[0].id]);
    expect(s().edges).toHaveLength(0);
  });
  it('rejects self-loop and unknown endpoints', () => {
    s().addEdge({ source: 'a', target: 'a' });
    s().addEdge({ source: 'a', target: 'zzz' });
    expect(s().edges).toHaveLength(0);
  });
});

describe('selection delete', () => {
  it('removes selected nodes and edges', () => {
    s().addNode(icon('a', 0, 0, { selected: true }));
    s().addNode(icon('b'));
    s().addEdge({ source: 'a', target: 'b' });
    s().deleteSelection();
    expect(s().nodes.map((n) => n.id)).toEqual(['b']);
    s().addNode(icon('c'));
    s().addEdge({ source: 'b', target: 'c', selected: true });
    s().deleteSelection();
    expect(s().edges).toHaveLength(0);
  });
});

describe('history', () => {
  it('undo / redo', () => {
    s().addNode(icon('a'));
    s().addNode(icon('b'));
    s().undo();
    expect(s().nodes.map((n) => n.id)).toEqual(['a']);
    s().undo();
    expect(s().nodes).toHaveLength(0);
    s().undo(); // noop
    s().redo();
    s().redo();
    expect(s().nodes.map((n) => n.id)).toEqual(['a', 'b']);
    s().redo(); // noop
    expect(s().nodes).toHaveLength(2);
  });
  it('new action clears redo stack', () => {
    s().addNode(icon('a'));
    s().undo();
    s().addNode(icon('b'));
    expect(s().future).toHaveLength(0);
  });
  it('undoes edge update and delete', () => {
    s().addNode(icon('a'));
    s().addNode(icon('b'));
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    s().updateEdge(id, { label: 'x' });
    s().undo();
    expect(s().edges[0].label).toBeUndefined();
    s().deleteEdges([id]);
    s().undo();
    expect(s().edges).toHaveLength(1);
  });
  it('snapshot() lets drag be undone as one step', () => {
    s().addNode(icon('a'));
    s().snapshot();
    s().setNodePosition('a', { x: 5, y: 5 });
    s().setNodePosition('a', { x: 9, y: 9 });
    s().undo();
    expect(s().nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe('load', () => {
  it('loadDiagram replaces content and is undoable', () => {
    s().addNode(icon('a'));
    s().loadDiagram({ version: 1, nodes: [icon('x'), icon('y')], edges: [] });
    expect(s().nodes).toHaveLength(2);
    s().undo();
    expect(s().nodes.map((n) => n.id)).toEqual(['a']);
  });
});
