import { describe, expect, it } from 'vitest';
import { copySelection, pasteClipboard } from './clipboard';
import type { DiagramEdge, DiagramNode } from '../types';

const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: 100, height: 80, data: { label: id }, ...extra,
});
const g = (id: string, x: number, y: number): DiagramNode => ({
  id, type: 'group', position: { x, y }, width: 400, height: 300, data: { label: id },
});
const e = (id: string, s: string, t: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source: s, target: t, ...extra });

let seq = 0;
const gen = (p: string) => `${p}${++seq}`;

describe('copySelection', () => {
  it('returns null when nothing selected', () => {
    expect(copySelection([n('a', 0, 0)], [])).toBeNull();
  });
  it('copies selected nodes and edges between them only, without selection flag', () => {
    const nodes = [n('a', 0, 0, { selected: true }), n('b', 200, 0, { selected: true }), n('c', 400, 0)];
    const edges = [e('e1', 'a', 'b'), e('e2', 'b', 'c')];
    const clip = copySelection(nodes, edges)!;
    expect(clip.nodes.map((x) => x.id)).toEqual(['a', 'b']);
    expect(clip.edges.map((x) => x.id)).toEqual(['e1']);
    expect(clip.nodes.every((x) => !x.selected)).toBe(true);
  });
  it('includes children of a selected group', () => {
    const nodes = [g('g', 0, 0), n('a', 10, 10, { parentId: 'g' }), n('b', 900, 0)];
    nodes[0].selected = true;
    const clip = copySelection(nodes, [])!;
    expect(clip.nodes.map((x) => x.id)).toEqual(['g', 'a']);
  });
  it('detaches child copied without its parent, keeping absolute position', () => {
    const nodes = [g('g', 100, 100), n('a', 10, 20, { parentId: 'g', selected: true })];
    const clip = copySelection(nodes, [])!;
    expect(clip.nodes[0].parentId).toBeUndefined();
    expect(clip.nodes[0].position).toEqual({ x: 110, y: 120 });
  });
});

describe('pasteClipboard', () => {
  it('remaps ids, edge endpoints and parentIds; offsets only roots', () => {
    const nodes = [g('g', 0, 0), n('a', 10, 10, { parentId: 'g' }), n('b', 500, 0)];
    nodes.forEach((x) => (x.selected = true));
    const clip = copySelection(nodes, [e('e', 'a', 'b', { sourceHandle: 'right' })])!;
    const out = pasteClipboard(clip, { x: 20, y: 20 }, gen);
    const ids = out.nodes.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.some((i) => ['g', 'a', 'b'].includes(i))).toBe(false);
    const ng = out.nodes.find((x) => x.type === 'group')!;
    const na = out.nodes.find((x) => x.data.label === 'a')!;
    const nb = out.nodes.find((x) => x.data.label === 'b')!;
    expect(na.parentId).toBe(ng.id);
    expect(ng.position).toEqual({ x: 20, y: 20 });
    expect(na.position).toEqual({ x: 10, y: 10 }); // relative: unchanged
    expect(nb.position).toEqual({ x: 520, y: 20 });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toMatchObject({ source: na.id, target: nb.id, sourceHandle: 'right' });
    expect(out.edges[0].id).not.toBe('e');
  });
  it('pasted nodes are selected, unlocked, parents before children', () => {
    const nodes = [n('a', 0, 0, { selected: true, draggable: false, data: { label: 'a', locked: true } })];
    const out = pasteClipboard(copySelection(nodes, [])!, { x: 0, y: 0 }, gen);
    expect(out.nodes[0].selected).toBe(true);
    expect(out.nodes[0].data.locked).toBeUndefined();
    expect(out.nodes[0].draggable).toBeUndefined();
  });
  it('twice yields distinct ids', () => {
    const clip = copySelection([n('a', 0, 0, { selected: true })], [])!;
    const a = pasteClipboard(clip, { x: 20, y: 20 }, gen);
    const b = pasteClipboard(clip, { x: 40, y: 40 }, gen);
    expect(a.nodes[0].id).not.toBe(b.nodes[0].id);
  });
});
