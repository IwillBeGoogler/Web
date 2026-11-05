import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from './index';
import { resolveSettings } from '../settings';
import { JUNCTION_SIZE, junctionEnds, junctionJoins } from '../junction';
import { monitoringMedium } from '../../templates/monitoringMedium';
import type { DiagramEdge, DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const icon = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, data: { label: id, iconId: 'service' } });
const junction = (id: string, cx: number, cy: number): DiagramNode => ({ id, type: 'junction', position: { x: cx - JUNCTION_SIZE / 2, y: cy - JUNCTION_SIZE / 2 }, width: JUNCTION_SIZE, height: JUNCTION_SIZE, data: { label: '' } });
const e = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source, target, data });
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) <= 0.5;

/** every incident edge end of every junction must sit exactly on the junction centre */
function expectJunctionEndsAtCentre(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const routes = computeRoutes(nodes, edges, opts);
  let checked = 0;
  for (const j of nodes.filter((n) => n.type === 'junction')) {
    const r = rectOf(nodes, j);
    const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    for (const ed of edges) {
      const route = routes.get(ed.id);
      if (!route) continue;
      if (ed.source === j.id) {
        expect(near(route.points[0], c), `${ed.id} start`).toBe(true);
        expect(near(route.src.pt, c), `${ed.id} src.pt`).toBe(true);
        checked++;
      }
      if (ed.target === j.id) {
        expect(near(route.points[route.points.length - 1], c), `${ed.id} end`).toBe(true);
        expect(near(route.dst.pt, c), `${ed.id} dst.pt`).toBe(true);
        checked++;
      }
    }
  }
  return { checked, routes };
}

describe('junction attachment', () => {
  it('a bus: collector -> junction ends exactly on the centre, collinear bus edges meet at one point', () => {
    const nodes = [icon('a', 0, 0), icon('b', 300, 0), junction('j1', 60, 150), junction('j2', 360, 150), junction('jc', 210, 150), icon('v', 150, 300)];
    const edges = [
      e('e1', 'a', 'j1', { pinSource: 'bottom', pinTarget: 'top' }),
      e('e2', 'b', 'j2', { pinSource: 'bottom', pinTarget: 'top' }),
      e('e3', 'j1', 'jc', { pinSource: 'right', pinTarget: 'left' }),
      e('e4', 'j2', 'jc', { pinSource: 'left', pinTarget: 'right' }),
      e('e5', 'jc', 'v', { pinSource: 'bottom', pinTarget: 'top' }),
    ];
    const { checked, routes } = expectJunctionEndsAtCentre(nodes, edges);
    expect(checked).toBe(7);
    // the two bus halves share the exact same point (no gap) and stay one straight line
    const l = routes.get('e3')!.points;
    const r = routes.get('e4')!.points;
    expect(near(l[l.length - 1], r[r.length - 1])).toBe(true);
    expect(l.every((p) => Math.abs(p.y - 150) < 0.5)).toBe(true);
  });
  it('several edges into one junction side are NOT spread along the 10px side', () => {
    const nodes = [icon('a', 0, 0), icon('b', 200, 0), icon('c', 400, 0), junction('j', 260, 200)];
    const edges = [e('e1', 'a', 'j', { pinTarget: 'top' }), e('e2', 'b', 'j', { pinTarget: 'top' }), e('e3', 'c', 'j', { pinTarget: 'top' })];
    expectJunctionEndsAtCentre(nodes, edges);
  });
  it('free (unpinned) edges also end at the centre', () => {
    const nodes = [icon('a', 0, 0), junction('j', 400, 300), icon('b', 700, 0)];
    expectJunctionEndsAtCentre(nodes, [e('e1', 'a', 'j'), e('e2', 'j', 'b')]);
  });
});

describe('Monitoring medium template buses', () => {
  const d = monitoringMedium();
  const js = d.nodes.filter((n) => n.type === 'junction');
  it('has junctions and every incident edge end equals the junction centre (+-0.5px)', () => {
    expect(js.length).toBeGreaterThan(10);
    const { checked } = expectJunctionEndsAtCentre(d.nodes, d.edges);
    expect(checked).toBeGreaterThan(30);
  });
  it('no arrow markers at junction ends', () => {
    for (const ed of d.edges) {
      const jn = junctionEnds(d.nodes, ed);
      if (jn.noEnd) expect(ed.data?.endMarker ?? 'none', ed.id).toBe('none');
      if (jn.noStart) expect(ed.data?.startMarker ?? 'none', ed.id).toBe('none');
    }
  });
  it('bus segments meet: edges of one junction share exactly one point', () => {
    const routes = computeRoutes(d.nodes, d.edges, opts);
    for (const j of js) {
      const r = rectOf(d.nodes, j);
      const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      for (const ed of d.edges) {
        const rt = routes.get(ed.id);
        if (!rt) continue;
        if (ed.source === j.id) expect(near(rt.points[0], c)).toBe(true);
        if (ed.target === j.id) expect(near(rt.points[rt.points.length - 1], c)).toBe(true);
      }
    }
  });
});

describe('junctionJoins (what the junction draws)', () => {
  it('3+ edges: tiny dot in the edge colour; straight pass-through: no dot; corner: dot fills the notch', () => {
    const nodes = [icon('a', 0, 0), icon('b', 300, 0), junction('j1', 60, 150), junction('j2', 360, 150), junction('jc', 210, 150), icon('v', 150, 300)];
    const edges = [
      e('e1', 'a', 'j1', { pinSource: 'bottom', pinTarget: 'top' }),
      e('e2', 'b', 'j2', { pinSource: 'bottom', pinTarget: 'top' }),
      e('e3', 'j1', 'jc', { pinSource: 'right', pinTarget: 'left' }),
      e('e4', 'j2', 'jc', { pinSource: 'left', pinTarget: 'right' }),
      e('e5', 'jc', 'v', { pinSource: 'bottom', pinTarget: 'top' }),
    ];
    const routes = computeRoutes(nodes, edges, opts);
    const colour = (id: string) => (id === 'e5' ? '#d9480f' : '#1971c2');
    const joins = junctionJoins(nodes, edges, routes, colour);
    expect(joins.get('jc')).toMatchObject({ degree: 3, dot: true, color: '#1971c2' });
    expect(joins.get('j1')).toMatchObject({ degree: 2, dot: true }); // corner (down then right)
    const straight = junctionJoins([icon('a', 0, 0), junction('j', 200, 48), icon('b', 400, 0)], [e('x', 'a', 'j', { pinSource: 'right', pinTarget: 'left' }), e('y', 'j', 'b', { pinSource: 'right', pinTarget: 'left' })], computeRoutes([icon('a', 0, 0), junction('j', 200, 48), icon('b', 400, 0)], [e('x', 'a', 'j', { pinSource: 'right', pinTarget: 'left' }), e('y', 'j', 'b', { pinSource: 'right', pinTarget: 'left' })], opts), () => '#000');
    expect(straight.get('j')).toMatchObject({ degree: 2, dot: false });
  });
});
