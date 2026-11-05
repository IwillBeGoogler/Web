import { describe, expect, it } from 'vitest';
import { monitoringMedium, TEMPLATES } from './monitoringMedium';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { absolutePosition, nodeSize } from '../lib/graph';
import { overlaps } from '../lib/placement';
import { isJunction } from '../lib/junction';
import { getIcon } from '../data/icons';
import { getItem } from '../data/palette';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from '../lib/routing';
import { polylineIntersectsRects, type Pt } from '../lib/routing/geometry';
import { resolveSettings } from '../lib/settings';

describe('Monitoring — medium template', () => {
  const t = monitoringMedium();
  it('is registered under its exact name', () => {
    expect(TEMPLATES[0].name).toBe('Monitoring — medium (metrics + logs + traces)');
    expect(ALL_TEMPLATES.some((x) => x.id === 'monitoring-medium')).toBe(true);
  });
  it('has 3 servers (server-1, server-2, server-10) with an ellipsis, 9 service cards', () => {
    const servers = t.nodes.filter((n) => n.type === 'group' && n.data.variant === 'dashed' && /^server-/.test(n.data.label));
    expect(servers.map((s) => s.data.label)).toEqual(['server-1', 'server-2', 'server-10']);
    expect(t.nodes.filter((n) => n.data.shape === 'ellipsis')).toHaveLength(1);
    const cards = t.nodes.filter((n) => n.type === 'card' && servers.some((s) => s.id === n.parentId));
    expect(cards).toHaveLength(9);
    expect(cards.every((c) => c.data.tags!.map((x) => x.text).join() === 'metrics,logs,OTLP')).toBe(true);
    expect(cards.map((c) => c.data.label)).toEqual(expect.arrayContaining(['api-gateway', 'orders', 'payments', 'users', 'inventory', 'notifications', 'search', 'billing', 'worker']));
    expect(servers.every((s) => t.nodes.filter((n) => n.parentId === s.id && n.data.slot === 'vec').length === 1)).toBe(true);
  });
  it('monitoring VM has the expected components and labelled edges', () => {
    const labels = t.nodes.map((n) => n.data.label);
    for (const l of ['Monitoring VM', 'vmbackup', 'VictoriaMetrics', 'VictoriaLogs', 'OTel Collector', 'Tempo', 'Jaeger v2', 'Grafana', 'Users', 'Backup / S3']) expect(labels, l).toContain(l);
    expect(t.nodes.filter((n) => n.data.shape === 'cylinder')).toHaveLength(2);
    const el = t.edges.map((e) => e.label);
    for (const l of ['span metrics (RED)', 'PromQL', 'LogsQL', 'TraceQL', 'daily', 'daily work', 'deep dive']) expect(el, l).toContain(l);
    expect(t.edges.find((e) => e.label === 'daily')!.data).toMatchObject({ strokeStyle: 'dashed' });
    expect(t.edges.find((e) => e.label === 'PromQL')!.data).toMatchObject({ color: '#d9480f', labelBold: true });
    expect(t.edges.find((e) => e.label === 'LogsQL')!.data).toMatchObject({ color: '#1971c2' });
    expect(t.edges.find((e) => e.label === 'TraceQL')!.data).toMatchObject({ color: '#0c8599' });
  });
  it('junction buses: no arrowhead at junctions, every junction has in and out', () => {
    const js = t.nodes.filter(isJunction);
    expect(js.length).toBeGreaterThanOrEqual(3 + 3 * 3);
    for (const j of js) {
      expect(t.edges.filter((e) => e.target === j.id || e.source === j.id).length, j.id).toBeGreaterThanOrEqual(2);
    }
    for (const e of t.edges) {
      if (js.some((j) => j.id === e.target)) expect(e.data?.endMarker).toBe('none');
      if (js.some((j) => j.id === e.source)) expect(e.data?.startMarker).toBe('none');
    }
  });
  it('counts', () => {
    expect(t.nodes.length).toBe(t.nodes.length); // snapshot below keeps this honest
    expect({ nodes: t.nodes.length, edges: t.edges.length }).toEqual({ nodes: 79, edges: 76 });
  });
  it('no two leaf nodes overlap; every edge endpoint exists', () => {
    const leaves = t.nodes.filter((n) => n.type !== 'group');
    const box = (n: (typeof t.nodes)[number]) => ({ ...absolutePosition(t.nodes, n), ...nodeSize(n) });
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) expect(overlaps(box(leaves[i]), box(leaves[j]), 0), `${leaves[i].data.label} / ${leaves[j].data.label}`).toBe(false);
    const ids = new Set(t.nodes.map((n) => n.id));
    for (const e of t.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    expect(new Set(t.nodes.map((n) => n.id)).size).toBe(t.nodes.length);
  });
  it('children sit inside their parent group', () => {
    for (const n of t.nodes.filter((x) => x.parentId)) {
      const p = t.nodes.find((x) => x.id === n.parentId)!;
      const s = nodeSize(n);
      const ps = nodeSize(p);
      expect(n.position.x, n.data.label).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
      expect(n.position.x + s.width, n.data.label).toBeLessThanOrEqual(ps.width);
      expect(n.position.y + s.height, n.data.label).toBeLessThanOrEqual(ps.height);
    }
  });
  it('round-trips through serialization', () => {
    expect(parseDiagram(serializeDiagram(t)).ok).toBe(true);
  });
  it('uses real logos for every required technology', () => {
    for (const id of ['vector', 'victoriametrics', 'victorialogs', 'vmbackup', 'otel-collector', 'tempo', 'jaeger', 'grafana', 'node-exporter', 'cadvisor', 'journald', 'nginx', 'go', 'java', 'python', 'rust', 'php', 's3', 'users']) {
      expect(getItem(id), id).toBeTruthy();
      const icon = getIcon(id);
      expect(icon.kind, id).not.toBe('fallback');
    }
  });

  describe('layout regression (clean buses)', () => {
    const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
    const routes = computeRoutes(t.nodes, t.edges, opts);
    const isCont = (n: (typeof t.nodes)[number]) => n.type === 'group' || n.type === 'cluster';
    it('every edge is routed (no fallback) and none passes through a node', () => {
      for (const e of t.edges) {
        const r = routes.get(e.id);
        expect(r, e.id).toBeTruthy();
        expect(r!.routed || r!.manual, `${e.source}->${e.target} fell back`).toBe(true);
        const others = t.nodes.filter((n) => !isCont(n) && n.id !== e.source && n.id !== e.target).map((n) => rectOf(t.nodes, n));
        expect(polylineIntersectsRects(r!.points, others), `${e.source}->${e.target} crosses a node`).toBe(false);
      }
    });
    it('no two parallel segments run closer than 8px (collinear only within the same preset, i.e. a bundle)', () => {
      type Seg = { id: string; preset: unknown; horizontal: boolean; c: number; a: number; b: number };
      const segs: Seg[] = [];
      for (const e of t.edges) {
        const p: Pt[] = routes.get(e.id)!.points;
        for (let i = 0; i < p.length - 1; i++) {
          const [u, v] = [p[i], p[i + 1]];
          if (Math.abs(u.y - v.y) < 1e-6) segs.push({ id: e.id, preset: e.data?.preset, horizontal: true, c: u.y, a: Math.min(u.x, v.x), b: Math.max(u.x, v.x) });
          else if (Math.abs(u.x - v.x) < 1e-6) segs.push({ id: e.id, preset: e.data?.preset, horizontal: false, c: u.x, a: Math.min(u.y, v.y), b: Math.max(u.y, v.y) });
        }
      }
      const bad: string[] = [];
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++) {
          const [s1, s2] = [segs[i], segs[j]];
          if (s1.id === s2.id || s1.horizontal !== s2.horizontal) continue;
          const overlap = Math.min(s1.b, s2.b) - Math.max(s1.a, s2.a);
          if (overlap <= 1) continue;
          const gap = Math.abs(s1.c - s2.c);
          if (gap < 8 && !(gap === 0 && s1.preset === s2.preset)) bad.push(`${s1.id}/${s2.id} gap ${gap}`);
        }
      expect(bad).toEqual([]);
    });
    it('the three trunks are horizontal, >= 40px apart and ordered metrics, logs, traces from the top', () => {
      const y = (preset: string) => {
        const ys = t.edges.filter((e) => e.data?.preset === preset && t.nodes.find((n) => n.id === e.source)?.type === 'junction' && t.nodes.find((n) => n.id === e.target)?.type === 'junction' && !t.nodes.find((n) => n.id === e.source)?.parentId)
          .map((e) => routes.get(e.id)!.points).filter((p) => p.length === 2 && p[0].y === p[1].y).map((p) => p[0].y);
        expect(ys.length, preset).toBeGreaterThan(0);
        expect(new Set(ys).size, `${preset} trunk is a single line`).toBe(1);
        return ys[0];
      };
      const [m, l, tr] = [y('metrics'), y('logs'), y('traces')];
      expect(m).toBeLessThan(l);
      expect(l).toBeLessThan(tr);
      expect(l - m).toBeGreaterThanOrEqual(40);
      expect(tr - l).toBeGreaterThanOrEqual(40);
    });
    it('collectors share one row under the cards; Vector sits centred at the bottom', () => {
      for (const g of t.nodes.filter((n) => n.type === 'group' && /^server-/.test(n.data.label))) {
        const slot = (s: string) => t.nodes.find((n) => n.parentId === g.id && n.data.slot === s)!;
        const ys = ['ne', 'cadv', 'jd', 'file'].map((s) => slot(s).position.y);
        expect(new Set(ys).size).toBe(1);
        const cardsBottom = Math.max(...[1, 2, 3].map((k) => slot(`c${k}`).position.y + nodeSize(slot(`c${k}`)).height));
        expect(ys[0]).toBeGreaterThan(cardsBottom);
        const vec = slot('vec');
        expect(vec.position.y).toBeGreaterThan(ys[0]);
        expect(vec.position.x + nodeSize(vec).width / 2).toBe(nodeSize(g).width / 2);
      }
    });
    it('each server has exactly one straight vertical drop per signal', () => {
      const servers = t.nodes.filter((n) => n.type === 'group' && /^server-/.test(n.data.label));
      for (const g of servers) {
        const vec = t.nodes.find((n) => n.parentId === g.id && n.data.slot === 'vec')!;
        const drops = t.edges.filter((e) => e.source === vec.id);
        expect(drops.map((e) => e.data?.preset).sort()).toEqual(['logs', 'metrics', 'traces']);
        for (const e of drops) {
          const pts = routes.get(e.id)!.points;
          expect(pts, `${g.data.label} ${e.data?.preset}`).toHaveLength(2);
          expect(pts[0].x).toBe(pts[1].x);
        }
      }
    });
    it('the three trunks each end in exactly ONE drop into the monitoring VM', () => {
      for (const [target, preset] of [['vm-db', 'metrics'], ['vlogs', 'logs'], ['otel', 'traces']] as const) {
        const into = t.edges.filter((e) => e.target === target && isJunction(t.nodes.find((n) => n.id === e.source)));
        expect(into, target).toHaveLength(1);
        expect(into[0].data?.preset).toBe(preset);
        expect(routes.get(into[0].id)!.points).toHaveLength(2);
      }
    });
    it('buses inside a server are straight runs (at most one bend per feeder)', () => {
      for (const e of t.edges.filter((x) => t.nodes.find((n) => n.id === x.target)?.type === 'junction'))
        expect(routes.get(e.id)!.points.length, `${e.source}->${e.target}`).toBeLessThanOrEqual(3);
    });
  });
});
