import { describe, expect, it } from 'vitest';
import { layeredPlace, type Box, type Pair } from './layered';

const box = (id: string, w = 100, h = 50): Box => ({ id, w, h });
const opts = { direction: 'LR' as const, gapAcross: 30, gapAlong: 60 };

describe('layeredPlace', () => {
  it('empty input', () => {
    expect(layeredPlace([], [], opts).size).toBe(0);
  });
  it('chain: layers along the flow, LR vs TB', () => {
    const boxes = [box('a'), box('b'), box('c')];
    const edges: Pair[] = [['a', 'b'], ['b', 'c']];
    const lr = layeredPlace(boxes, edges, opts);
    expect(lr.get('a')!.x).toBeLessThan(lr.get('b')!.x);
    expect(lr.get('b')!.x).toBeLessThan(lr.get('c')!.x);
    const tb = layeredPlace(boxes, edges, { ...opts, direction: 'TB' });
    expect(tb.get('a')!.y).toBeLessThan(tb.get('b')!.y);
    expect(tb.get('b')!.y).toBeLessThan(tb.get('c')!.y);
  });
  it('ignores self, duplicate and unknown edges; breaks cycles', () => {
    const boxes = [box('a'), box('b'), box('c')];
    const res = layeredPlace(boxes, [['a', 'a'], ['a', 'b'], ['a', 'b'], ['b', 'zz'], ['zz', 'a'], ['b', 'c'], ['c', 'a']], opts);
    expect(res.size).toBe(3);
    const xs = ['a', 'b', 'c'].map((i) => res.get(i)!.x);
    expect(new Set(xs).size).toBe(3);
  });
  it('long edges get virtual nodes; sources slide next to successors', () => {
    const boxes = ['a', 'b', 'c', 'd', 'e'].map((i) => box(i));
    const res = layeredPlace(boxes, [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd'], ['e', 'd']], opts);
    expect(res.get('e')!.x).toBeGreaterThan(res.get('a')!.x);
    expect(res.get('d')!.x).toBeGreaterThan(res.get('c')!.x);
  });
  it('nodes in one layer never overlap across', () => {
    const boxes = ['r', 'a', 'b', 'c', 'd'].map((i) => box(i, 80, 60));
    const res = layeredPlace(boxes, [['r', 'a'], ['r', 'b'], ['r', 'c'], ['r', 'd']], opts);
    const ys = ['a', 'b', 'c', 'd'].map((i) => res.get(i)!.y).sort((p, q) => p - q);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(60);
  });
  it('soft pairs pull strict-less nodes into a neighbour layer, unknown soft ids ignored', () => {
    const boxes = ['a', 'b', 'c', 'd'].map((i) => box(i));
    const res = layeredPlace(boxes, [['a', 'b']], { ...opts, soft: [['c', 'b'], ['a', 'd'], ['x', 'a'], ['c', 'x']] });
    expect(res.get('c')!.x).toBe(res.get('b')!.x);
    expect(res.get('d')!.x).toBe(res.get('a')!.x);
  });
  it('soft pairs between strict nodes affect ordering only', () => {
    const boxes = ['r', 'a', 'b'].map((i) => box(i));
    const res = layeredPlace(boxes, [['r', 'a'], ['r', 'b']], { ...opts, soft: [['a', 'b']] });
    expect(res.get('a')!.x).toBe(res.get('b')!.x);
  });
  it('disconnected nodes still get positions', () => {
    const res = layeredPlace([box('a'), box('b')], [], opts);
    expect(res.size).toBe(2);
  });
  it('crossing minimisation untangles a bipartite swap', () => {
    const boxes = ['a1', 'a2', 'b1', 'b2'].map((i) => box(i));
    const res = layeredPlace(boxes, [['a1', 'b2'], ['a2', 'b1']], opts);
    const order = (p: string, q: string) => res.get(p)!.y < res.get(q)!.y;
    expect(order('a1', 'a2')).toBe(order('b2', 'b1'));
  });
  it('big graphs (>700 edges) use the cheap ordering path', () => {
    const ids = Array.from({ length: 60 }, (_, i) => 'n' + i);
    const edges: Pair[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length && edges.length < 760; j++) edges.push([ids[i], ids[j]]);
    expect(edges.length).toBeGreaterThan(700);
    const res = layeredPlace(ids.map((i) => box(i, 40, 30)), edges, opts);
    expect(res.size).toBe(60);
  });
});
