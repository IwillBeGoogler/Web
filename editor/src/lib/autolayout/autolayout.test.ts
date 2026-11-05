import { describe, expect, it } from 'vitest';
import type { AutoLayoutConfig, DiagramNode } from '../../types';
import { applyAutoLayout, computeAutoLayout, dropIndex, reflowAll, reorderChild, setAutoLayout, wrapInAutoLayout, DEFAULT_AUTOLAYOUT } from './autolayout';

const cfg = (o: Partial<AutoLayoutConfig> = {}): AutoLayoutConfig => ({ ...DEFAULT_AUTOLAYOUT, mode: 'row', gap: 10, padding: 20, align: 'start', justify: 'start', hugW: true, hugH: true, ...o });
const item = (id: string, width: number, height: number, sizing?: { w: 'fixed' | 'fill' | 'hug'; h: 'fixed' | 'fill' | 'hug' }) => ({ id, width, height, sizing });

describe('computeAutoLayout: row', () => {
  it('lays children left to right with gap and padding; a hugging container wraps them', () => {
    const r = computeAutoLayout(cfg(), { width: 0, height: 0 }, [item('a', 100, 40), item('b', 60, 80)]);
    expect(r.positions.get('a')).toEqual({ x: 20, y: 20 });
    expect(r.positions.get('b')).toEqual({ x: 130, y: 20 });
    expect(r).toMatchObject({ width: 20 + 100 + 10 + 60 + 20, height: 20 + 80 + 20 });
  });
  it('cross-axis alignment: center and end', () => {
    const c = computeAutoLayout(cfg({ align: 'center' }), { width: 0, height: 0 }, [item('a', 50, 40), item('b', 50, 80)]);
    expect(c.positions.get('a')!.y).toBe(40);
    const e = computeAutoLayout(cfg({ align: 'end' }), { width: 0, height: 0 }, [item('a', 50, 40), item('b', 50, 80)]);
    expect(e.positions.get('a')!.y).toBe(60);
  });
  it('stretch makes children as tall as the content area', () => {
    const r = computeAutoLayout(cfg({ align: 'stretch' }), { width: 0, height: 0 }, [item('a', 50, 40), item('b', 50, 80)]);
    expect(r.sizes.get('a')).toEqual({ width: 50, height: 80 });
  });
  it('fixed container: fill children share the free width equally; justify moves the rest', () => {
    const r = computeAutoLayout(cfg({ hugW: false, hugH: false }), { width: 400, height: 100 }, [item('a', 50, 40), item('b', 10, 40, { w: 'fill', h: 'fixed' }), item('c', 10, 40, { w: 'fill', h: 'fixed' })]);
    // inner 360 - fixed 50 - 2 gaps 20 = 290 -> 145 each
    expect(r.sizes.get('b')!.width).toBe(145);
    expect(r.positions.get('c')!.x).toBe(20 + 50 + 10 + 145 + 10);
    const mid = computeAutoLayout(cfg({ hugW: false, hugH: false, justify: 'center' }), { width: 400, height: 100 }, [item('a', 100, 40), item('b', 100, 40)]);
    expect(mid.positions.get('a')!.x).toBe(20 + (360 - 210) / 2);
    const between = computeAutoLayout(cfg({ hugW: false, hugH: false, justify: 'between', gap: 0 }), { width: 400, height: 100 }, [item('a', 100, 40), item('b', 100, 40)]);
    expect(between.positions.get('b')!.x).toBe(20 + 360 - 100);
  });
  it('a fill child inside a hugging container keeps its own size (no circular sizing)', () => {
    const r = computeAutoLayout(cfg(), { width: 0, height: 0 }, [item('a', 80, 40, { w: 'fill', h: 'fixed' })]);
    expect(r.sizes.get('a')!.width).toBe(80);
    expect(r.width).toBe(120);
  });
  it('an empty container keeps a padding-sized box', () => {
    expect(computeAutoLayout(cfg(), { width: 0, height: 0 }, [])).toMatchObject({ width: 40, height: 40 });
  });
});

describe('computeAutoLayout: column and grid', () => {
  it('column stacks top to bottom', () => {
    const r = computeAutoLayout(cfg({ mode: 'column' }), { width: 0, height: 0 }, [item('a', 100, 40), item('b', 60, 30)]);
    expect(r.positions.get('b')).toEqual({ x: 20, y: 70 });
    expect(r).toMatchObject({ width: 140, height: 20 + 40 + 10 + 30 + 20 });
  });
  it('grid: columns take the widest child, rows the tallest, gapY defaults to gap', () => {
    const r = computeAutoLayout(cfg({ mode: 'grid', columns: 2 }), { width: 0, height: 0 }, [item('a', 100, 40), item('b', 60, 50), item('c', 80, 30)]);
    expect(r.positions.get('b')).toEqual({ x: 20 + 100 + 10, y: 20 });
    expect(r.positions.get('c')).toEqual({ x: 20, y: 20 + 50 + 10 });
    expect(r).toMatchObject({ width: 20 + 100 + 10 + 60 + 20, height: 20 + 50 + 10 + 30 + 20 });
    const g = computeAutoLayout(cfg({ mode: 'grid', columns: 2, gapY: 30 }), { width: 0, height: 0 }, [item('a', 10, 10), item('b', 10, 10), item('c', 10, 10)]);
    expect(g.positions.get('c')!.y).toBe(20 + 10 + 30);
  });
  it('grid in a fixed container with fill children divides the width into equal cells', () => {
    const r = computeAutoLayout(cfg({ mode: 'grid', columns: 2, hugW: false }), { width: 410, height: 0 }, [item('a', 10, 20, { w: 'fill', h: 'fixed' }), item('b', 10, 20, { w: 'fill', h: 'fixed' })]);
    expect(r.sizes.get('a')!.width).toBe(180);
    expect(r.positions.get('b')!.x).toBe(20 + 180 + 10);
  });
});

const box = (id: string, parentId: string | undefined, w: number, h: number, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type: 'card', position: { x: 999, y: 999 }, width: w, height: h, data: { label: id }, ...(parentId ? { parentId } : {}), ...extra }) as DiagramNode;
const container = (id: string, c: AutoLayoutConfig, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type: 'group', position: { x: 0, y: 0 }, width: 10, height: 10, data: { label: id, autoLayout: c }, ...extra }) as DiagramNode;

describe('applyAutoLayout / reflowAll', () => {
  it('positions children relative to the container and resizes a hugging container', () => {
    const out = applyAutoLayout([container('g', cfg()), box('a', 'g', 100, 40), box('b', 'g', 60, 80)], 'g');
    const g = out.find((n) => n.id === 'g')!;
    expect(g.width).toBe(210);
    expect(g.height).toBe(120);
    expect(out.find((n) => n.id === 'b')!.position).toEqual({ x: 130, y: 20 });
  });
  it('children reflow when one is removed, added or resized', () => {
    let nodes = reflowAll([container('g', cfg()), box('a', 'g', 100, 40), box('b', 'g', 60, 40), box('c', 'g', 60, 40)]);
    expect(nodes.find((n) => n.id === 'c')!.position.x).toBe(20 + 100 + 10 + 60 + 10);
    nodes = reflowAll(nodes.filter((n) => n.id !== 'b'));
    expect(nodes.find((n) => n.id === 'c')!.position.x).toBe(130);
    nodes = reflowAll([...nodes, box('d', 'g', 30, 30)]);
    expect(nodes.find((n) => n.id === 'd')!.position.x).toBe(20 + 100 + 10 + 60 + 10);
    nodes = reflowAll(nodes.map((n) => (n.id === 'a' ? { ...n, width: 200 } : n)));
    expect(nodes.find((n) => n.id === 'c')!.position.x).toBe(20 + 200 + 10);
  });
  it('nested containers reflow inside-out', () => {
    const nodes = reflowAll([
      container('outer', cfg({ mode: 'column' })),
      container('inner', cfg(), { parentId: 'outer' }),
      box('a', 'inner', 100, 40), box('b', 'inner', 100, 40),
      box('c', 'outer', 50, 50),
    ]);
    expect(nodes.find((n) => n.id === 'inner')!.width).toBe(20 + 100 + 10 + 100 + 20);
    expect(nodes.find((n) => n.id === 'c')!.position.y).toBe(20 + 80 + 10);
    expect(nodes.find((n) => n.id === 'outer')!.width).toBe(20 + 250 + 20);
  });
  it('returns the same array when nothing changes', () => {
    const once = reflowAll([container('g', cfg()), box('a', 'g', 100, 40)]);
    expect(reflowAll(once)).toBe(once);
  });
  it('hidden layers and absolutely positioned children are left alone', () => {
    const nodes = reflowAll([container('g', cfg()), box('a', 'g', 100, 40), box('h', 'g', 500, 500, { data: { label: 'h', hidden: true } }), box('x', 'g', 20, 20, { data: { label: 'x', layoutAbsolute: true } })]);
    expect(nodes.find((n) => n.id === 'g')!.width).toBe(140);
    expect(nodes.find((n) => n.id === 'x')!.position).toEqual({ x: 999, y: 999 });
  });
  it('works for cards, stickies and icons alike', () => {
    const kids = ['card', 'sticky', 'icon'].map((t, i) => box(`k${i}`, 'g', 80, 60, { type: t as never }));
    const nodes = reflowAll([container('g', cfg({ mode: 'grid', columns: 3 })), ...kids]);
    expect(nodes.filter((n) => n.parentId === 'g').map((n) => n.position.x)).toEqual([20, 110, 200]);
  });
});

describe('reorder inside a container', () => {
  it('dropIndex finds the insertion slot along the main axis', () => {
    const rects = [{ x: 20, y: 20, width: 100, height: 40 }, { x: 130, y: 20, width: 100, height: 40 }];
    expect(dropIndex(cfg(), rects, { x: 10, y: 30 })).toBe(0);
    expect(dropIndex(cfg(), rects, { x: 140, y: 30 })).toBe(1);
    expect(dropIndex(cfg(), rects, { x: 400, y: 30 })).toBe(2);
    const col = [{ x: 20, y: 20, width: 100, height: 40 }, { x: 20, y: 70, width: 100, height: 40 }];
    expect(dropIndex(cfg({ mode: 'column' }), col, { x: 30, y: 60 })).toBe(1);
  });
  it('reorderChild changes the layout order', () => {
    const nodes = reflowAll([container('g', cfg()), box('a', 'g', 100, 40), box('b', 'g', 60, 40), box('c', 'g', 60, 40)]);
    const out = reflowAll(reorderChild(nodes, 'c', 0));
    expect(out.filter((n) => n.parentId === 'g').map((n) => n.id)).toEqual(['c', 'a', 'b']);
    expect(out.find((n) => n.id === 'c')!.position.x).toBe(20);
  });
});

describe('creating containers', () => {
  it('wrapInAutoLayout turns a selection into an auto-layout container and lays it out', () => {
    const r = wrapInAutoLayout([box('a', undefined, 100, 40), box('b', undefined, 60, 40)], ['a', 'b'], 'g', { mode: 'column' })!;
    const g = r.nodes.find((n) => n.id === 'g')!;
    expect(g.data.autoLayout?.mode).toBe('column');
    expect(r.nodes.filter((n) => n.parentId === 'g')).toHaveLength(2);
    expect(r.nodes.find((n) => n.id === 'b')!.position.y).toBeGreaterThan(r.nodes.find((n) => n.id === 'a')!.position.y);
  });
  it('setAutoLayout(null) removes the behaviour but keeps the children where they are', () => {
    const laid = reflowAll([container('g', cfg()), box('a', 'g', 100, 40)]);
    const out = setAutoLayout(laid, 'g', null);
    expect(out.find((n) => n.id === 'g')!.data.autoLayout).toBeUndefined();
  });
});
