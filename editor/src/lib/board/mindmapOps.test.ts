import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { deleteElements } from '../deletion';
import { childrenOf, createRoot, parentOf } from './mindmap';
import { addChildAt, applyMapLayout, dropTarget, hiddenCount, inspectorShouldOpen, mapNavigate, moveNode, pasteAsChildren, promoteNode, subtreeIds } from './mindmapOps';

let n = 0;
const gen = (p: string) => `${p}${++n}`;
interface T { nodes: DiagramNode[]; edges: DiagramEdge[] }
const grow = (t: T, parent: string, label: string, side?: 'l' | 'r'): T => {
  const r = addChildAt(t.nodes, t.edges, parent, gen('n'), gen('e'), label, side);
  return { nodes: [...t.nodes, r.node], edges: [...t.edges, r.edge] };
};
const id = (t: T, label: string) => t.nodes.find((x) => x.data.label === label)!.id;
const sample = (): T => {
  let t: T = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Root')], edges: [] };
  for (const l of ['A', 'B', 'C']) t = grow(t, 'root', l);
  t = grow(t, id(t, 'A'), 'A1');
  t = grow(t, id(t, 'A'), 'A2');
  t = grow(t, id(t, 'A1'), 'A1x');
  const l = applyMapLayout(t.nodes, t.edges, 'root');
  return l;
};

describe('"+" buttons: add on a side', () => {
  it('root: left plus pins the child to the left, right plus to the right', () => {
    let t: T = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Root')], edges: [] };
    t = grow(t, 'root', 'L', 'l');
    t = grow(t, 'root', 'R', 'r');
    const lay = applyMapLayout(t.nodes, t.edges, 'root');
    const byLabel = (s: string) => lay.nodes.find((x) => x.data.label === s)!;
    expect(byLabel('L').data.side).toBe('l');
    expect(byLabel('R').data.side).toBe('r');
    expect(byLabel('L').position.x).toBeLessThan(0);
    expect(byLabel('R').position.x).toBeGreaterThan(0);
  });
  it('several pinned-left children all stay on the left', () => {
    let t: T = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Root')], edges: [] };
    for (const l of ['a', 'b', 'c']) t = grow(t, 'root', l, 'l');
    const lay = applyMapLayout(t.nodes, t.edges, 'root');
    expect(lay.nodes.filter((x) => x.type === 'mindmap' && !x.data.root).every((x) => x.data.side === 'l')).toBe(true);
  });
  it('a child of a left-side node goes left too', () => {
    let t: T = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Root')], edges: [] };
    t = grow(t, 'root', 'L', 'l');
    t = applyMapLayout(t.nodes, t.edges, 'root');
    t = grow(t, id(t, 'L'), 'L1');
    const lay = applyMapLayout(t.nodes, t.edges, 'root');
    expect(lay.nodes.find((x) => x.data.label === 'L1')!.data.side).toBe('l');
  });
  it('a sibling is a child of the same parent', () => {
    const t = sample();
    const r = addChildAt(t.nodes, t.edges, 'root', 'sib', 'esib', 'Sib');
    expect(parentOf([...t.edges, r.edge], 'sib')).toBe('root');
  });
});

describe('automatic branch colours', () => {
  it('each first-level branch has its own colour, inherited by its descendants and edges', () => {
    const t = sample();
    const acc = (l: string) => t.nodes.find((x) => x.data.label === l)!.data.accent;
    expect(new Set([acc('A'), acc('B'), acc('C')]).size).toBe(3);
    expect(acc('A1')).toBe(acc('A'));
    expect(acc('A1x')).toBe(acc('A'));
    const e = t.edges.find((x) => x.target === id(t, 'A1x'))!;
    expect(e.data?.color).toBe(acc('A'));
  });
  it('re-parenting a subtree recolours it into the new branch', () => {
    const t = sample();
    const m = moveNode(t.nodes, t.edges, id(t, 'A1'), id(t, 'B'))!;
    const lay = applyMapLayout(m.nodes, m.edges, 'root');
    const acc = (l: string) => lay.nodes.find((x) => x.data.label === l)!.data.accent;
    expect(acc('A1')).toBe(acc('B'));
    expect(acc('A1x')).toBe(acc('B'));
  });
  it('edges are smooth curves', () => {
    expect(sample().edges.every((e) => e.data?.lineType === 'curved')).toBe(true);
  });
});

describe('delete removes the subtree', () => {
  it('deleting a node deletes all its descendants and their edges', () => {
    const t = sample();
    const r = deleteElements(t.nodes, t.edges, [id(t, 'A')], []);
    expect(r.nodes.map((x) => x.data.label).sort()).toEqual(['B', 'C', 'Root']);
    expect(r.edges).toHaveLength(2);
  });
  it('subtreeIds lists the node and everything below it', () => {
    const t = sample();
    expect(subtreeIds(t.edges, id(t, 'A')).size).toBe(4);
  });
});

describe('re-parent by drag', () => {
  it('moveNode re-parents the whole subtree', () => {
    const t = sample();
    const m = moveNode(t.nodes, t.edges, id(t, 'A1'), id(t, 'C'))!;
    expect(parentOf(m.edges, id(t, 'A1'))).toBe(id(t, 'C'));
    expect(parentOf(m.edges, id(t, 'A1x'))).toBe(id(t, 'A1'));
  });
  it('refuses cycles (onto itself or a descendant) and moving the root', () => {
    const t = sample();
    expect(moveNode(t.nodes, t.edges, id(t, 'A'), id(t, 'A1x'))).toBeNull();
    expect(moveNode(t.nodes, t.edges, id(t, 'A'), id(t, 'A'))).toBeNull();
    expect(moveNode(t.nodes, t.edges, 'root', id(t, 'A'))).toBeNull();
  });
  it('moveNode can place the node at a sibling index (reorder)', () => {
    const t = sample();
    const m = moveNode(t.nodes, t.edges, id(t, 'C'), 'root', 0)!;
    expect(childrenOf(m.nodes, m.edges, 'root').map((x) => x.data.label)).toEqual(['C', 'A', 'B']);
  });
  it('dropTarget: dropping on another node re-parents, dropping elsewhere reorders among siblings', () => {
    const t = sample();
    const b = t.nodes.find((x) => x.data.label === 'B')!;
    const c = t.nodes.find((x) => x.data.label === 'C')!;
    const w = (x: DiagramNode) => ({ x: x.position.x + (x.width ?? 0) / 2, y: x.position.y + (x.height ?? 0) / 2 });
    expect(dropTarget(t.nodes, t.edges, id(t, 'C'), w(b))).toEqual({ kind: 'parent', id: b.id });
    expect(dropTarget(t.nodes, t.edges, id(t, 'C'), { x: c.position.x, y: -5000 })).toEqual({ kind: 'reorder', parentId: 'root', index: 0 });
  });
  it('promote makes the node a sibling of its parent, right after it', () => {
    const t = sample();
    const m = promoteNode(t.nodes, t.edges, id(t, 'A1'))!;
    expect(childrenOf(m.nodes, m.edges, 'root').map((x) => x.data.label)).toEqual(['A', 'A1', 'B', 'C']);
    expect(promoteNode(t.nodes, t.edges, id(t, 'A'))).toBeNull(); // first level cannot be promoted
  });
});

describe('paste a list onto a node', () => {
  it('indentation becomes depth; the first level becomes children of the node', () => {
    const t = sample();
    const text = '- One\n  - One.a\n  - One.b\n- Two\n    - Two.a';
    const r = pasteAsChildren(t.nodes, t.edges, id(t, 'B'), text, gen)!;
    const nodes = [...t.nodes, ...r.nodes];
    const edges = [...t.edges, ...r.edges];
    const kid = (p: string) => childrenOf(nodes, edges, id({ nodes } as T, p)).map((x) => x.data.label);
    expect(kid('B')).toEqual(['One', 'Two']);
    expect(kid('One')).toEqual(['One.a', 'One.b']);
    expect(kid('Two')).toEqual(['Two.a']);
  });
  it('plain multi-line text makes one child per line; tabs work; a single line is not a list', () => {
    const t = sample();
    const r = pasteAsChildren(t.nodes, t.edges, 'root', 'x\n\ty\nz', gen)!;
    expect(r.nodes.map((x) => x.data.label)).toEqual(['x', 'y', 'z']);
    expect(pasteAsChildren(t.nodes, t.edges, 'root', 'just one line', gen)).toBeNull();
  });
});

describe('arrow navigation', () => {
  it('right/left go to a child or the parent depending on the side; up/down walk siblings', () => {
    let t: T = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Root')], edges: [] };
    t = grow(t, 'root', 'R1', 'r');
    t = grow(t, 'root', 'R2', 'r');
    t = grow(t, 'root', 'L1', 'l');
    t = applyMapLayout(t.nodes, t.edges, 'root');
    const nav = (from: string, d: 'up' | 'down' | 'left' | 'right') => {
      const to = mapNavigate(t.nodes, t.edges, id(t, from), d);
      return to ? t.nodes.find((x) => x.id === to)!.data.label : null;
    };
    expect(nav('Root', 'right')).toBe('R1');
    expect(nav('Root', 'left')).toBe('L1');
    expect(nav('R1', 'left')).toBe('Root');
    expect(nav('R1', 'down')).toBe('R2');
    expect(nav('R2', 'up')).toBe('R1');
    expect(nav('R2', 'down')).toBeNull();
    expect(nav('L1', 'right')).toBe('Root');
  });
});

describe('collapse dot', () => {
  it('counts every hidden descendant', () => {
    const t = sample();
    expect(hiddenCount(t.nodes, t.edges, id(t, 'A'))).toBe(3);
    expect(hiddenCount(t.nodes, t.edges, id(t, 'B'))).toBe(0);
  });
});

describe('minimal chrome', () => {
  it('selecting only mind map nodes does not open the inspector by itself', () => {
    const t = sample();
    expect(inspectorShouldOpen(t.nodes.map((x) => ({ ...x, selected: x.id === 'root' })), [])).toBe(false);
    const other = { id: 'z', type: 'icon', position: { x: 0, y: 0 }, selected: true, data: { label: 'z' } } as DiagramNode;
    expect(inspectorShouldOpen([...t.nodes, other], [])).toBe(true);
  });
});
