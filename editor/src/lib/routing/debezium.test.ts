import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from './index';
import { countBends, polylineLength, segmentIntersectsRect, type Pt } from './geometry';
import { resolveSettings } from '../settings';
import type { DiagramEdge, DiagramNode } from '../../types';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const card = (id: string, x: number, y: number, w: number, h: number, parentId?: string): DiagramNode => ({ id, type: 'card', ...(parentId ? { parentId } : {}), position: { x, y }, width: w, height: h, data: { label: id } } as unknown as DiagramNode);

/** hub (Debezium) left of a 2x3 grid of DBs inside a group, plus a VPN node outside it */
function build() {
  const dbs = [['pg', 285, 85, 130], ['yb', 455, 85, 140], ['or', 285, 190, 130], ['my', 455, 190, 120], ['mo', 285, 295, 130], ['va', 455, 295, 120]] as const;
  const nodes: DiagramNode[] = [
    { id: 'g', type: 'group', position: { x: 60, y: 30 }, width: 580, height: 400, data: { label: 'Digital Ocean' } } as unknown as DiagramNode,
    card('deb', 100, 190, 145, 80, 'g'),
    ...dbs.map(([id, x, y, w]) => card(id, x, y, w, 70, 'g')),
    card('vpn', 685, 190, 120, 80),
  ];
  // child positions are relative to the group (60,30)
  for (const n of nodes) if (n.parentId) n.position = { x: n.position.x - 60, y: n.position.y - 30 };
  const edges = [...dbs.map(([id]) => id), 'vpn'].map((t) => ({ id: `e-${t}`, source: 'deb', target: t, data: {} }) as unknown as DiagramEdge);
  return { nodes, edges, ids: dbs.map((d) => d[0]) };
}

type Seg = { a: Pt; b: Pt };
const segsOf = (routes: Map<string, { points: Pt[] }>) => [...routes].map(([id, r]) => ({ id, s: r.points.slice(0, -1).map((a, i): Seg => ({ a, b: r.points[i + 1] })) }));
const isH = (k: Seg) => Math.abs(k.a.y - k.b.y) < 1e-6;
const isV = (k: Seg) => Math.abs(k.a.x - k.b.x) < 1e-6;
/** pairs of edges with collinear (within 2px) overlapping segments */
function overlaps(all: ReturnType<typeof segsOf>): string[] {
  const out: string[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (const s of all[i].s) for (const t of all[j].s) {
    const h = isH(s) && isH(t), v = isV(s) && isV(t);
    if (!h && !v) continue;
    const ax = h ? 'x' : 'y', cx = h ? 'y' : 'x';
    const ov = Math.min(Math.max(s.a[ax], s.b[ax]), Math.max(t.a[ax], t.b[ax])) - Math.max(Math.min(s.a[ax], s.b[ax]), Math.min(t.a[ax], t.b[ax]));
    if (ov > 1 && Math.abs(s.a[cx] - t.a[cx]) <= 2) out.push(`${all[i].id} / ${all[j].id}: ${JSON.stringify(s)} ${JSON.stringify(t)}`);
  }
  return out;
}
/** proper crossings (a horizontal and a vertical segment of two different edges cutting through each other's interior) */
function crossings(all: ReturnType<typeof segsOf>): string[] {
  const out: string[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (const s of all[i].s) for (const t of all[j].s) {
    const [hz, vt] = isH(s) && isV(t) ? [s, t] : isV(s) && isH(t) ? [t, s] : [];
    if (!hz || !vt) continue;
    const x = vt.a.x, y = hz.a.y;
    if (x > Math.min(hz.a.x, hz.b.x) + 1 && x < Math.max(hz.a.x, hz.b.x) - 1 && y > Math.min(vt.a.y, vt.b.y) + 1 && y < Math.max(vt.a.y, vt.b.y) - 1) out.push(`${all[i].id} x ${all[j].id} at ${Math.round(x)},${Math.round(y)}`);
  }
  return out;
}
const dump = (routes: Map<string, { points: Pt[] }>) => { if (!process.env.DUMP) return; let len = 0, bends = 0; for (const [id, r] of routes) { len += polylineLength(r.points); bends += countBends(r.points); console.log(id, JSON.stringify(r.points.map((p) => [Math.round(p.x), Math.round(p.y)]))); } console.log('TOTAL', Math.round(len), 'bends', bends); };
/** every edge stays out of every node that is not one of its ends or one of their ancestor groups */
function crossesNode(nodes: DiagramNode[], edges: DiagramEdge[], routes: Map<string, { points: Pt[] }>): string[] {
  const out: string[] = [];
  for (const e of edges) for (const n of nodes) {
    if (n.id === e.source || n.id === e.target || n.type === 'group') continue;
    const pts = routes.get(e.id)!.points;
    for (let i = 0; i < pts.length - 1; i++) if (segmentIntersectsRect(pts[i], pts[i + 1], rectOf(nodes, n))) out.push(`${e.id} hits ${n.id}`);
  }
  return out;
}

describe('Debezium hub in a group', () => {
  const { nodes, edges } = build();
  const routes = computeRoutes(nodes, edges, opts);
  dump(routes);
  it('no two edges share collinear overlapping segments', () => expect(overlaps(segsOf(routes))).toEqual([]));
  it('every edge leaves from a distinct source port', () => expect(new Set([...routes.values()].map((r) => `${r.points[0].x},${r.points[0].y}`)).size).toBe(routes.size));
  it('no segment crosses a non-endpoint node', () => expect(crossesNode(nodes, edges, routes)).toEqual([]));
});

/** big AWS group with a pipeline inside; VPN nodes and a Hetzner group outside feed into it */
function buildAws() {
  const c = (id: string, x: number, y: number, w = 120, h = 70) => card(id, x - 870, y - 150, w, h, 'aws');
  const nodes: DiagramNode[] = [
    { id: 'aws', type: 'group', position: { x: 870, y: 150 }, width: 860, height: 680, data: { label: 'AWS' } } as unknown as DiagramNode,
    c('graf', 925, 205), c('prom', 1075, 210), c('cw', 925, 335), c('s3', 1105, 320, 145, 75), c('dms', 1030, 478), c('glue', 1412, 478), c('red', 1517, 470), c('gs', 925, 690), c('msk', 1062, 690), c('sink', 1230, 685),
    card('vpn1', 685, 190, 120, 70), card('vpn2', 828, 855, 120, 70),
    { id: 'het', type: 'group', position: { x: 90, y: 435 }, width: 675, height: 245, data: { label: 'Hetzner' } } as unknown as DiagramNode,
    card('hdb', 140, 500, 140, 70, 'het'),
  ];
  for (const n of nodes) if (n.id === 'hdb') n.position = { x: 50, y: 65 };
  const pairs = [['vpn1', 'gs'], ['het', 'vpn2'], ['vpn2', 'dms'], ['prom', 'graf'], ['dms', 's3'], ['sink', 's3'], ['s3', 'glue'], ['glue', 'red'], ['gs', 'msk'], ['msk', 'sink']];
  const edges = pairs.map(([s, t]) => ({ id: `${s}>${t}`, source: s, target: t, data: {} }) as unknown as DiagramEdge);
  return { nodes, edges };
}

describe('AWS pipeline: long edges into a large group', () => {
  const { nodes, edges } = buildAws();
  const routes = computeRoutes(nodes, edges, opts);
  dump(routes);
  const all = segsOf(routes);
  it('no collinear overlap', () => expect(overlaps(all)).toEqual([]));
  it('no edge crosses a non-endpoint node', () => expect(crossesNode(nodes, edges, routes)).toEqual([]));
  it('few edge crossings', () => { const x = crossings(all); if (process.env.DUMP) console.log(x); expect(x.length).toBeLessThanOrEqual(1); });
});
