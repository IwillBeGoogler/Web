import { beforeEach, describe, expect, it } from 'vitest';
import { ROLES, roleKind, validateRole, roleSummary } from './roles';
import { EDGE_KINDS, suggestEdgeKind } from './edgeKinds';
import { collapseCluster, expandCluster, memberCount, projectEdges, COMPACT_SIZE } from './collapse';
import { useDiagramStore } from '../store/diagramStore';
import { resolveEdgeStyle, resolveSettings } from '../lib/settings';
import { styleEdge } from '../lib/graph';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { buildSdd, readSdd } from '../lib/sdd/sdd';
import { createProject } from '../lib/project';
import type { DiagramEdge, DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const cluster = (id = 'C', extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'cluster', position: { x: 100, y: 100 }, width: 700, height: 400, style: { width: 700, height: 400 },
  data: { label: 'PostgreSQL cluster', subtitle: 'Patroni · 3 nodes', iconId: 'postgresql' }, ...extra,
});
const member = (id: string, role: string | undefined, x: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y: 60 }, width: 100, height: 80, parentId: 'C', data: { label: id, iconId: 'postgresql', ...(role ? { role } : {}) }, ...extra,
});
const edge = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra });
const pgCluster = (): DiagramNode[] => [cluster(), member('pg1', 'primary', 40), member('pg2', 'replica', 200), member('pg3', 'replica', 360), { id: 'app', type: 'icon', position: { x: 0, y: 700 }, data: { label: 'app', iconId: 'service' } }];

beforeEach(() => s().reset());

describe('roles', () => {
  it('has the requested roles', () => {
    for (const r of ['primary', 'replica', 'standby', 'leader', 'follower', 'arbiter', 'master', 'slave', 'shard', 'coordinator', 'data', 'ingest', 'controller', 'broker', 'sentinel', 'witness']) expect(ROLES).toContain(r);
  });
  it('validation: presets and custom strings, rejects empty / overlong / control chars', () => {
    expect(validateRole('primary')).toEqual({ ok: true, role: 'primary' });
    expect(validateRole('  hot-data  ')).toEqual({ ok: true, role: 'hot-data' });
    expect(validateRole('').ok).toBe(false);
    expect(validateRole('   ').ok).toBe(false);
    expect(validateRole('x'.repeat(25)).ok).toBe(false);
    expect(validateRole('a\nb').ok).toBe(false);
  });
  it('pill style: primary/leader/master/controller accent, replica-ish muted, arbiter/sentinel/witness outline, custom muted', () => {
    for (const r of ['primary', 'leader', 'master', 'controller']) expect(roleKind(r)).toBe('accent');
    for (const r of ['replica', 'follower', 'slave', 'standby', 'data', 'broker']) expect(roleKind(r)).toBe('muted');
    for (const r of ['arbiter', 'sentinel', 'witness']) expect(roleKind(r)).toBe('outline');
    expect(roleKind('custom-thing')).toBe('muted');
  });
  it('store.setRole assigns, clears and rejects invalid roles', () => {
    for (const n of pgCluster()) s().addNode(n);
    expect(s().setRole(['pg2'], 'standby')).toBe(true);
    expect(s().nodes.find((n) => n.id === 'pg2')!.data.role).toBe('standby');
    expect(s().setRole(['pg2'], '')).toBe(false);
    expect(s().nodes.find((n) => n.id === 'pg2')!.data.role).toBe('standby');
    expect(s().setRole(['pg2'], null)).toBe(true);
    expect(s().nodes.find((n) => n.id === 'pg2')!.data.role).toBeUndefined();
    s().undo();
    expect(s().nodes.find((n) => n.id === 'pg2')!.data.role).toBe('standby');
  });
  it('roleSummary: "1 primary · 2 replicas"', () => {
    expect(roleSummary(pgCluster(), 'C')).toBe('1 primary · 2 replicas');
    const mixed = [cluster(), member('a', 'leader', 0), member('b', 'follower', 100), member('c', 'follower', 200), member('d', 'arbiter', 300), member('e', undefined, 400)];
    expect(roleSummary(mixed, 'C')).toBe('1 leader · 2 followers · 1 arbiter');
    expect(roleSummary([cluster()], 'C')).toBe('');
  });
});

describe('cluster edge kinds', () => {
  it('replication / heartbeat / failover / sharding have distinct default styling', () => {
    const r = resolveSettings(undefined, undefined);
    expect(EDGE_KINDS).toEqual(['replication', 'heartbeat', 'failover', 'sharding']);
    expect(resolveEdgeStyle({ kind: 'replication' }, r)).toMatchObject({ strokeStyle: 'dashed', arrows: 'end' });
    expect(resolveEdgeStyle({ kind: 'heartbeat' }, r)).toMatchObject({ strokeStyle: 'dotted', arrows: 'none' });
    const f = resolveEdgeStyle({ kind: 'failover' }, r);
    expect(f).toMatchObject({ strokeStyle: 'dashed', lineType: 'curved' });
    expect(f.color).not.toBe(r.edge.color);
    expect(resolveEdgeStyle({ kind: 'sharding' }, r)).toMatchObject({ strokeStyle: 'solid' });
    expect(resolveEdgeStyle({ kind: 'sharding' }, r).width).toBeLessThan(r.edge.width);
  });
  it('explicit edge values still win over the kind defaults', () => {
    const r = resolveSettings(undefined, undefined);
    expect(resolveEdgeStyle({ kind: 'heartbeat', arrows: 'both', color: '#123456' }, r)).toMatchObject({ arrows: 'both', color: '#123456', strokeStyle: 'dotted' });
  });
  it('styleEdge renders a replication edge dashed with an arrowhead and a heartbeat dotted without', () => {
    const rep = styleEdge(edge('r', 'a', 'b', { data: { kind: 'replication' } })) as unknown as { style: Record<string, unknown>; markerEnd?: unknown };
    expect(rep.style.strokeDasharray).toBeTruthy();
    expect(rep.markerEnd).toBeTruthy();
    const hb = styleEdge(edge('h', 'a', 'b', { data: { kind: 'heartbeat' } })) as unknown as { style: Record<string, unknown>; markerEnd?: unknown };
    expect(hb.style.strokeDasharray).toBe('2 5');
    expect(hb.markerEnd).toBeUndefined();
  });
  it('auto-suggest: primary -> replica = replication; peers = heartbeat; unrelated / outside cluster = none', () => {
    const ns = [...pgCluster(), member('arb', 'arbiter', 500)];
    expect(suggestEdgeKind(ns, 'pg1', 'pg2')).toEqual({ kind: 'replication', replMode: 'async' });
    expect(suggestEdgeKind(ns, 'pg2', 'pg3')).toEqual({ kind: 'heartbeat' });
    expect(suggestEdgeKind(ns, 'pg1', 'app')).toBeNull();
    expect(suggestEdgeKind(ns, 'app', 'pg1')).toBeNull();
    expect(suggestEdgeKind(ns, 'pg2', 'pg1')).toEqual({ kind: 'heartbeat' }); // replica -> primary is not replication
  });
  it('connect() applies the suggestion only when both ends are in the same cluster', () => {
    for (const n of pgCluster()) s().addNode(n);
    s().connect({ source: 'pg1', target: 'pg2', sourceHandle: 'bottom', targetHandle: 'top' });
    s().connect({ source: 'app', target: 'pg1', sourceHandle: null, targetHandle: null });
    const [a, b] = s().edges;
    expect(a.data).toMatchObject({ kind: 'replication', replMode: 'async' });
    expect(a.label).toBe('async');
    expect(b.data?.kind).toBeUndefined();
  });
  it('updateEdges can set kind and replication mode', () => {
    for (const n of pgCluster()) s().addNode(n);
    s().addEdge({ source: 'pg1', target: 'pg2' });
    const id = s().edges[0].id;
    s().updateEdges([id], { kind: 'replication', replMode: 'sync' });
    expect(s().edges[0].data).toMatchObject({ kind: 'replication', replMode: 'sync' });
    expect(s().edges[0].label).toBe('sync');
    s().updateEdges([id], { kind: 'failover' });
    expect(s().edges[0].data?.kind).toBe('failover');
  });
});

describe('collapse / expand', () => {
  const full = () => [...pgCluster()];
  it('member count (x N) counts leaf members only, through sub-groups', () => {
    const ns = [...full(), { id: 'S', type: 'group' as const, position: { x: 10, y: 10 }, width: 100, height: 100, parentId: 'C', data: { label: 'shard' } }, member('deep', 'replica', 5, { parentId: 'S' })];
    expect(memberCount(ns, 'C')).toBe(4);
    expect(memberCount(full(), 'app')).toBe(0);
  });
  it('collapse shrinks the cluster to a compact node and hides every descendant', () => {
    const out = collapseCluster(full(), 'C');
    const c = out.find((n) => n.id === 'C')!;
    expect(c.data.collapsed).toBe(true);
    expect({ w: c.width, h: c.height }).toEqual({ w: COMPACT_SIZE.width, h: COMPACT_SIZE.height });
    for (const id of ['pg1', 'pg2', 'pg3']) expect(out.find((n) => n.id === id)!.hidden).toBe(true);
    expect(out.find((n) => n.id === 'app')!.hidden).toBeUndefined();
  });
  it('expand restores size and positions EXACTLY (deep-equal to the original)', () => {
    const original = full();
    const roundTrip = expandCluster(collapseCluster(structuredClone(original), 'C'), 'C');
    expect(roundTrip).toEqual(original);
    expect(JSON.stringify(roundTrip)).toBe(JSON.stringify(original));
  });
  it('collapsing is idempotent and expanding an expanded cluster is a no-op', () => {
    const once = collapseCluster(full(), 'C');
    expect(collapseCluster(once, 'C')).toEqual(once);
    expect(expandCluster(full(), 'C')).toEqual(full());
  });
  it('nested clusters: collapsing the outer hides inner ones too; inner state is kept', () => {
    const ns = [cluster('C'), { ...cluster('D'), parentId: 'C', position: { x: 20, y: 40 }, width: 300, height: 200 }, member('x', 'primary', 5, { parentId: 'D' })];
    const inner = collapseCluster(ns, 'D');
    const both = collapseCluster(inner, 'C');
    expect(both.find((n) => n.id === 'D')!.hidden).toBe(true);
    const back = expandCluster(both, 'C');
    expect(back.find((n) => n.id === 'D')!.hidden).toBeUndefined();
    expect(back.find((n) => n.id === 'D')!.data.collapsed).toBe(true); // inner stays collapsed
    expect(back.find((n) => n.id === 'x')!.hidden).toBe(true);
  });
  it('re-routes member edges to the collapsed cluster, drops internal ones, dedupes with a count', () => {
    const ns = collapseCluster(full(), 'C');
    const es = [
      edge('e1', 'app', 'pg1', { label: 'writes', data: { color: '#123' } }),
      edge('e2', 'app', 'pg2', { label: 'writes' }),
      edge('e3', 'app', 'pg3', { label: 'writes' }),
      edge('e4', 'pg1', 'pg2', { data: { kind: 'replication' } }), // internal
      edge('e5', 'pg3', 'app', { label: 'reads' }),
    ];
    const out = projectEdges(ns, es);
    expect(out.map((e) => e.id).sort()).toEqual(['e1', 'e5']);
    const e1 = out.find((e) => e.id === 'e1')!;
    expect([e1.source, e1.target]).toEqual(['app', 'C']);
    expect(e1.label).toBe('writes ×3');
    expect(e1.data).toMatchObject({ merged: 3, color: '#123' });
    const e5 = out.find((e) => e.id === 'e5')!;
    expect([e5.source, e5.target]).toEqual(['C', 'app']);
    expect(e5.label).toBe('reads');
  });
  it('expanded clusters leave edges untouched', () => {
    const es = [edge('e1', 'app', 'pg1')];
    expect(projectEdges(full(), es)).toBe(es);
  });
  it('store.toggleCollapse is undoable and survives serialization / .sdd', () => {
    for (const n of full()) s().addNode(n);
    s().toggleCollapse('C');
    expect(s().nodes.find((n) => n.id === 'C')!.data.collapsed).toBe(true);
    const json = serializeDiagram({ version: 1, nodes: s().nodes, edges: s().edges });
    const back = parseDiagram(json);
    expect(back.ok && back.diagram.nodes.find((n) => n.id === 'C')!.data.collapsed).toBe(true);
    expect(back.ok && back.diagram.nodes.find((n) => n.id === 'pg1')!.hidden).toBe(true);
    const p = createProject('x');
    p.pages[0].nodes = s().nodes;
    const viaSdd = readSdd(buildSdd(p)).project.pages[0].nodes;
    expect(viaSdd.find((n) => n.id === 'C')!.data.collapsed).toBe(true);
    s().undo();
    expect(s().nodes.find((n) => n.id === 'C')!.data.collapsed).toBeUndefined();
    expect(s().nodes.find((n) => n.id === 'pg1')!.hidden).toBeUndefined();
  });
});

describe('Add replica', () => {
  it('appends a node with the primary icon, role replica, and a replication edge from the primary', () => {
    for (const n of pgCluster()) s().addNode(n);
    const before = s().nodes.length;
    const id = s().addReplica('C')!;
    expect(s().nodes).toHaveLength(before + 1);
    const n = s().nodes.find((x) => x.id === id)!;
    expect(n.data).toMatchObject({ iconId: 'postgresql', role: 'replica' });
    expect(n.parentId).toBe('C');
    const e = s().edges.find((x) => x.target === id)!;
    expect(e.source).toBe('pg1');
    expect(e.data).toMatchObject({ kind: 'replication' });
    expect(e.label).toBeTruthy();
    s().undo();
    expect(s().nodes).toHaveLength(before);
    expect(s().edges).toHaveLength(0);
  });
  it('uses the cluster replication mode when set; returns null for non-clusters', () => {
    for (const n of pgCluster()) s().addNode(n);
    s().updateNodeData('C', { replication: 'sync' });
    const id = s().addReplica('C')!;
    expect(s().edges.find((x) => x.target === id)!.data?.replMode).toBe('sync');
    expect(s().addReplica('app')).toBeNull();
  });
  it('works without an explicit primary (first member acts as source)', () => {
    s().addNode(cluster());
    s().addNode(member('only', undefined, 40));
    const id = s().addReplica('C')!;
    expect(s().edges.find((x) => x.target === id)!.source).toBe('only');
  });
});

describe('wrap selection in cluster / adopt tech', () => {
  it('wraps selected leaves in a cluster that takes their common tech', () => {
    for (const n of [member('a', undefined, 0, { parentId: undefined }), member('b', undefined, 200, { parentId: undefined })]) s().addNode({ ...n, selected: true });
    s().wrapSelectionInCluster();
    const c = s().nodes.find((n) => n.type === 'cluster')!;
    expect(c.data.iconId).toBe('postgresql');
    expect(s().nodes.filter((n) => n.parentId === c.id)).toHaveLength(2);
    s().undo();
    expect(s().nodes.some((n) => n.type === 'cluster')).toBe(false);
  });
  it('dropping a DB onto an empty cluster makes it that tech', () => {
    s().addNode({ ...cluster('E'), data: { label: 'Cluster' } });
    s().addNode({ id: 'r', type: 'icon', position: { x: 160, y: 160 }, width: 100, height: 80, data: { label: 'Redis', iconId: 'redis' } });
    expect(s().nodes.find((n) => n.id === 'r')!.parentId).toBe('E');
    expect(s().nodes.find((n) => n.id === 'E')!.data.iconId).toBe('redis');
  });
});

describe('serialization of cluster data', () => {
  it('role, kind, collapsed and params round-trip and validate', () => {
    const nodes = [cluster('C', { data: { label: 'K', iconId: 'kafka', collapsed: false, topology: 'sharded', replication: 'sync', params: { brokers: 3 }, warnings: ['x'] } }), member('b1', 'broker', 10)];
    const es = [edge('e', 'b1', 'b1x', { data: { kind: 'replication', replMode: 'sync' } })];
    const ok = parseDiagram(JSON.stringify({ version: 1, nodes: [...nodes, member('b1x', 'replica', 100)], edges: es }));
    expect(ok.ok).toBe(true);
    for (const bad of [{ role: 5 }, { collapsed: 'yes' }]) {
      const r = parseDiagram(JSON.stringify({ version: 1, edges: [], nodes: [{ ...nodes[1], data: { label: 'x', ...bad } }] }));
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
    const badKind = parseDiagram(JSON.stringify({ version: 1, nodes: [member('b1', 'broker', 1), member('b2', 'broker', 2)], edges: [edge('e', 'b1', 'b2', { data: { kind: 'wormhole' as never } })] }));
    expect(badKind.ok).toBe(false);
  });
});
