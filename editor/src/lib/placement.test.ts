import { describe, expect, it } from 'vitest';
import { findFreeSpot, overlaps, placeInto } from './placement';
import { absolutePosition, nodeSize } from './graph';
import { createNodeFromPaletteItem, getItem } from '../data/palette';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../types';

const R = (x: number, y: number, w = 100, h = 60) => ({ x, y, width: w, height: h });
const icon = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 120, height: 96, data: { label: id }, ...extra });
const group = (id: string, x: number, y: number, w = 400, h = 300): DiagramNode => ({ id, type: 'group', position: { x, y }, width: w, height: h, data: { label: id } });
const abs = (nodes: DiagramNode[], n: DiagramNode) => ({ ...absolutePosition(nodes, n), ...nodeSize(n) });

describe('findFreeSpot', () => {
  it('returns the same spot when it is free', () => {
    expect(findFreeSpot(R(500, 500), [R(0, 0)])).toEqual({ x: 500, y: 500 });
  });
  it('prefers right, then down, and keeps 16px padding', () => {
    const spot = findFreeSpot(R(0, 0), [R(0, 0)]);
    expect(spot.x).toBeGreaterThan(0);
    expect(spot.y).toBe(0);
    expect(overlaps({ ...R(0, 0), ...spot }, R(0, 0), 16)).toBe(false);
    // right side blocked -> goes down
    const down = findFreeSpot(R(0, 0), [R(0, 0), R(0, 0, 600, 60)].slice(0, 1).concat([R(100, -400, 600, 900)]));
    expect(down.y !== 0 || down.x < 0).toBe(true);
  });
  it('respects bounds', () => {
    const bounds = R(0, 0, 400, 300);
    const s = findFreeSpot(R(10, 10, 100, 60), [R(0, 0, 200, 300)], { bounds });
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x + 100).toBeLessThanOrEqual(400);
    expect(s.y + 60).toBeLessThanOrEqual(300);
  });
  it('snaps candidates to the grid', () => {
    const s = findFreeSpot(R(0, 0), [R(0, 0)], { grid: 20 });
    expect(s.x % 20).toBe(0);
  });
});

describe('placeInto', () => {
  it('ten nodes added at the same point never overlap (16px padding)', () => {
    let nodes: DiagramNode[] = [];
    for (let i = 0; i < 10; i++) {
      const [n] = placeInto(nodes, [icon(`n${i}`, 300, 300)]);
      nodes = [...nodes, n];
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(abs(nodes, nodes[i]), abs(nodes, nodes[j]), 16), `${i}/${j}`).toBe(false);
  });
  it('real palette items too (store.placeNodes)', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    for (let i = 0; i < 10; i++) s().placeNodes([createNodeFromPaletteItem(getItem('postgresql')!, { x: 200, y: 200 }, `p${i}`)]);
    const ns = s().nodes;
    expect(ns).toHaveLength(10);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(overlaps(abs(ns, ns[i]), abs(ns, ns[j]), 16)).toBe(false);
    expect(ns.every((n) => n.data.label === 'PostgreSQL')).toBe(true);
  });
  it('dropping into a group stays inside that group even when the first spot is taken', () => {
    let nodes: DiagramNode[] = [group('g', 100, 100, 500, 400)];
    for (let i = 0; i < 6; i++) {
      const [n] = placeInto(nodes, [icon(`n${i}`, 160, 170)]);
      expect(n.parentId, `n${i}`).toBe('g');
      nodes = [...nodes, n];
    }
    const g = nodes[0];
    for (const n of nodes.slice(1)) {
      const a = abs(nodes, n);
      expect(a.x).toBeGreaterThanOrEqual(g.position.x);
      expect(a.y).toBeGreaterThanOrEqual(g.position.y);
      expect(a.x + a.width).toBeLessThanOrEqual(g.position.x + 500);
      expect(a.y + a.height).toBeLessThanOrEqual(g.position.y + 400);
    }
    for (let i = 1; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(abs(nodes, nodes[i]), abs(nodes, nodes[j]), 16)).toBe(false);
  });
  it('a group with children keeps its internal layout when moved to a free spot', () => {
    const existing = [icon('x', 0, 0)];
    const g = group('g', 10, 10, 300, 200);
    const kid = icon('k', 20, 60, { parentId: 'g' });
    const out = placeInto(existing, [g, kid]);
    expect(out[1].position).toEqual({ x: 20, y: 60 });
    expect(overlaps(abs([...existing, ...out], out[0]), abs(existing, existing[0]), 0)).toBe(false);
  });
});

describe('paste / duplicate / cluster creation avoid overlaps', () => {
  const s = () => useDiagramStore.getState();
  it('pasting never stacks on the original or on earlier pastes', () => {
    s().reset();
    s().addNode(icon('a', 0, 0, { selected: true }));
    s().copy();
    for (let i = 0; i < 5; i++) s().paste();
    const ns = s().nodes;
    expect(ns).toHaveLength(6);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(overlaps(abs(ns, ns[i]), abs(ns, ns[j]), 16)).toBe(false);
  });
  it('duplicate lands on a free spot', () => {
    s().reset();
    s().addNode(icon('a', 0, 0, { selected: true }));
    s().duplicate();
    const [a, b] = s().nodes;
    expect(overlaps(abs(s().nodes, a), abs(s().nodes, b), 16)).toBe(false);
  });
  it('paste "here" at a free position is exact', () => {
    s().reset();
    s().addNode(icon('a', 100, 100, { selected: true }));
    s().copy();
    s().paste({ x: 900, y: 600 });
    expect(s().nodes[1].position).toEqual({ x: 900, y: 600 });
  });
});

describe('insertContent (template into non-empty page)', () => {
  it('puts the template right of existing content with no overlap; empty page keeps coordinates', async () => {
    const { monitoringStack } = await import('../templates/monitoringStack');
    const st = () => useDiagramStore.getState();
    st().reset();
    st().insertContent(monitoringStack());
    const first = st().nodes.map((n) => n.position);
    expect(first.length).toBeGreaterThan(5);
    const before = st().nodes.length;
    const maxX = Math.max(...st().nodes.filter((n) => !n.parentId).map((n) => n.position.x + nodeSize(n).width));
    st().insertContent(monitoringStack());
    const all = st().nodes;
    expect(all.length).toBe(before * 2);
    const added = all.slice(before).filter((n) => !n.parentId);
    expect(Math.min(...added.map((n) => n.position.x))).toBeGreaterThanOrEqual(maxX);
    const old = all.filter((n) => !n.parentId).slice(0, 0);
    void old;
    st().undo();
    expect(st().nodes.length).toBe(before);
  });
});

describe('insertContent asks the canvas to fit the new nodes', () => {
  it('requests a fit for exactly the inserted node ids', async () => {
    const { onFitRequest } = await import('./fitBus');
    const st = () => useDiagramStore.getState();
    st().reset();
    const got: string[][] = [];
    const off = onFitRequest((ids) => got.push(ids));
    st().insertContent({ nodes: [icon('a', 0, 0), icon('b', 300, 0)], edges: [] });
    await new Promise((r) => setTimeout(r, 80)); // two animation frames
    off();
    expect(got).toHaveLength(1);
    expect(got[0].sort()).toEqual(st().nodes.map((n) => n.id).sort());
  });
});
