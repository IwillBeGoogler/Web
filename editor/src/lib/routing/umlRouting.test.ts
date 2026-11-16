import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING } from '.';
import { BUILTIN_SETTINGS } from '../settings';
import { blankClass, classOf, memberCenterY, withClassSize } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { stateNode } from '../state/convert';
import type { DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('state self transitions', () => {
  it('draw a loop on the right of the state instead of being skipped', () => {
    const s = stateNode('s', { x: 100, y: 100 }, { label: 'Idle' });
    const e = umlEdge('e', 's', 's', { kind: 'transition' }, { label: 'tick' });
    const r = computeRoutes([s], [e], opts).get('e')!;
    expect(r).toBeDefined();
    const right = 100 + s.width!;
    expect(r.points).toHaveLength(4);
    expect(r.points[0].x).toBeGreaterThanOrEqual(right);
    expect(Math.max(...r.points.map((p) => p.x))).toBeGreaterThan(right + 20);
    expect(r.points[0].y).toBeLessThan(r.points[3].y);
    expect(r.labelPt.x).toBeGreaterThan(right);
  });
});

describe('UML association anchored at the attribute row', () => {
  const a = withClassSize({ ...blankClass('a', { x: 0, y: 0 }, 'class', 'Order'), data: { ...blankClass('a', { x: 0, y: 0 }).data, label: 'Order', attributes: [{ id: 'a0', visibility: '-', name: 'id', type: 'string' }, { id: 'a1', visibility: '-', name: 'a', type: 'string' }, { id: 'a2', visibility: '-', name: 'customer', type: 'Customer' }], operations: [] } } as DiagramNode);
  const b = blankClass('b', { x: 400, y: 0 }, 'class', 'Customer');
  const e = umlEdge('e', 'a', 'b', { kind: 'association', sourceMember: 'a2' });
  const y = a.position.y + memberCenterY(classOf(a), 'a2');
  it('starts at the centre of that attribute row', () => {
    const r = computeRoutes([a, b], [e], { ...opts, umlAnchorRows: true }).get('e')!;
    expect(r.src.pt.y).toBeCloseTo(y, 3);
    expect(r.points[0].y).toBeCloseTo(y, 3);
    expect(r.src.side).toBe('right');
  });
  it('the toggle off gives a plain edge-to-edge line', () => {
    const r = computeRoutes([a, b], [e], { ...opts, umlAnchorRows: false }).get('e')!;
    expect(Math.abs(r.src.pt.y - y)).toBeGreaterThan(1);
  });
  it('an edge without a member stays where the router puts it', () => {
    const plain = umlEdge('p', 'a', 'b', { kind: 'association' });
    const r = computeRoutes([a, b], [plain], { ...opts, umlAnchorRows: true }).get('p')!;
    expect(Math.abs(r.src.pt.y - y)).toBeGreaterThan(1);
  });
});

describe('use case lines', () => {
  it('are straight by default and follow an explicit line type', async () => {
    const { actorNode, useCaseNode } = await import('../uml2/nodes');
    const a = actorNode('a', { x: 0, y: 0 }), u = useCaseNode('u', { x: 400, y: 200 });
    const plain = computeRoutes([a, u], [umlEdge('e', 'a', 'u', { kind: 'association' })], opts).get('e')!;
    expect(plain.lineType).toBe('straight');
    expect(plain.orthogonal).toBe(false);
    const picked = computeRoutes([a, u], [umlEdge('e', 'a', 'u', { kind: 'association' }, { data: { lineType: 'orthogonal' } })], opts).get('e')!;
    expect(picked.lineType).toBe('orthogonal');
  });
});

describe('sides adapt to the room between the boxes', () => {
  const box = (x: number, y: number, w = 170, h = 110) => ({ x, y, width: w, height: h });
  it('keeps the horizontal pair when the gap is wide enough', async () => {
    const { nearestSides } = await import('./geometry');
    expect(nearestSides(box(0, 0), box(300, 20))).toEqual(['right', 'left']);
  });
  it('switches to the vertical pair when the side gap is cramped and the vertical gap is larger', async () => {
    const { nearestSides } = await import('./geometry');
    // gap 11 horizontally, 40 vertically: top/bottom has the room
    expect(nearestSides(box(0, 0), box(181, 150))).toEqual(['bottom', 'top']);
  });
  it('stays horizontal when the boxes overlap vertically (no vertical room at all)', async () => {
    const { nearestSides } = await import('./geometry');
    expect(nearestSides(box(0, 0), box(181, 50))).toEqual(['right', 'left']);
  });
  it('mirrors for a cramped vertical gap with room on the sides', async () => {
    const { nearestSides } = await import('./geometry');
    expect(nearestSides(box(0, 0, 100, 100), box(150, 111, 100, 100))).toEqual(['right', 'left']);
  });
  it('a cramped neighbour gets one short elbow, not a loop around the box', () => {
    const a = blankClass('a', { x: 0, y: 0 }, 'class', 'User');
    const b = blankClass('b', { x: 181, y: 170 }, 'class', 'UserService');
    const r = computeRoutes([a, b], [umlEdge('e', 'b', 'a', { kind: 'dependency' })], opts).get('e')!;
    expect(r.points.length).toBeLessThanOrEqual(4);
  });
});
