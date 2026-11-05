import { describe, expect, it } from 'vitest';
import type { DiagramNode, NodeConstraints } from '../../types';
import { addGuide, applyConstraints, dragDistances, measureBetween, moveGuide, removeGuide, resizeWithConstraints, snapToGuides, rulerTicks } from './precision';

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('measureBetween (Alt-hover)', () => {
  it('side by side: one horizontal distance at the vertical overlap centre', () => {
    const m = measureBetween(r(0, 0, 100, 100), r(150, 20, 100, 60));
    expect(m).toEqual([{ axis: 'x', from: { x: 100, y: 50 }, to: { x: 150, y: 50 }, value: 50 }]);
  });
  it('diagonal: horizontal and vertical gaps', () => {
    const m = measureBetween(r(0, 0, 100, 100), r(130, 160, 50, 50));
    expect(m.map((x) => [x.axis, x.value]).sort()).toEqual([['x', 30], ['y', 60]]);
  });
  it('contained: four insets', () => {
    const m = measureBetween(r(0, 0, 200, 200), r(20, 30, 100, 100));
    expect(m.map((x) => x.value).sort((a, b) => a - b)).toEqual([20, 30, 80, 70].sort((a, b) => a - b));
  });
  it('overlapping or touching rects have no gap to show on that axis', () => {
    expect(measureBetween(r(0, 0, 100, 100), r(100, 0, 50, 100)).find((x) => x.axis === 'x')?.value).toBe(0);
    expect(measureBetween(r(0, 0, 100, 100), r(50, 50, 100, 100))).toEqual([]);
  });
});

describe('dragDistances', () => {
  it('shows the nearest neighbour on each side within the overlap band', () => {
    const moving = r(200, 100, 50, 50);
    const others = [r(0, 100, 100, 50), r(400, 110, 50, 30), r(200, 300, 50, 50), r(200, -100, 50, 50), r(0, 1000, 10, 10)];
    const d = dragDistances(moving, others);
    expect(d.map((x) => [x.axis, x.value]).sort()).toEqual([['x', 100], ['x', 150], ['y', 150], ['y', 150]].sort());
  });
});

describe('guides', () => {
  it('add / move / remove', () => {
    let g = addGuide([], { id: 'a', axis: 'x', pos: 100 });
    g = addGuide(g, { id: 'b', axis: 'y', pos: 50 });
    expect(moveGuide(g, 'a', 140).find((x) => x.id === 'a')!.pos).toBe(140);
    expect(removeGuide(g, 'a').map((x) => x.id)).toEqual(['b']);
  });
  it('snaps edges and centre of a rect to a guide within the threshold', () => {
    const g = [{ id: 'a', axis: 'x' as const, pos: 100 }, { id: 'b', axis: 'y' as const, pos: 300 }];
    expect(snapToGuides(r(96, 0, 40, 40), g, 5)).toEqual({ dx: 4, dy: 0 });
    expect(snapToGuides(r(60, 0, 80, 40), g, 5)).toEqual({ dx: 0, dy: 0 }); // centre 100 matches (60+40) -> 0
    expect(snapToGuides(r(0, 262, 40, 40), g, 5)).toEqual({ dx: 0, dy: -2 });
    expect(snapToGuides(r(0, 0, 40, 40), g, 5)).toEqual({ dx: 0, dy: 0 });
  });
  it('rulerTicks picks a readable step for the zoom', () => {
    const t = rulerTicks(0, 1000, 1);
    expect(t.major).toBeGreaterThanOrEqual(50);
    expect(t.ticks[0]).toBe(0);
    expect(rulerTicks(0, 1000, 0.1).major).toBeGreaterThan(t.major);
    expect(rulerTicks(0, 100, 4).major).toBeLessThan(t.major);
  });
});

describe('constraints on resize', () => {
  const c = (h: NodeConstraints['h'], v: NodeConstraints['v'] = 'top'): NodeConstraints => ({ h, v });
  const child = r(10, 20, 30, 40);
  const old = { width: 100, height: 100 };
  const grown = { width: 200, height: 160 };
  it('left / top keep the offset', () => expect(applyConstraints(child, old, grown, c('left'))).toEqual(r(10, 20, 30, 40)));
  it('right / bottom keep the distance to the far edge', () => {
    expect(applyConstraints(child, old, grown, c('right', 'bottom'))).toEqual(r(110, 80, 30, 40));
  });
  it('center keeps the centre', () => expect(applyConstraints(child, old, grown, c('center', 'center'))).toEqual(r(60, 50, 30, 40)));
  it('stretch keeps both distances (the size changes)', () => expect(applyConstraints(child, old, grown, c('stretch', 'stretch'))).toEqual(r(10, 20, 130, 100)));
  it('scale scales position and size proportionally', () => expect(applyConstraints(child, old, grown, c('scale', 'scale'))).toEqual(r(20, 32, 60, 64)));
  it('shrinking works too', () => expect(applyConstraints(child, old, { width: 50, height: 100 }, c('right'))).toEqual(r(-40, 20, 30, 40)));
});

describe('resizeWithConstraints on a node list', () => {
  const frame = { id: 'f', type: 'group', position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: 'f' } } as DiagramNode;
  const kid = (id: string, constraints?: NodeConstraints) => ({ id, type: 'card', parentId: 'f', position: { x: 10, y: 10 }, width: 20, height: 20, data: { label: id, ...(constraints ? { constraints } : {}) } }) as DiagramNode;
  it('only children with constraints move; the others stay (default top-left)', () => {
    const out = resizeWithConstraints([frame, kid('a', { h: 'right', v: 'bottom' }), kid('b')], 'f', { width: 100, height: 100 }, { width: 300, height: 200 });
    expect(out.find((n) => n.id === 'a')!.position).toEqual({ x: 210, y: 110 });
    expect(out.find((n) => n.id === 'b')!.position).toEqual({ x: 10, y: 10 });
  });
  it('stretch resizes the child', () => {
    const out = resizeWithConstraints([frame, kid('a', { h: 'stretch', v: 'top' })], 'f', { width: 100, height: 100 }, { width: 300, height: 100 });
    expect(out.find((n) => n.id === 'a')!.width).toBe(220);
  });
  it('Board frames hold loose nodes by position, not parentId', () => {
    const f = { id: 'fr', type: 'frame', position: { x: 0, y: 0 }, width: 100, height: 100, data: { label: 'fr' } } as DiagramNode;
    const loose = { id: 'l', type: 'card', position: { x: 70, y: 10 }, width: 20, height: 20, data: { label: 'l', constraints: { h: 'right', v: 'top' } } } as DiagramNode;
    const out = resizeWithConstraints([f, loose], 'fr', { width: 100, height: 100 }, { width: 200, height: 100 });
    expect(out.find((n) => n.id === 'l')!.position.x).toBe(170);
  });
});
