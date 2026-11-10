import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { arrangeNodes, detectAlgo, naturalDirection, DEFAULT_ARRANGE, SPACING } from './engine';
import { nodeSize } from '../graph';

const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}, data: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type: 'icon', position: { x, y }, width: 120, height: 96, data: { label: id, ...data }, ...extra }) as DiagramNode;
const e = (id: string, source: string, target: string, data: Record<string, unknown> = {}): DiagramEdge => ({ id, source, target, data }) as DiagramEdge;
const pos = (res: ReturnType<typeof arrangeNodes>, id: string) => res.get(id)!;

describe('detectAlgo / natural direction', () => {
  it('picks erd, uml, layered, grid', () => {
    const t = (id: string) => n(id, 0, 0, { type: 'table' });
    const c = (id: string) => n(id, 0, 0, { type: 'class' });
    expect(detectAlgo([t('a'), t('b'), n('c')], [])).toBe('erd');
    expect(detectAlgo([c('a'), c('b'), n('c')], [])).toBe('uml');
    expect(detectAlgo([n('a'), n('b')], [e('1', 'a', 'b')])).toBe('layered');
    expect(detectAlgo([n('a'), n('b')], [])).toBe('grid');
    expect(detectAlgo([n('g', 0, 0, { type: 'group' }), n('a')], [])).toBe('grid');
    expect(naturalDirection('uml')).toBe('TB');
    expect(naturalDirection('tree')).toBe('TB');
    expect(naturalDirection('layered')).toBe('LR');
    expect(DEFAULT_ARRANGE.snap).toBe(20);
    expect(SPACING.roomy.along).toBeGreaterThan(SPACING.compact.along);
  });
});

describe('algorithms', () => {
  const nodes = ['r', 'a', 'b', 'c', 'd', 'e'].map((id) => n(id, 3, 3));
  const edges = [e('1', 'r', 'a'), e('2', 'r', 'b'), e('3', 'a', 'c'), e('4', 'a', 'd'), e('5', 'b', 'e'), e('6', 'c', 'r')];
  it('tree places children below parents (TB) and right of them (LR), centred over kids', () => {
    const tb = arrangeNodes(nodes, edges, { algo: 'tree', direction: 'TB', snap: 0 });
    expect(pos(tb, 'a').y).toBeGreaterThan(pos(tb, 'r').y);
    expect(pos(tb, 'c').y).toBeGreaterThan(pos(tb, 'a').y);
    const lr = arrangeNodes(nodes, edges, { algo: 'tree', direction: 'LR', snap: 0 });
    expect(pos(lr, 'a').x).toBeGreaterThan(pos(lr, 'r').x);
    expect(pos(tb, 'r').x).toBeGreaterThan(Math.min(pos(tb, 'a').x, pos(tb, 'b').x) - 1);
  });
  it('tree with a pure cycle still places everyone', () => {
    const cyc = [n('x', 1, 1), n('y', 1, 1), n('z', 1, 1)];
    const res = arrangeNodes(cyc, [e('1', 'x', 'y'), e('2', 'y', 'z'), e('3', 'z', 'x')], { algo: 'tree' });
    expect(res.size).toBeGreaterThanOrEqual(2);
  });
  it('grid arranges loose nodes in rows, reading order by position', () => {
    const loose = Array.from({ length: 7 }, (_, i) => n('n' + i, 5, 5 + i));
    const res = arrangeNodes(loose, [], { algo: 'grid' });
    const ys = new Set([...res.values()].map((p) => p.y));
    expect(ys.size).toBeGreaterThan(1);
    expect(pos(res, 'n6').y).toBeGreaterThanOrEqual(pos(res, 'n0').y);
  });
  it('star: a hub with many spokes gets a hub layout (LR and TB), strays join', () => {
    const star = ['hub', 's1', 's2', 's3', 's4', 's5', 'lone'].map((id) => n(id, 2, 2));
    const se = ['s1', 's2', 's3', 's4', 's5'].map((s, i) => e('e' + i, 'hub', s));
    const lr = arrangeNodes(star, se, { algo: 'layered', direction: 'LR' });
    expect(pos(lr, 's1').x).toBeGreaterThan(pos(lr, 'hub').x);
    expect(lr.has('lone')).toBe(true);
    const tb = arrangeNodes(star.slice(0, 6), se, { algo: 'layered', direction: 'TB' });
    expect(pos(tb, 's1').y).toBeGreaterThan(pos(tb, 'hub').y);
    const clique = ['a', 'b', 'c', 'd'].map((id) => n(id, 2, 2));
    const ce = [e('1', 'a', 'b'), e('2', 'a', 'c'), e('3', 'a', 'd'), e('4', 'b', 'c'), e('5', 'b', 'd'), e('6', 'c', 'd')];
    expect(arrangeNodes(clique, ce, { algo: 'layered' }).size).toBeGreaterThan(0);
    const weak = ['a', 'b', 'c', 'd', 'e'].map((id) => n(id, 2, 2));
    expect(arrangeNodes(weak, [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'c', 'd'), e('4', 'd', 'e')], { algo: 'layered' }).size).toBeGreaterThan(0);
  });
  it('erd orients by cardinality; uml puts parents above children', () => {
    const tables = ['u', 'o', 'i'].map((id) => n(id, 4, 4, { type: 'table' }));
    const erd = arrangeNodes(tables, [e('1', 'o', 'u', { relation: { cardinality: 'N:1' } }), e('2', 'u', 'i', { relation: { cardinality: '1:N' } }), e('3', 'o', 'i', {})], { algo: 'erd' });
    expect(pos(erd, 'u').x).toBeLessThan(pos(erd, 'o').x);
    const classes = ['base', 'child', 'other'].map((id) => n(id, 4, 4, { type: 'class' }));
    const uml = arrangeNodes(classes, [e('1', 'child', 'base', { uml: { kind: 'inheritance' } }), e('2', 'child', 'other', { uml: { kind: 'association' } })], { algo: 'uml' });
    expect(pos(uml, 'base').y).toBeLessThan(pos(uml, 'child').y);
    const auto = arrangeNodes(classes, [e('1', 'child', 'base', { uml: { kind: 'inheritance' } })], {});
    expect(pos(auto, 'base').y).toBeLessThan(pos(auto, 'child').y);
  });
});

describe('containers and selection', () => {
  const group = (id: string, extra: Partial<DiagramNode> = {}, data: Record<string, unknown> = {}) => n(id, 0, 0, { type: 'group', width: 100, height: 60, ...extra }, data);
  const child = (id: string, parentId: string, x = 5, y = 5) => n(id, x, y, { parentId });
  const doc = () => ({
    nodes: [group('g'), child('a', 'g'), child('b', 'g'), child('c', 'g'), n('x', 1, 1), n('y', 1, 1)],
    edges: [e('1', 'a', 'b'), e('2', 'b', 'c'), e('3', 'a', 'x'), e('4', 'x', 'y')],
  });
  it('page level: group grows to hold its arranged children; edges lift to the group', () => {
    const { nodes, edges } = doc();
    const res = arrangeNodes(nodes, edges, { algo: 'layered' });
    const g = pos(res, 'g');
    expect(g.width).toBeGreaterThan(100);
    expect(res.has('a')).toBe(true);
  });
  it('a lone container selection arranges its inside and settles ancestors / siblings', () => {
    const outer = group('outer', {}, {});
    const inner = { ...group('inner', { parentId: 'outer' }), position: { x: 10, y: 10 } };
    const kids = ['a', 'b', 'c'].map((id, i) => child(id, 'inner', 2, 2 + i));
    const sib = n('sib', 40, 40, { parentId: 'outer' });
    const nodes = [outer, inner, ...kids, sib];
    const res = arrangeNodes(nodes, [e('1', 'a', 'b'), e('2', 'b', 'c')], { algo: 'layered', selection: ['inner'] });
    expect(res.get('inner')?.width).toBeGreaterThan(0);
    expect(res.get('outer')?.width).toBeGreaterThan(100);
    expect(res.has('sib')).toBe(true);
  });
  it('multi selection: only chosen nodes move, per parent; covered descendants are skipped; ancestors grow', () => {
    const { nodes, edges } = doc();
    const res = arrangeNodes(nodes, edges, { algo: 'layered', selection: ['a', 'b'] });
    expect(res.has('a') || res.has('b')).toBe(true);
    expect(res.has('c')).toBe(false);
    const across = arrangeNodes(nodes, edges, { algo: 'layered', selection: ['x', 'y', 'g', 'a'] });
    expect(across.has('a')).toBe(false);
    const single = arrangeNodes(nodes, edges, { algo: 'layered', selection: ['x', 'nope'] });
    expect(single.size).toBe(0);
    expect(arrangeNodes(nodes, edges, { algo: 'layered', selection: ['nope'] }).size).toBeGreaterThan(0);
  });
  it('locked containers and descendants stay; collapsed / autoLayout containers are not opened', () => {
    const nodes = [group('g', {}, { locked: true }), child('a', 'g'), child('b', 'g'), group('h', {}, { collapsed: true }), child('c', 'h'), group('k', {}, { autoLayout: true }), child('d', 'k'), n('free', 1, 1)];
    const res = arrangeNodes(nodes, [e('1', 'free', 'a')], { algo: 'layered' });
    expect(res.has('g')).toBe(false);
    expect(res.has('a')).toBe(false);
    expect(res.has('c')).toBe(false);
    const lone = arrangeNodes(nodes, [], { algo: 'layered', selection: ['g'] });
    expect(lone.size).toBe(0);
  });
  it('hidden nodes are ignored; clusters keep generated profile interiors and order lead roles first', () => {
    const cluster = n('cl', 0, 0, { type: 'cluster', width: 100, height: 60 }, {});
    const profiled = n('pcl', 300, 0, { type: 'cluster', width: 100, height: 60 }, { profileId: 'pg' });
    const kids = [n('w1', 1, 1, { parentId: 'cl' }, { role: 'worker' }), n('w2', 1, 1, { parentId: 'cl' }, { role: 'primary' }), n('hid', 1, 1, { parentId: 'cl', hidden: true } as never), n('w3', 1, 1, { parentId: 'cl' }, { hidden: true })];
    const pk = [n('p1', 5, 5, { parentId: 'pcl' }), n('p2', 5, 5, { parentId: 'pcl' })];
    const res = arrangeNodes([cluster, profiled, ...kids, ...pk], [], { algo: 'grid' });
    expect(res.has('hid')).toBe(false);
    expect(res.has('w3')).toBe(false);
    expect(res.has('p1')).toBe(false);
    const inside = arrangeNodes([cluster, ...kids], [], { algo: 'grid', selection: ['cl'] });
    expect(pos(inside, 'w2').x).toBeLessThanOrEqual(pos(inside, 'w1').x);
  });
  it('no snap keeps integer positions; unmoved results are not reported', () => {
    const a = [n('a', 0, 0), n('b', 400, 0)];
    const res = arrangeNodes(a, [e('1', 'a', 'b')], { algo: 'layered', snap: 0 });
    for (const p of res.values()) expect(Number.isInteger(p.x)).toBe(true);
    const placed = a.map((x) => ({ ...x, position: { x: pos(res, x.id)?.x ?? x.position.x, y: pos(res, x.id)?.y ?? x.position.y } }));
    expect(arrangeNodes(placed, [e('1', 'a', 'b')], { algo: 'layered', snap: 0 }).size).toBe(0);
    expect(nodeSize(a[0])).toEqual({ width: 120, height: 96 });
  });
  it('empty input', () => {
    expect(arrangeNodes([], []).size).toBe(0);
  });
});
