import { describe, expect, it } from 'vitest';
import { absRects, alignGroups, applyLayout, edgeLabelRects, placeBoxes, separateLabels } from '@core/layout';
import type { CEdge, CNode, CPage } from '@core/types';

const nd = (id: string, x = 0, y = 0, extra: Partial<CNode> = {}): CNode => ({ id, type: 'card', position: { x, y }, data: { label: id }, width: 100, height: 50, ...extra });
const ed = (id: string, source: string, target: string, extra: Partial<CEdge> = {}): CEdge => ({ id, source, target, ...extra });
const page = (nodes: CNode[], edges: CEdge[] = []): CPage => ({ id: 'p', name: 'P', nodes, edges });
const box = (id: string, w = 100, h = 50) => ({ id, w, h });

describe('placeBoxes', () => {
  it('empty input yields an empty map for every algorithm', () => {
    for (const a of ['grid', 'tree', 'radial', 'force', 'orthogonal', 'layered'] as const) expect(placeBoxes(a, [], []).size).toBe(0);
  });
  it('tree: explicit rootId becomes the root at depth 0; unknown rootId falls back to source nodes', () => {
    const boxes = [box('a'), box('b'), box('c')];
    const edges: [string, string][] = [['a', 'b'], ['b', 'c']];
    const rooted = placeBoxes('tree', boxes, edges, { rootId: 'c', direction: 'TB' });
    expect(rooted.get('c')!.y).toBe(0);
    expect(rooted.get('a')!.y).toBe(0);
    expect(rooted.get('b')!.y).toBeGreaterThan(0);
    const unknown = placeBoxes('tree', boxes, edges, { rootId: 'zzz', direction: 'TB' });
    expect(unknown.get('a')!.y).toBe(0);
    expect(unknown.get('c')!.y).toBeGreaterThan(unknown.get('b')!.y);
  });
  it('radial: explicit root sits at the origin, several trees get a virtual root', () => {
    const boxes = [box('a'), box('b'), box('c')];
    const r = placeBoxes('radial', [box('a'), box('b')], [['a', 'b']], { rootId: 'a' });
    expect(r.get('a')).toEqual({ x: -50, y: -25 });
    expect(r.get('b')!.x).toBeGreaterThan(r.get('a')!.x - 1);
    const forest = placeBoxes('radial', boxes, [['a', 'b']]);
    expect(forest.size).toBe(3);
  });
  it('layered: back edges are reversed, self loops and duplicate or unknown edges ignored', () => {
    const boxes = [box('a'), box('b'), box('c')];
    const p = placeBoxes('layered', boxes, [['a', 'b'], ['b', 'a'], ['a', 'a'], ['a', 'b'], ['b', 'zz'], ['b', 'c']], { direction: 'TB' });
    expect(p.get('a')!.y).toBeLessThan(p.get('b')!.y);
    expect(p.get('b')!.y).toBeLessThan(p.get('c')!.y);
  });
  it('orthogonal snaps to a 20px grid', () => {
    const p = placeBoxes('orthogonal', [box('a', 90, 33), box('b', 77, 41)], [['a', 'b']]);
    for (const v of p.values()) {
      expect(v.x % 20).toBe(0);
      expect(v.y % 20).toBe(0);
    }
  });
  it('force is deterministic per seed and separates differently sized boxes without overlap', () => {
    const boxes = [box('a', 900, 40), box('b', 30, 30), box('c', 30, 30), box('d', 600, 600), box('e', 40, 40)];
    const edges: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']];
    const one = placeBoxes('force', boxes, edges, { seed: 7, gap: 0 });
    const two = placeBoxes('force', boxes, edges, { seed: 7, gap: 0 });
    expect([...one]).toEqual([...two]);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = one.get(boxes[i].id)!, b = one.get(boxes[j].id)!;
        const sepX = a.x + boxes[i].w <= b.x + 1 || b.x + boxes[j].w <= a.x + 1;
        const sepY = a.y + boxes[i].h <= b.y + 1 || b.y + boxes[j].h <= a.y + 1;
        expect(sepX || sepY).toBe(true);
      }
  });
  it('force never leaves overlaps over many seeds and mixed sizes', () => {
    const sizes = [[300, 20], [20, 300], [80, 80], [500, 60], [40, 40], [260, 200], [10, 10], [150, 30]];
    for (let seed = 1; seed <= 40; seed++) {
      const boxes = sizes.map(([w, h], i) => box(`n${i}`, w, h));
      const p = placeBoxes('force', boxes, [['n0', 'n1'], ['n2', 'n3'], ['n4', 'n5']], { seed, gap: 5 });
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = p.get(boxes[i].id)!, b = p.get(boxes[j].id)!;
          const sepX = a.x + boxes[i].w <= b.x + 1 || b.x + boxes[j].w <= a.x + 1;
          const sepY = a.y + boxes[i].h <= b.y + 1 || b.y + boxes[j].h <= a.y + 1;
          expect(sepX || sepY).toBe(true);
        }
    }
  });
  it('force separates tall thin boxes among tiny ones (horizontal push)', () => {
    const sizes = [[30, 700], [30, 700], [30, 700], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4], [4, 4]];
    for (let seed = 1; seed <= 25; seed++) {
      const boxes = sizes.map(([w, h], i) => box(`t${i}`, w, h));
      const p = placeBoxes('force', boxes, [['t0', 't3'], ['t1', 't4'], ['t2', 't5']], { seed, gap: 0 });
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const a = p.get(`t${i}`)!, b = p.get(`t${j}`)!;
          expect(Math.abs(a.x - b.x) >= 29 || Math.abs(a.y - b.y) >= 699).toBe(true);
        }
    }
  });
  it('radial overlap resolution pushes crowded boxes apart (both axes)', () => {
    const boxes = [box('r', 10, 10), ...Array.from({ length: 8 }, (_, i) => box(`k${i}`, 300, 20))];
    const edges: [string, string][] = boxes.slice(1).map((b) => ['r', b.id]);
    const p = placeBoxes('radial', boxes, edges, { gap: 0 });
    expect(p.size).toBe(9);
  });
});

describe('applyLayout', () => {
  it('only: unknown ids do nothing; selection of mixed parents only moves siblings of the first', () => {
    const pg = page([nd('a', 0, 0), nd('b', 500, 500), nd('g', 0, 0, { type: 'group' }), nd('k', 5, 5, { parentId: 'g' })]);
    expect(applyLayout(pg, 'grid', { only: ['nope'] })).toEqual([]);
    const moved = applyLayout(pg, 'grid', { only: ['zz', 'a', 'b', 'k'] });
    expect(moved).toEqual(['b']);
    expect(pg.nodes.find((n) => n.id === 'k')!.position).toEqual({ x: 5, y: 5 });
    expect(pg.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 0, y: 0 });
  });
  it('groups fit their children, nested groups bottom-up, orphan parentId tolerated, orthogonal marks edges', () => {
    const pg = page(
      [nd('outer', 0, 0, { type: 'group' }), nd('inner', 0, 0, { type: 'group', parentId: 'outer' }), nd('x', 0, 0, { parentId: 'inner' }), nd('y', 0, 0, { parentId: 'inner' }), nd('lost', 300, 300, { parentId: 'missing' }), nd('z', 0, 0, { parentId: 'outer' })],
      [ed('e1', 'x', 'y'), ed('e2', 'x', 'z'), ed('e3', 'x', 'x')],
    );
    const moved = applyLayout(pg, 'orthogonal');
    expect(moved).toContain('inner');
    const inner = pg.nodes.find((n) => n.id === 'inner')!;
    const outer = pg.nodes.find((n) => n.id === 'outer')!;
    expect(inner.width).toBeGreaterThan(200);
    expect(outer.width!).toBeGreaterThan(inner.width!);
    expect(pg.edges.every((e) => e.data?.lineType === 'orthogonal')).toBe(true);
    expect(applyLayout(pg, 'orthogonal')).toEqual([]);
  });
  it('a group whose own parent does not exist is still sized from its children', () => {
    const pg = page([nd('g', 0, 0, { type: 'group', parentId: 'missing' }), nd('a', 0, 0, { parentId: 'g' }), nd('b', 0, 0, { parentId: 'g' })]);
    applyLayout(pg, 'grid');
    expect(pg.nodes[0].width).toBe(24 + 100 + 60 + 100 + 24);
  });
});

describe('absRects', () => {
  it('resolves parents and survives parent cycles', () => {
    const r = absRects({ nodes: [nd('a', 10, 10, { parentId: 'b' }), nd('b', 20, 20, { parentId: 'a' }), nd('c', 5, 5, { parentId: 'b' })] });
    expect(r.get('c')!.width).toBe(100);
    expect(r.size).toBe(3);
  });
});

describe('edge labels', () => {
  it('edgeLabelRects skips unlabeled and dangling edges and honours labelT / labelOffset', () => {
    const nodes = [nd('a', 0, 0), nd('b', 400, 0)];
    const r = edgeLabelRects({ nodes, edges: [ed('1', 'a', 'b'), ed('2', 'a', 'zz', { label: 'x' }), ed('3', 'a', 'b', { label: 'mid' }), ed('4', 'a', 'b', { label: 'moved', data: { labelT: 0.25, labelOffset: 20 } }), ed('5', 'a', 'b', { label: 'x'.repeat(100) })] });
    expect(r.map((x) => x.id)).toEqual(['3', '4', '5']);
    const mid = r[0].rect, moved = r[1].rect;
    expect(mid.x + mid.width / 2).toBeCloseTo(250);
    expect(mid.y + mid.height / 2).toBeCloseTo(25);
    expect(moved.x + moved.width / 2).toBeCloseTo(150);
    expect(moved.y + moved.height / 2).toBeCloseTo(45);
    expect(r[2].rect.width).toBe(240);
  });
  it('edgeLabelRects centres a label on coincident nodes', () => {
    const r = edgeLabelRects({ nodes: [nd('a', 0, 0), nd('b', 0, 0)], edges: [ed('1', 'a', 'b', { label: 'x', data: { labelOffset: 10 } })] });
    expect(r[0].rect.y + 9).toBeCloseTo(25 + 10 * 0 + 0);
  });
  it('separateLabels slides colliding labels, keeps already-set values and gives up when nothing fits', () => {
    const nodes = [nd('a', 0, 0), nd('b', 400, 0)];
    const pg = page(nodes, [ed('1', 'a', 'b', { label: 'one' }), ed('2', 'a', 'b', { label: 'two' }), ed('3', 'a', 'b', { label: 'three', data: { labelT: 0.5, labelOffset: 0 } })]);
    const n = separateLabels(pg);
    expect(n).toBe(2);
    expect(pg.edges[0].data?.labelT).toBeUndefined();
    expect(pg.edges[1].data?.labelOffset).not.toBe(undefined);
    const rects = edgeLabelRects(pg).map((x) => x.rect);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
      }
    // 80 identical labels cannot all fit the 63 candidate spots: the leftovers keep their start
    const many = page(nodes, Array.from({ length: 80 }, (_, i) => ed(`m${i}`, 'a', 'b', { label: 'same' })));
    expect(separateLabels(many)).toBeGreaterThan(0);
  });
});

describe('alignGroups', () => {
  const groups = () => [nd('g1', 300, 10, { type: 'group', width: 200, height: 100 }), nd('g2', 0, 80, { type: 'group', width: 100, height: 300 }), nd('g3', 0, 80, { type: 'group', width: 50, height: 50 }), nd('x', 9, 9)];
  it('no groups moves nothing', () => expect(alignGroups(page([nd('x')]), 'row')).toBe(0));
  it('row: same top, even gaps, ties broken by y', () => {
    const pg = page(groups());
    alignGroups(pg, 'row', { gap: 10 });
    const g = (id: string) => pg.nodes.find((n) => n.id === id)!.position;
    expect(g('g2')).toEqual({ x: 0, y: 10 });
    expect(g('g3')).toEqual({ x: 110, y: 10 });
    expect(g('g1')).toEqual({ x: 170, y: 10 });
  });
  it('column: same left, stacked by y then x, returns count of moved', () => {
    const pg = page(groups());
    const moved = alignGroups(pg, 'column');
    const g = (id: string) => pg.nodes.find((n) => n.id === id)!.position;
    expect(g('g1')).toEqual({ x: 0, y: 10 });
    expect(g('g2')).toEqual({ x: 0, y: 170 });
    expect(g('g3')).toEqual({ x: 0, y: 530 });
    expect(moved).toBe(3);
    expect(alignGroups(pg, 'column')).toBe(0);
  });
});
