import { describe, expect, it } from 'vitest';
import { addChild, addSibling, childrenOf, collapsedHidden, createRoot, fromOutline, layoutMindMap, mindmapSize, parentOf, rootOf, toOutline } from './mindmap';
import type { DiagramEdge, DiagramNode } from '../../types';

let n = 0;
const gen = (p: string) => `${p}${++n}`;
interface Tree { nodes: DiagramNode[]; edges: DiagramEdge[] }
const grow = (t: Tree, parent: string, label: string): Tree => {
  const r = addChild(t.nodes, t.edges, parent, gen('n'), gen('e'), label);
  return { nodes: [...t.nodes, r.node], edges: [...t.edges, r.edge] };
};
const sample = (): Tree => {
  let t: Tree = { nodes: [createRoot('root', { x: 0, y: 0 }, 'Product')], edges: [] };
  t = grow(t, 'root', 'Users');
  t = grow(t, 'root', 'Tech');
  t = grow(t, 'root', 'Growth');
  t = grow(t, 'root', 'Risks');
  const users = childrenOf(t.nodes, t.edges, 'root')[0].id;
  t = grow(t, users, 'Admins');
  t = grow(t, users, 'Guests');
  return t;
};

describe('tree helpers', () => {
  it('children keep creation order, parent and root are found', () => {
    const t = sample();
    expect(childrenOf(t.nodes, t.edges, 'root').map((c) => c.data.label)).toEqual(['Users', 'Tech', 'Growth', 'Risks']);
    const admins = t.nodes.find((x) => x.data.label === 'Admins')!;
    expect(parentOf(t.edges, admins.id)).toBe(childrenOf(t.nodes, t.edges, 'root')[0].id);
    expect(rootOf(t.nodes, t.edges, admins.id)).toBe('root');
  });
  it('addChild makes a mindmap node linked by a curved edge', () => {
    const r = addChild([createRoot('root', { x: 0, y: 0 })], [], 'root', 'c', 'e', 'Idea');
    expect(r.node.type).toBe('mindmap');
    expect(r.edge).toMatchObject({ source: 'root', target: 'c' });
    expect(r.edge.data?.lineType).toBe('curved');
  });
  it('addSibling attaches to the same parent, after the node; at the root it adds a child', () => {
    const t = sample();
    const users = childrenOf(t.nodes, t.edges, 'root')[0];
    const s = addSibling(t.nodes, t.edges, users.id, 'sib', 'esib', 'New');
    expect(s.edge.source).toBe('root');
    const rootSib = addSibling(t.nodes, t.edges, 'root', 'x', 'ex', 'Child');
    expect(rootSib.edge.source).toBe('root');
  });
});

describe('layoutMindMap', () => {
  it('balances the first level left and right of the root', () => {
    const t = sample();
    const m = layoutMindMap(t.nodes, t.edges, 'root');
    const root = m.get('root')!;
    const kids = childrenOf(t.nodes, t.edges, 'root').map((c) => m.get(c.id)!);
    expect(kids.filter((k) => k.x > root.x).length).toBeGreaterThanOrEqual(1);
    expect(kids.filter((k) => k.x < root.x).length).toBeGreaterThanOrEqual(1);
    expect(kids.every((k) => k.side === 'r' || k.side === 'l')).toBe(true);
  });
  it('keeps the root where it is', () => {
    const t = sample();
    t.nodes[0] = { ...t.nodes[0], position: { x: 400, y: 300 } };
    expect(layoutMindMap(t.nodes, t.edges, 'root').get('root')).toMatchObject({ x: 400, y: 300 });
  });
  it('never overlaps any two nodes', () => {
    let t = sample();
    for (const c of childrenOf(t.nodes, t.edges, 'root')) t = grow(t, c.id, `${c.data.label} detail`);
    const m = layoutMindMap(t.nodes, t.edges, 'root');
    const rects = t.nodes.map((nd) => { const p = m.get(nd.id)!; const s = mindmapSize(nd.data.label, nd.id === 'root'); return { id: nd.id, ...p, w: s.width, h: s.height }; });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  });
  it('children of a right node stay to its right, of a left node to its left', () => {
    const t = sample();
    const m = layoutMindMap(t.nodes, t.edges, 'root');
    for (const nd of t.nodes) {
      const p = parentOf(t.edges, nd.id);
      if (!p || p === 'root') continue;
      const pp = m.get(p)!;
      const me = m.get(nd.id)!;
      if (pp.side === 'r') expect(me.x).toBeGreaterThan(pp.x);
      else expect(me.x).toBeLessThan(pp.x);
    }
  });
  it('a collapsed branch does not take room and its descendants are not placed', () => {
    const t = sample();
    const users = childrenOf(t.nodes, t.edges, 'root')[0];
    const nodes = t.nodes.map((x) => (x.id === users.id ? { ...x, data: { ...x.data, collapsed: true } } : x));
    const m = layoutMindMap(nodes, t.edges, 'root');
    expect(m.has(t.nodes.find((x) => x.data.label === 'Admins')!.id)).toBe(false);
  });
});

describe('collapsedHidden', () => {
  it('lists every descendant of collapsed nodes', () => {
    const t = sample();
    const users = childrenOf(t.nodes, t.edges, 'root')[0];
    const nodes = t.nodes.map((x) => (x.id === users.id ? { ...x, data: { ...x.data, collapsed: true } } : x));
    const hidden = collapsedHidden(nodes, t.edges, 'root');
    expect(hidden.size).toBe(2);
    expect(hidden.has(users.id)).toBe(false);
  });
});

describe('outline', () => {
  it('exports a heading and indented bullets', () => {
    const t = sample();
    const text = toOutline(t.nodes, t.edges, 'root');
    expect(text.split('\n')[0]).toBe('# Product');
    expect(text).toContain('- Users\n  - Admins\n  - Guests\n- Tech');
  });
  it('round-trips structure and labels', () => {
    const t = sample();
    const text = toOutline(t.nodes, t.edges, 'root');
    const back = fromOutline(text, gen);
    expect(back).not.toBeNull();
    const rootId = back!.nodes.find((x) => x.data.root)!.id;
    expect(toOutline(back!.nodes, back!.edges, rootId)).toBe(text);
  });
  it('imports 4-space and tab indents, * and + markers, numbering', () => {
    const b = fromOutline('# R\n* a\n    + a1\n\t- a2\n1. b', gen)!;
    const root = b.nodes.find((x) => x.data.root)!.id;
    expect(toOutline(b.nodes, b.edges, root)).toBe('# R\n- a\n  - a1\n  - a2\n- b');
  });
  it('wraps several top level bullets under a root; ignores blank lines; rejects empty text', () => {
    const b = fromOutline('- one\n- two\n\n- three', gen)!;
    const root = b.nodes.find((x) => x.data.root)!;
    expect(childrenOf(b.nodes, b.edges, root.id).map((c) => c.data.label)).toEqual(['one', 'two', 'three']);
    expect(fromOutline('   \n', gen)).toBeNull();
  });
  it('a single top level bullet becomes the root', () => {
    const b = fromOutline('- only\n  - child', gen)!;
    expect(b.nodes.find((x) => x.data.root)!.data.label).toBe('only');
  });
  it('skips levels gracefully (over-indented line attaches to the nearest parent)', () => {
    const b = fromOutline('# R\n- a\n        - deep', gen)!;
    const root = b.nodes.find((x) => x.data.root)!.id;
    expect(toOutline(b.nodes, b.edges, root)).toBe('# R\n- a\n  - deep');
  });
});
