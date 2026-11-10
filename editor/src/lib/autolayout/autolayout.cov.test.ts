import { describe, expect, it } from 'vitest';
import type { AutoLayoutConfig, DiagramNode } from '../../types';
import { computeAutoLayout, DEFAULT_AUTOLAYOUT, dropIndex, reflowAll, reorderChild, setAutoLayout, wrapInAutoLayout, applyAutoLayout } from './autolayout';

const cfg = (o: Partial<AutoLayoutConfig> = {}): AutoLayoutConfig => ({ ...DEFAULT_AUTOLAYOUT, gap: 10, padding: 10, ...o });
const it_ = (id: string, w = 50, h = 30, sizing?: { w?: 'fill'; h?: 'fill' }) => ({ id, width: w, height: h, ...(sizing ? { sizing } : {}) });
const box = { width: 300, height: 200 };

describe('computeAutoLayout: rows & columns', () => {
  it('empty container hugs or keeps size', () => {
    expect(computeAutoLayout(cfg(), box, [])).toMatchObject({ width: 20, height: 20 });
    expect(computeAutoLayout(cfg({ hugW: false, hugH: false }), box, [])).toMatchObject({ width: 300, height: 200 });
  });
  it('row hug: positions in sequence, container sized to content', () => {
    const r = computeAutoLayout(cfg(), box, [it_('a'), it_('b', 60, 40)]);
    expect(r.positions.get('a')).toEqual({ x: 10, y: 10 });
    expect(r.positions.get('b')).toEqual({ x: 70, y: 10 });
    expect(r).toMatchObject({ width: 140, height: 60 });
  });
  it('align center/end/stretch on the cross axis', () => {
    const items = [it_('a', 50, 20), it_('b', 50, 40)];
    expect(computeAutoLayout(cfg({ align: 'center' }), box, items).positions.get('a')!.y).toBe(20);
    expect(computeAutoLayout(cfg({ align: 'end' }), box, items).positions.get('a')!.y).toBe(30);
    const st = computeAutoLayout(cfg({ align: 'stretch' }), box, items);
    expect(st.sizes.get('a')!.height).toBe(40);
  });
  it('column mode with fixed container: justify center/end/between and fill', () => {
    const items = [it_('a', 50, 30), it_('b', 50, 30)];
    const fixed = (j: AutoLayoutConfig['justify']) => computeAutoLayout(cfg({ mode: 'column', hugW: false, hugH: false, justify: j }), box, items);
    expect(fixed('start').positions.get('a')!.y).toBe(10);
    expect(fixed('center').positions.get('a')!.y).toBeGreaterThan(10);
    expect(fixed('end').positions.get('a')!.y).toBeGreaterThan(fixed('center').positions.get('a')!.y);
    const bt = fixed('between');
    expect(bt.positions.get('b')!.y).toBe(200 - 10 - 30);
    expect(fixed('between').width).toBe(300);
    const single = computeAutoLayout(cfg({ mode: 'column', hugW: false, hugH: false, justify: 'between' }), box, [it_('a')]);
    expect(single.positions.get('a')!.y).toBe(10);
  });
  it('fill sizing shares the free main space, honours the minimum, and cross fill', () => {
    const r = computeAutoLayout(cfg({ hugW: false, hugH: false }), box, [it_('a', 50, 30, { w: 'fill' }), it_('b', 50, 30, { w: 'fill', h: 'fill' }), it_('c', 40, 30)]);
    expect(r.sizes.get('a')!.width).toBe((300 - 20 - 40 - 20) / 2);
    expect(r.sizes.get('b')!.height).toBe(180);
    const tiny = computeAutoLayout(cfg({ hugW: false, hugH: false }), { width: 60, height: 60 }, [it_('a', 50, 30, { w: 'fill' }), it_('b', 50, 30)]);
    expect(tiny.sizes.get('a')!.width).toBe(20);
    const hugged = computeAutoLayout(cfg(), box, [it_('a', 50, 30, { w: 'fill' })]);
    expect(hugged.sizes.get('a')!.width).toBe(50);
    const col = computeAutoLayout(cfg({ mode: 'column', hugW: false, hugH: false }), box, [it_('a', 50, 30, { h: 'fill', w: 'fill' })]);
    expect(col.sizes.get('a')).toEqual({ width: 280, height: 180 });
    const fixedCross = computeAutoLayout(cfg({ hugH: false, hugW: true }), box, [it_('a')]);
    expect(fixedCross.height).toBe(200);
    expect(computeAutoLayout(cfg({ mode: 'column', hugW: true, hugH: false }), box, [it_('a')])).toMatchObject({ width: 70, height: 200 });
  });
});

describe('computeAutoLayout: grid', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => it_(id, 40 + i * 10, 30 + i * 5));
  it('lays out in columns with gapY, defaulting to 3 columns', () => {
    const r = computeAutoLayout(cfg({ mode: 'grid', gapY: 20 }), box, items);
    expect(r.positions.get('d')!.x).toBe(10);
    expect(r.positions.get('d')!.y).toBeGreaterThan(r.positions.get('a')!.y);
    const two = computeAutoLayout(cfg({ mode: 'grid', columns: 2.7 }), box, items);
    expect(two.positions.get('c')!.x).toBe(10);
    expect(computeAutoLayout(cfg({ mode: 'grid', columns: 0 }), box, items).positions.get('b')!.x).toBe(10);
  });
  it('align and stretch in cells', () => {
    const c = computeAutoLayout(cfg({ mode: 'grid', align: 'center' }), box, items);
    expect(c.positions.get('a')!.x).toBeGreaterThan(10);
    const e = computeAutoLayout(cfg({ mode: 'grid', align: 'end' }), box, items);
    expect(e.positions.get('a')!.x).toBeGreaterThan(c.positions.get('a')!.x);
    const s = computeAutoLayout(cfg({ mode: 'grid', align: 'stretch' }), box, items);
    expect(s.sizes.get('a')!.width).toBe(s.sizes.get('d')!.width);
  });
  it('fill in a fixed grid splits the container evenly; hugging ignores fill', () => {
    const fill = [it_('a', 10, 10, { w: 'fill', h: 'fill' }), it_('b', 10, 10), it_('c', 10, 10), it_('d', 10, 10)];
    const r = computeAutoLayout(cfg({ mode: 'grid', columns: 2, hugW: false, hugH: false }), box, fill);
    expect(r.sizes.get('a')).toEqual({ width: (300 - 20 - 10) / 2, height: (200 - 20 - 10) / 2 });
    expect(r).toMatchObject({ width: 300, height: 200 });
    const tiny = computeAutoLayout(cfg({ mode: 'grid', columns: 2, hugW: false, hugH: false }), { width: 10, height: 10 }, fill);
    expect(tiny.sizes.get('a')!.width).toBe(20);
    const hug = computeAutoLayout(cfg({ mode: 'grid', columns: 2 }), box, fill);
    expect(hug.sizes.get('a')).toEqual({ width: 10, height: 10 });
  });
});

const nd = (id: string, extra: Partial<DiagramNode> = {}, data: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type: 'card', position: { x: 0, y: 0 }, width: 50, height: 30, data: { label: id, ...data }, ...extra }) as DiagramNode;

describe('apply to node lists', () => {
  const group = (c: AutoLayoutConfig = cfg()) => nd('g', { type: 'group', width: 10, height: 10 }, { autoLayout: c });
  it('applyAutoLayout positions and resizes; no change returns the same array; missing config is a no-op', () => {
    const nodes = [group(), nd('a', { parentId: 'g' }), nd('b', { parentId: 'g' }), nd('h', { parentId: 'g' }, { hidden: true }), nd('i', { parentId: 'g' }, { layoutAbsolute: true }), nd('out')];
    const out = applyAutoLayout(nodes, 'g');
    expect(out.find((n) => n.id === 'b')!.position).toEqual({ x: 70, y: 10 });
    expect(out.find((n) => n.id === 'g')!.width).toBe(130);
    expect(out.find((n) => n.id === 'h')!.position).toEqual({ x: 0, y: 0 });
    expect(applyAutoLayout(out, 'g')).toBe(out);
    expect(applyAutoLayout(nodes, 'zz')).toBe(nodes);
    expect(applyAutoLayout([nd('x')], 'x')).toEqual([nd('x')]);
  });
  it('children resize under stretch / fill', () => {
    const nodes = [group(cfg({ align: 'stretch' })), nd('a', { parentId: 'g', height: 20 }), nd('b', { parentId: 'g', height: 60 })];
    const out = applyAutoLayout(nodes, 'g');
    expect(out.find((n) => n.id === 'a')!.height).toBe(60);
    expect(out.find((n) => n.id === 'a')!.style).toMatchObject({ height: 60 });
    const plain = [group(), { ...nd('a', { parentId: 'g' }), style: undefined }];
    expect(applyAutoLayout(plain as DiagramNode[], 'g').find((n) => n.id === 'g')!.style).toMatchObject({ width: 70 });
  });
  it('reflowAll: none; nested inner first', () => {
    const plain = [nd('a')];
    expect(reflowAll(plain)).toBe(plain);
    const nodes = [
      nd('outer', { type: 'group' }, { autoLayout: cfg() }),
      nd('inner', { type: 'group', parentId: 'outer' }, { autoLayout: cfg({ mode: 'column' }) }),
      nd('a', { parentId: 'inner' }), nd('b', { parentId: 'inner' }),
    ];
    const out = reflowAll(nodes);
    expect(out.find((n) => n.id === 'inner')!.height).toBe(30 + 30 + 10 + 20);
    expect(out.find((n) => n.id === 'outer')!.height).toBe(out.find((n) => n.id === 'inner')!.height! + 20);
  });
  it('setAutoLayout turns it on (reflow) and off (config removed)', () => {
    const nodes = [nd('g', { type: 'group' }), nd('a', { parentId: 'g' }), nd('b', { parentId: 'g' })];
    const on = setAutoLayout(nodes, 'g', cfg());
    expect(on.find((n) => n.id === 'b')!.position.x).toBe(70);
    const off = setAutoLayout(on, 'g', null);
    expect(off.find((n) => n.id === 'g')!.data.autoLayout).toBeUndefined();
    expect(off.find((n) => n.id === 'other')).toBeUndefined();
  });
  it('wrapInAutoLayout groups, keeps visual order along the axis, and fails on bad selections', () => {
    const nodes = [nd('a', { position: { x: 100, y: 0 } }), nd('b', { position: { x: 0, y: 50 } }), nd('c', { position: { x: 300, y: 300 } })];
    const row = wrapInAutoLayout(nodes, ['a', 'b'], 'grp')!;
    const order = row.nodes.filter((n) => n.parentId === 'grp').map((n) => n.id);
    expect(order).toEqual(['b', 'a']);
    expect(row.nodes.find((n) => n.id === 'grp')!.data.autoLayout).toBeDefined();
    const col = wrapInAutoLayout(nodes, ['a', 'b'], 'grp', { mode: 'column' })!;
    expect(col.nodes.filter((n) => n.parentId === 'grp').map((n) => n.id)).toEqual(['a', 'b']);
    expect(wrapInAutoLayout(nodes, [], 'grp')).toBeNull();
  });
});

describe('dropIndex / reorderChild', () => {
  const rects = [{ x: 0, y: 0, width: 50, height: 30 }, { x: 60, y: 0, width: 50, height: 30 }, { x: 120, y: 0, width: 50, height: 30 }];
  it('row & column', () => {
    expect(dropIndex(cfg(), rects, { x: -5, y: 0 })).toBe(0);
    expect(dropIndex(cfg(), rects, { x: 90, y: 0 })).toBe(2);
    expect(dropIndex(cfg(), rects, { x: 999, y: 0 })).toBe(3);
    const stacked = rects.map((r, i) => ({ ...r, x: 0, y: i * 40 }));
    expect(dropIndex(cfg({ mode: 'column' }), stacked, { x: 0, y: 50 })).toBe(1);
  });
  it('grid picks the nearest cell and the side of it', () => {
    expect(dropIndex(cfg({ mode: 'grid' }), rects, { x: 10, y: 0 })).toBe(0);
    expect(dropIndex(cfg({ mode: 'grid' }), rects, { x: 40, y: 0 })).toBe(1);
    expect(dropIndex(cfg({ mode: 'grid' }), rects, { x: 500, y: 0 })).toBe(3);
    expect(dropIndex(cfg({ mode: 'grid' }), [], { x: 0, y: 0 })).toBe(0);
  });
  it('reorderChild moves among siblings; no parent is a no-op; end and empty-siblings cases', () => {
    const nodes = [nd('g', { type: 'group' }), nd('a', { parentId: 'g' }), nd('b', { parentId: 'g' }), nd('c', { parentId: 'g' }), nd('z')];
    const ids = (ns: DiagramNode[]) => ns.map((n) => n.id).join('');
    expect(ids(reorderChild(nodes, 'c', 0))).toBe('gcabz');
    expect(ids(reorderChild(nodes, 'a', 99))).toBe('gbcaz');
    expect(ids(reorderChild(nodes, 'a', -4))).toBe('gabcz');
    expect(reorderChild(nodes, 'z', 0)).toBe(nodes);
    expect(reorderChild(nodes, 'nope', 0)).toBe(nodes);
    const only = [nd('g', { type: 'group' }), nd('a', { parentId: 'g' }), nd('z')];
    expect(ids(reorderChild(only, 'a', 3))).toBe('gaz');
  });
});
