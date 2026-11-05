import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from './diagramStore';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: 100, height: 50, data: { label: id }, ...extra,
});
const pos = (id: string) => s().nodes.find((x) => x.id === id)!.position;
beforeEach(() => s().reset());

describe('lock', () => {
  it('toggleLock locks selection, blocks move/nudge/delete, unlock restores', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().toggleLock();
    const a = () => s().nodes[0];
    expect(a().data.locked).toBe(true);
    expect(a().draggable).toBe(false);
    s().nudgeSelection(10, 0);
    expect(pos('a')).toEqual({ x: 0, y: 0 });
    s().deleteSelection();
    s().deleteNodes(['a']);
    expect(s().nodes).toHaveLength(1);
    s().onNodesChange([{ id: 'a', type: 'position', position: { x: 50, y: 50 } }]);
    expect(pos('a')).toEqual({ x: 0, y: 0 });
    s().onNodesChange([{ id: 'a', type: 'remove' }]);
    expect(s().nodes).toHaveLength(1);
    s().toggleLock();
    expect(a().data.locked).toBeFalsy();
    s().nudgeSelection(10, 0);
    expect(pos('a')).toEqual({ x: 10, y: 0 });
  });
  it('deleting a group keeps its locked child (detached) and removes the rest', () => {
    s().addNode({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 300, data: { label: 'g' } });
    s().addNode(n('a', 10, 10, { data: { label: 'a', locked: true } }));
    expect(s().deleteNodes(['g'])).toBe(1);
    expect(s().nodes.map((n) => n.id)).toEqual(['a']);
    expect(s().nodes[0].parentId).toBeUndefined();
  });
  it('locked edge cannot be deleted', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b', selected: true });
    s().toggleLock();
    s().deleteSelection();
    expect(s().edges).toHaveLength(1);
  });
});

describe('nudge', () => {
  it('moves selected nodes by delta (undoable)', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().addNode(n('b', 5, 5));
    s().nudgeSelection(1, -1);
    expect(pos('a')).toEqual({ x: 1, y: -1 });
    expect(pos('b')).toEqual({ x: 5, y: 5 });
    s().undo();
    expect(pos('a')).toEqual({ x: 0, y: 0 });
  });
  it('does not move child separately when its group is also selected', () => {
    s().addNode({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 300, selected: true, data: { label: 'g' } });
    s().addNode(n('a', 10, 10, { selected: true }));
    s().nudgeSelection(10, 10);
    expect(pos('g')).toEqual({ x: 10, y: 10 });
    expect(pos('a')).toEqual({ x: 10, y: 10 }); // relative unchanged
  });
});

describe('clipboard', () => {
  it('copy/paste creates offset copies and selects only them; repeated paste offsets more', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().copy();
    s().paste();
    expect(s().nodes).toHaveLength(2);
    const copy = s().nodes[1];
    expect(copy.id).not.toBe('a');
    expect(copy.position).not.toEqual({ x: 0, y: 0 }); // moved to a free spot
    expect(copy.selected).toBe(true);
    expect(s().nodes[0].selected).toBe(false);
    s().paste();
    expect(s().nodes[2].position).not.toEqual(copy.position);
    s().undo();
    expect(s().nodes).toHaveLength(2);
  });
  it('paste at position places clipboard top-left there', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    s().copy();
    s().paste({ x: 500, y: 300 });
    expect(s().nodes[1].position).toEqual({ x: 500, y: 300 });
  });
  it('paste with empty clipboard is noop', () => {
    s().paste();
    expect(s().nodes).toHaveLength(0);
  });
  it('cut removes and allows paste', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().cut();
    expect(s().nodes).toHaveLength(0);
    s().paste();
    expect(s().nodes).toHaveLength(1);
  });
  it('duplicate copies in place with offset without touching clipboard', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().duplicate();
    expect(s().nodes).toHaveLength(2);
    expect(s().clipboard).toBeNull();
  });
  it('duplicate of locked node yields unlocked copy', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().toggleLock();
    s().duplicate();
    expect(s().nodes[1].data.locked).toBeFalsy();
  });
});

describe('selection', () => {
  it('selectAll selects all nodes and edges', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b' });
    s().selectAll();
    expect(s().nodes.every((x) => x.selected)).toBe(true);
    expect(s().edges.every((x) => x.selected)).toBe(true);
  });
  it('selectOnly', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().addNode(n('b'));
    s().selectOnly('node', 'b');
    expect(s().nodes.map((x) => !!x.selected)).toEqual([false, true]);
  });
  it('selectChildren', () => {
    s().addNode({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 300, data: { label: 'g' } });
    s().addNode(n('a', 10, 10));
    s().selectChildren('g');
    expect(s().nodes.map((x) => !!x.selected)).toEqual([false, true]);
  });
});

describe('arrange via store', () => {
  it('align + distribute + z-order are single undo steps', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().addNode(n('b', 200, 100, { selected: true }));
    s().addNode(n('c', 500, 40, { selected: true }));
    s().alignSelection('left');
    expect(s().nodes.map((x) => x.position.x)).toEqual([0, 0, 0]);
    s().undo();
    expect(pos('b').x).toBe(200);
    s().distributeSelection('horizontal');
    expect(pos('b').x).toBe(250);
    s().reorderSelection('back');
    expect(s().nodes.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    s().selectOnly('node', 'c');
    s().reorderSelection('back');
    expect(s().nodes[0].id).toBe('c');
  });
});

describe('grouping via store', () => {
  it('group selection then ungroup', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    s().addNode(n('b', 300, 100, { selected: true }));
    s().groupSelection();
    const g = s().nodes.find((x) => x.type === 'group')!;
    expect(s().nodes.filter((x) => x.parentId === g.id)).toHaveLength(2);
    s().ungroup(g.id);
    expect(s().nodes.some((x) => x.type === 'group')).toBe(false);
    expect(pos('a')).toEqual({ x: 100, y: 100 });
    s().undo();
    expect(s().nodes.some((x) => x.type === 'group')).toBe(true);
  });
  it('removeFromGroup', () => {
    s().addNode({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 300, data: { label: 'g' } });
    s().addNode(n('a', 10, 10, { selected: true }));
    expect(s().nodes[1].parentId).toBe('g');
    s().removeFromGroup(['a']);
    expect(s().nodes.find((x) => x.id === 'a')!.parentId).toBeUndefined();
  });
});

describe('style + edges', () => {
  it('copy/paste style', () => {
    s().addNode(n('a', 0, 0, { selected: true, data: { label: 'a', fill: '#abc', stroke: '#123', strokeWidth: 3 } }));
    s().addNode(n('b'));
    s().copyStyle();
    s().selectOnly('node', 'b');
    s().pasteStyle();
    expect(s().nodes[1].data).toMatchObject({ label: 'b', fill: '#abc', stroke: '#123', strokeWidth: 3 });
  });
  it('updateNodesData applies to many with one undo', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().updateNodesData(['a', 'b'], { fill: '#fff3a3' });
    expect(s().nodes.every((x) => x.data.fill === '#fff3a3')).toBe(true);
    s().undo();
    expect(s().nodes.every((x) => x.data.fill === undefined)).toBe(true);
  });
  it('edge options: lineType, arrows, width, labelBg, dotted', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    s().updateEdges([id], { lineType: 'straight', arrows: 'both', strokeWidth: 3, labelBg: false });
    let e = s().edges[0] as unknown as Record<string, unknown> & { style: Record<string, unknown> };
    expect(e.type).toBe('straight');
    expect(e.markerStart).toBeTruthy();
    expect(e.markerEnd).toBeTruthy();
    expect(e.style.strokeWidth).toBe(3);
    expect(e.labelShowBg).toBe(false);
    s().updateEdges([id], { lineType: 'curved', arrows: 'none', strokeStyle: 'dotted' });
    e = s().edges[0] as never;
    expect(e.type).toBe('default');
    expect(e.markerEnd).toBeUndefined();
    expect(e.style.strokeDasharray).toBe('2 5');
    s().updateEdges([id], { lineType: 'orthogonal', arrows: 'start' });
    e = s().edges[0] as never;
    expect(e.type).toBe('smoothstep');
    expect(e.markerStart).toBeTruthy();
    expect(e.markerEnd).toBeUndefined();
  });
  it('reverseEdge swaps endpoints and handles', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    s().reverseEdge(s().edges[0].id);
    expect(s().edges[0]).toMatchObject({ source: 'b', target: 'a', sourceHandle: 'left', targetHandle: 'right' });
  });
});
