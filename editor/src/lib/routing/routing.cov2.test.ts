import { describe, expect, it } from 'vitest';
import { computeRoutes, createRouteCache, DEFAULT_ROUTING, FAST_ROUTING_EDGES } from './index';
import { BUILTIN_SETTINGS } from '../settings';
import { blankTable, relationEdge } from '../er/relations';
import { blankClass, classOf, memberCenterY, withClassSize } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { stateNode } from '../state/convert';
import { JUNCTION_SIZE } from '../junction';
import type { DiagramEdge, DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };
const card = (id: string, x: number, y: number, w = 100, h = 60): DiagramNode => ({ id, type: 'card', position: { x, y }, width: w, height: h, data: { label: id } });
const junction = (id: string, cx: number, cy: number): DiagramNode => ({ id, type: 'junction', position: { x: cx - JUNCTION_SIZE / 2, y: cy - JUNCTION_SIZE / 2 }, width: JUNCTION_SIZE, height: JUNCTION_SIZE, data: { label: '' } });
const e = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, data, ...extra });

describe('component ports', () => {
  const comp = (id: string, x: number, ports: any[]): DiagramNode => ({ id, type: 'component', position: { x, y: 0 }, width: 120, height: 80, data: { label: id, ports } as any });
  const ports = [{ id: 'p1', name: 'api', kind: 'provided', side: 'right', offset: 0.25 }, { id: 'q1', name: 'in', kind: 'required', side: 'left', offset: 0.75 }];
  it('a source-only or target-only port pins that end on the border at the port offset', () => {
    const nodes = [comp('a', 0, ports), comp('b', 400, ports)];
    const src = computeRoutes(nodes, [umlEdge('e', 'a', 'b', { kind: 'dependency', sourcePort: 'p1' } as any)], opts).get('e')!;
    expect(src.src.pt).toEqual({ x: 120, y: 20 });
    expect(src.src.side).toBe('right');
    const dst = computeRoutes(nodes, [umlEdge('e', 'a', 'b', { kind: 'dependency', targetPort: 'q1' } as any)], opts).get('e')!;
    expect(dst.dst.pt).toEqual({ x: 400, y: 60 });
    expect(dst.dst.side).toBe('left');
    const none = computeRoutes(nodes, [umlEdge('e', 'a', 'b', { kind: 'dependency', sourcePort: 'missing' } as any)], opts).get('e')!;
    expect(none.src.pt.y).not.toBe(20);
  });
});

describe('UML attribute-row anchoring', () => {
  const mkA = () => withClassSize({ ...blankClass('a', { x: 0, y: 0 }, 'class', 'Order'), data: { ...blankClass('a', { x: 0, y: 0 }).data, label: 'Order', attributes: [{ id: 'a0', visibility: '-', name: 'id', type: 'string' }, { id: 'a1', visibility: '-', name: 'x', type: 'string' }, { id: 'a2', visibility: '-', name: 'customer', type: 'Customer' }], operations: [] } } as DiagramNode);
  const mkB = () => withClassSize({ ...blankClass('b', { x: 500, y: 0 }, 'class', 'Customer'), data: { ...blankClass('b', { x: 500, y: 0 }).data, label: 'Customer', attributes: [{ id: 'b0', visibility: '-', name: 'id', type: 'string' }, { id: 'b1', visibility: '-', name: 'orders', type: 'Order' }], operations: [] } } as DiagramNode);
  it('source member alone and target member alone each pin only their own end', () => {
    const a = mkA(), b = mkB();
    const ya = a.position.y + memberCenterY(classOf(a), 'a2');
    const yb = b.position.y + memberCenterY(classOf(b), 'b1');
    const s = computeRoutes([a, b], [umlEdge('e', 'a', 'b', { kind: 'association', sourceMember: 'a2' })], opts).get('e')!;
    expect(s.src.pt.y).toBeCloseTo(ya, 3);
    expect(Math.abs(s.dst.pt.y - yb)).toBeGreaterThan(1);
    const t = computeRoutes([a, b], [umlEdge('e', 'a', 'b', { kind: 'association', targetMember: 'b1' })], opts).get('e')!;
    expect(t.dst.pt.y).toBeCloseTo(yb, 3);
    expect(Math.abs(t.src.pt.y - ya)).toBeGreaterThan(1);
  });
  it('multiplicities and role names become label obstacles on both end directions', () => {
    const a = mkA(), b = mkB();
    const ed = umlEdge('e', 'a', 'b', { kind: 'association', sourceMult: '1', targetMult: '0..*', sourceRole: 'owner', targetRole: 'items' }, { label: 'places' });
    const back = umlEdge('f', 'b', 'a', { kind: 'association', sourceMult: '1', targetMult: '*', targetRole: 'r' }, { label: 'back' });
    const down = umlEdge('g', 'a', 'b', { kind: 'association', sourceMult: '2', targetMult: '3', sourceRole: 'x' }, { label: 'down' });
    const r = computeRoutes([a, b, { ...b, id: 'c', position: { x: 0, y: 400 } }], [ed, back, { ...down, target: 'c' }], opts);
    for (const id of ['e', 'f', 'g']) expect(Number.isFinite(r.get(id)!.labelPt.x)).toBe(true);
  });
});

describe('junction alignment', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  it('two junctions never move toward each other', () => {
    const nodes = [junction('j1', 0, 100), junction('j2', 200, 112)];
    const r = computeRoutes(nodes, [e('x', 'j1', 'j2', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(r.points[0]).toEqual({ x: 0, y: 100 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 200, y: 112 });
  });
  it('a junction slides the other end onto its line only when the side is wide enough', () => {
    const nodes = [junction('j', 0, 100), card('c', 200, 80), card('t', 200, 300, 100, 20)];
    const ok = computeRoutes(nodes, [e('x', 'j', 'c', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(ok.dst.pt.y).toBeCloseTo(100, 0);
    const rev = computeRoutes(nodes, [e('x', 'c', 'j', { pinSource: 'left', pinTarget: 'right' })], { ...opts }).get('x')!;
    expect(rev.points.length).toBeGreaterThan(1);
    // junction at y=90 against a card that spans 82..138 (+-4): inside; at y=20: outside, so the card end stays put
    const out = computeRoutes([junction('j', 0, 20), card('c', 200, 0, 100, 60)], [e('x', 'j', 'c', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(near(out.dst.pt.y, 20)).toBe(true);
    const outside = computeRoutes([junction('j', 0, 3), card('c', 200, 0, 100, 60)], [e('x', 'j', 'c', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(outside.dst.pt.y).toBeGreaterThan(20);
    const outsideRev = computeRoutes([junction('j', 300, 3), card('c', 0, 0, 100, 60)], [e('x', 'c', 'j', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(outsideRev.src.pt.y).toBeGreaterThan(20);
    const revIn = computeRoutes([junction('j', 300, 20), card('c', 0, 0, 100, 60)], [e('x', 'c', 'j', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(revIn.src.pt.y).toBeCloseTo(20, 0);
  });
  it('vertical facing junctions slide the other end along x', () => {
    const inside = computeRoutes([junction('j', 140, 0), card('c', 100, 200, 100, 60)], [e('x', 'j', 'c', { pinSource: 'bottom', pinTarget: 'top' })], opts).get('x')!;
    expect(inside.dst.pt.x).toBeCloseTo(140, 0);
    const outside = computeRoutes([junction('j', 140, 0), card('c', 100, 200, 30, 60)], [e('x', 'j', 'c', { pinSource: 'bottom', pinTarget: 'top' })], opts).get('x')!;
    expect(outside.dst.pt.x).toBeLessThan(135);
    const rev = computeRoutes([junction('j', 140, 300), card('c', 100, 0, 100, 60)], [e('x', 'c', 'j', { pinSource: 'bottom', pinTarget: 'top' })], opts).get('x')!;
    expect(rev.src.pt.x).toBeCloseTo(140, 0);
  });
  it('keepBusesOrthogonal forces junction edges orthogonal even for straight defaults', () => {
    const nodes = [card('a', 0, 0), junction('j', 300, 150)];
    const straight = { ...opts, edgeDefaults: { ...opts.edgeDefaults, lineType: 'straight' as const, keepBusesOrthogonal: false } };
    expect(computeRoutes(nodes, [e('x', 'a', 'j')], straight).get('x')!.lineType).toBe('straight');
    const keep = { ...opts, edgeDefaults: { ...straight.edgeDefaults, keepBusesOrthogonal: true } };
    expect(computeRoutes(nodes, [e('x', 'a', 'j')], keep).get('x')!.lineType).toBe('orthogonal');
    expect(computeRoutes(nodes, [e('x', 'j', 'a')], keep).get('x')!.lineType).toBe('orthogonal');
    expect(computeRoutes(nodes, [{ id: 'x', source: 'a', target: 'j' }], keep).get('x')!.lineType).toBe('orthogonal');
  });
});

describe('side alignment edge cases', () => {
  it('facing sides too short to overlap keep their own ports', () => {
    const r = computeRoutes([card('a', 0, 0, 100, 6), card('b', 300, 20, 100, 6)], [e('x', 'a', 'b', { pinSource: 'right', pinTarget: 'left' })], opts).get('x')!;
    expect(r.src.pt.y).toBeCloseTo(3, 0);
    expect(r.dst.pt.y).toBeCloseTo(23, 0);
  });
  it('coincident straight edges do not produce NaN', () => {
    const r = computeRoutes([card('a', 0, 0), card('b', 0, 0)], [e('x', 'a', 'b', { lineType: 'straight', pinSource: 'top', pinTarget: 'top' })], opts).get('x')!;
    expect(r.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('ER relations', () => {
  const t1 = blankTable('t1', { x: 0, y: 0 }), t2 = blankTable('t2', { x: 400, y: 0 });
  const rel = relationEdge('r', 't1', 't2', { fromCol: 'c0', toCol: 'c1', cardinality: '1:N', identifying: false, optional: true });
  it('without auto-route the step path still honours the long crow-foot ends', () => {
    const r = computeRoutes([t1, t2], [rel], { ...opts, autoRoute: false }).get('r')!;
    expect(r.routed).toBe(false);
    expect(Math.abs(r.points[1].x - r.points[0].x)).toBeGreaterThanOrEqual(20);
  });
  it('plain non-relation edges without auto-route use the step router', () => {
    const r = computeRoutes([card('a', 0, 0), card('b', 300, 200)], [e('x', 'a', 'b')], { ...opts, autoRoute: false }).get('x')!;
    expect(r.routed).toBe(false);
    expect(r.orthogonal).toBe(true);
    expect(r.points.length).toBeGreaterThanOrEqual(3);
  });
  it('self relations loop out of the right side; labels, missing columns and non-table self edges are handled', () => {
    const self = relationEdge('s', 't1', 't1', { fromCol: 'c0', toCol: 'c1', cardinality: '1:N', identifying: false, optional: true });
    const r = computeRoutes([t1, t2], [self, { ...self, id: 's2', label: 'x' }, { ...self, id: 's3', data: { ...self.data, endMarker: 'none', startMarker: 'none' } }], opts);
    expect(r.get('s3')!.endCut).toBe(0);
    expect(r.get('s3')!.startCut).toBe(0);
    expect(r.get('s')!.endCut).toBeGreaterThan(0);
    const right = t1.position.x + (t1.width ?? 0);
    expect(r.get('s')!.points[0].x).toBeGreaterThanOrEqual(right);
    expect(r.get('s')!.routed).toBe(true);
    expect(r.get('s')!.lineType).toBe('step-rounded');
    const plain = computeRoutes([t1, card('c', 500, 0)], [e('loop', 'c', 'c'), e('ghost', 'zz', 'zz')], opts);
    expect(plain.size).toBe(0);
  });
});

describe('state self transitions', () => {
  it('labelled and unlabelled loops widen differently; non-transition self edges are skipped', () => {
    const s = stateNode('s', { x: 100, y: 100 }, { label: 'Idle' });
    const plain = computeRoutes([s], [umlEdge('e', 's', 's', { kind: 'transition' })], opts).get('e')!;
    const label = computeRoutes([s], [umlEdge('e', 's', 's', { kind: 'transition' }, { label: 'a long transition label' })], opts).get('e')!;
    expect(Math.max(...label.points.map((p) => p.x))).toBeGreaterThan(Math.max(...plain.points.map((p) => p.x)));
    expect(computeRoutes([s], [umlEdge('e', 's', 's', { kind: 'association' })], opts).size).toBe(0);
  });
});

describe('fast mode', () => {
  it('more than FAST_ROUTING_EDGES edges still routes every edge (orthogonal ones without the side search)', () => {
    const nodes = [card('a', 0, 0), card('b', 400, 0), card('c', 0, 300), card('d', 400, 300)];
    const edges: DiagramEdge[] = [];
    for (let i = 0; i < FAST_ROUTING_EDGES + 1; i++) edges.push(e(`s${i}`, i % 2 ? 'a' : 'c', i % 2 ? 'b' : 'd', { lineType: 'straight' }));
    edges.push(e('o1', 'a', 'd', { lineType: 'orthogonal', preset: 'p' }), e('o2', 'c', 'b', { lineType: 'orthogonal', preset: 'p' }));
    const r = computeRoutes(nodes, edges, opts);
    expect(r.size).toBe(edges.length);
    expect(r.get('o1')!.orthogonal).toBe(true);
    expect(r.get('o1')!.points.length).toBeGreaterThanOrEqual(3);
  });
});

describe('same-preset bundling', () => {
  it('same-preset orthogonal edges reuse each other tracks', () => {
    const nodes = [card('a', 0, 0), card('b', 500, 200), card('c', 0, 120), card('d', 500, 320)];
    const edges = [e('x', 'a', 'b', { preset: 'p', pinSource: 'right', pinTarget: 'left' }), e('y', 'c', 'd', { preset: 'p', pinSource: 'right', pinTarget: 'left' }), e('z', 'a', 'd', { preset: 'q' })];
    const r = computeRoutes(nodes, edges, opts);
    expect(r.get('x')!.orthogonal && r.get('y')!.orthogonal).toBe(true);
    expect(r.get('x')!.routed && r.get('y')!.routed && r.get('z')!.routed).toBe(true);
  });
});

describe('side search for crowded or blocked edges', () => {
  it('a hub whose edges run on top of each other tries other sides and still routes everything', () => {
    const nodes = [card('h', 0, 200, 100, 60), ...Array.from({ length: 7 }, (_, i) => card(`t${i}`, 400, i * 90, 100, 60))];
    const edges = nodes.slice(1).map((n) => e(`e_${n.id}`, 'h', n.id));
    const r = computeRoutes(nodes, edges, opts);
    expect(r.size).toBe(7);
    for (const rt of r.values()) expect(rt.points.length).toBeGreaterThanOrEqual(2);
  });
  it('crowded hubs with one pinned end only search the free end; spread ports reuse the counter', () => {
    const mk = (extra: DiagramEdge['data']) => {
      const nodes = [card('h', 0, 200, 100, 60), ...Array.from({ length: 9 }, (_, i) => card(`t${i}`, 400, i * 90, 100, 60))];
      return computeRoutes(nodes, nodes.slice(1).map((n) => e(`e_${n.id}`, 'h', n.id, extra)), opts);
    };
    for (const extra of [{ pinSource: 'right' }, { pinTarget: 'left' }, {}]) {
      const r = mk(extra);
      expect(r.size).toBe(9);
      if ('pinSource' in extra) for (const rt of r.values()) expect(rt.src.side).toBe('right');
      if ('pinTarget' in extra) for (const rt of r.values()) expect(rt.dst.side).toBe('left');
    }
  });
  it('a hub as target with only its target side pinned', () => {
    const nodes = [card('h', 500, 200, 100, 60), ...Array.from({ length: 9 }, (_, i) => card(`t${i}`, 0, i * 90, 100, 60))];
    for (const extra of [{ pinTarget: 'left' }, { pinSource: 'right' }, { pinTarget: 'left', pinSource: 'right' }] as const) {
      const r = computeRoutes(nodes, nodes.slice(1).map((n) => e(`e_${n.id}`, n.id, 'h', extra)), opts);
      expect(r.size).toBe(9);
      if ('pinTarget' in extra) for (const rt of r.values()) expect(rt.dst.side).toBe('left');
    }
  });
  it('a target walled in on its nearest side routes around through another side; pinned ends keep their side', () => {
    const wall = [card('w1', 180, 100, 20, 120), card('w2', 200, 90, 80, 20), card('w3', 200, 210, 80, 20)];
    const nodes = [card('a', 0, 140, 100, 40), card('b', 220, 140, 40, 40), ...wall];
    const free = computeRoutes(nodes, [e('x', 'a', 'b')], opts).get('x')!;
    expect(free.points.length).toBeGreaterThanOrEqual(2);
    const pinS = computeRoutes(nodes, [e('x', 'a', 'b', { pinSource: 'right' })], opts).get('x')!;
    expect(pinS.src.side).toBe('right');
    const pinT = computeRoutes(nodes, [e('x', 'a', 'b', { pinTarget: 'left' })], opts).get('x')!;
    expect(pinT.dst.side).toBe('left');
    const hub = [...nodes, ...Array.from({ length: 5 }, (_, i) => card(`o${i}`, 0, 400 + i * 80))];
    const many = computeRoutes(hub, [e('x', 'a', 'b'), e('y', 'a', 'b'), ...hub.slice(5).map((n) => e(`q${n.id}`, 'a', n.id)), e('z', 'a', 'b', { pinSource: 'right', pinTarget: 'left' })], opts);
    expect(many.size).toBe(8);
  });
});

describe('cache', () => {
  it('re-routes only edges near a moved node and reports the counts', () => {
    const nodes = [card('a', 0, 0), card('b', 400, 0), card('c', 0, 400), card('d', 400, 400)];
    const edges = [e('x', 'a', 'b'), e('y', 'c', 'd')];
    const cache = createRouteCache();
    computeRoutes(nodes, edges, opts, cache);
    expect(cache.recomputed).toBe(2);
    computeRoutes(nodes, edges, opts, cache);
    expect(cache.reused).toBe(2);
    computeRoutes(nodes.map((n) => (n.id === 'a' ? { ...n, position: { x: 0, y: 30 } } : n)), edges, opts, cache);
    expect(cache.recomputed).toBe(1);
    expect(cache.reused).toBe(1);
    computeRoutes(nodes.filter((n) => n.id !== 'd'), edges, opts, cache);
    expect(cache.routes.has('y')).toBe(false);
  });
});
