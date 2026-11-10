import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../types';
import { collapseCluster, expandCluster, memberCount, projectEdges, COMPACT_SIZE } from './collapse';
import { CLUSTER_GAP, freeSpot, pushSiblingsClear, rectOf } from './spacing';
import { isPrimaryRole, isReplicaRole, roleKind, roleSummary, validateRole } from './roles';
import { PROFILES, getProfile } from './profiles';
import { regenerateCluster } from './regenerate';

const N = (id: string, o: Partial<DiagramNode> & { data?: Record<string, unknown> } = {}): DiagramNode =>
  ({ id, type: 'icon', position: { x: 0, y: 0 }, ...o, data: { label: id, ...(o.data ?? {}) } }) as DiagramNode;
const E = (id: string, source: string, target: string, label?: string): DiagramEdge => ({ id, source, target, ...(label ? { label } : {}) }) as DiagramEdge;

describe('collapse', () => {
  const nodes = [
    N('c', { type: 'cluster', width: 400, height: 300 }),
    N('g', { type: 'group', parentId: 'c' }),
    N('a', { parentId: 'g' }),
    N('b', { parentId: 'c' }),
    N('out'),
  ];
  it('memberCount counts leaves when expanded', () => {
    expect(memberCount(nodes, 'c')).toBe(2);
    expect(memberCount(nodes, 'missing')).toBe(0);
  });
  it('collapse hides descendants, remembers the size; expand restores them', () => {
    const col = collapseCluster(nodes, 'c');
    const c = col.find((n) => n.id === 'c')!;
    expect(c.data).toMatchObject({ collapsed: true, expandedSize: { width: 400, height: 300 } });
    expect(c).toMatchObject({ width: COMPACT_SIZE.width, height: COMPACT_SIZE.height });
    expect(col.filter((n) => n.hidden).map((n) => n.id).sort()).toEqual(['a', 'b', 'g']);
    expect(collapseCluster(col, 'c')).toBe(col);
    expect(collapseCluster(nodes, 'out')).toBe(nodes);
    expect(memberCount(col, 'c')).toBe(2);
    const ex = expandCluster(col, 'c');
    expect(ex.find((n) => n.id === 'c')).toMatchObject({ width: 400, height: 300 });
    expect(ex.find((n) => n.id === 'c')!.data.collapsed).toBeUndefined();
    expect(ex.some((n) => n.hidden)).toBe(false);
    expect(expandCluster(nodes, 'c')).toBe(nodes);
  });
  it('a visible node parented into a collapsed card is not a member', () => {
    const col = collapseCluster(nodes, 'c').map((n) => (n.id === 'b' ? { ...n, hidden: false } : n));
    expect(memberCount(col, 'c')).toBe(1);
  });
  it('expand uses the node size without a saved size, and keeps inner collapsed clusters closed', () => {
    const inner = [N('o', { type: 'cluster', width: 500, height: 400 }), N('i', { type: 'cluster', parentId: 'o', width: 100, height: 100 }), N('leaf', { parentId: 'i' }), N('x', { parentId: 'o' })];
    const col = collapseCluster(collapseCluster(inner, 'i'), 'o');
    const noSize = col.map((n) => (n.id === 'o' ? { ...n, data: { label: 'o', collapsed: true } } : n)) as DiagramNode[];
    const ex = expandCluster(noSize, 'o');
    expect(ex.find((n) => n.id === 'o')).toMatchObject({ width: COMPACT_SIZE.width });
    expect(ex.find((n) => n.id === 'leaf')!.hidden).toBe(true);
    expect(ex.find((n) => n.id === 'x')!.hidden).toBeFalsy();
  });
  it('projectEdges: untouched without collapsed clusters; reroutes, drops internal, merges duplicates with a count', () => {
    const edges = [E('e0', 'a', 'out'), E('e1', 'b', 'out'), E('e2', 'a', 'b'), E('e3', 'out', 'a', 'x'), E('e4', 'out', 'b', 'x'), E('e5', 'out', 'a', 'x'), E('e6', 'out', 'out')];
    expect(projectEdges(nodes, edges)).toBe(edges);
    const col = collapseCluster(nodes, 'c');
    const out = projectEdges(col, edges);
    expect(out.map((e) => [e.source, e.target, e.label ?? ''])).toEqual([['c', 'out', '×2'], ['out', 'c', 'x ×3']]);
    expect(out[0].data).toMatchObject({ merged: 2 });
    expect(out[1].data).toMatchObject({ merged: 3 });
    const unlabeled = projectEdges(col, [E('u1', 'a', 'out'), E('u2', 'b', 'out')]);
    expect(unlabeled).toHaveLength(1);
    expect(unlabeled[0].label).toBe('×2');
  });
  it('projectEdges keeps edges of a visible node wrongly parented into a card', () => {
    const col = collapseCluster(nodes, 'c').map((n) => (n.id === 'g' ? { ...n, hidden: false } : n));
    const out = projectEdges(col, [E('e', 'a', 'out')]);
    expect(out[0].source).toBe('a');
  });
});

describe('collapse odd inputs', () => {
  it('expands a collapsed cluster that has no style, and ignores hidden orphans when projecting edges', () => {
    const ns = [N('c', { type: 'cluster', data: { collapsed: true, expandedSize: { width: 300, height: 200 } } }), N('orphan', { hidden: true }), N('k', { parentId: 'c', hidden: true })];
    const ex = expandCluster(ns, 'c');
    expect(ex[0]).toMatchObject({ width: 300, height: 200, style: { width: 300, height: 200 } });
    const out = projectEdges(ns, [E('e', 'orphan', 'k'), E('f', 'k', 'orphan')]);
    expect(out.map((e) => [e.source, e.target])).toEqual([['orphan', 'c'], ['c', 'orphan']]);
    expect(memberCount(ns, 'c')).toBe(1);
  });
});

describe('spacing', () => {
  const box = (id: string, x: number, y: number, w = 100, h = 100, extra: Partial<DiagramNode> = {}) => N(id, { position: { x, y }, width: w, height: h, ...extra });
  it('rectOf uses absolute position and size', () => {
    const ns = [box('p', 10, 10, 300, 300, { type: 'group' }), box('k', 5, 5, 20, 30, { parentId: 'p' })];
    expect(rectOf(ns, ns[1])).toEqual({ x: 15, y: 15, width: 20, height: 30 });
  });
  it('pushSiblingsClear: unknown id and no overlap are no-ops', () => {
    const ns = [box('a', 0, 0), box('b', 500, 0)];
    expect(pushSiblingsClear(ns, 'zzz')).toBe(ns);
    expect(pushSiblingsClear(ns, 'a')).toBe(ns);
  });
  it('pushes an overlapped sibling right when that is the shorter move, down otherwise, and cascades', () => {
    const right = pushSiblingsClear([box('a', 0, 0, 100, 400), box('b', 90, 0, 50, 50)], 'a');
    expect(right.find((n) => n.id === 'b')!.position).toEqual({ x: 100 + CLUSTER_GAP, y: 0 });
    const down = pushSiblingsClear([box('a', 0, 0, 400, 100), box('b', 0, 90, 50, 50)], 'a');
    expect(down.find((n) => n.id === 'b')!.position).toEqual({ x: 0, y: 100 + CLUSTER_GAP });
    const chain = pushSiblingsClear([box('a', 0, 0, 400, 100), box('b', 0, 90, 400, 50), box('c', 0, 190, 400, 50)], 'a');
    expect(chain.find((n) => n.id === 'c')!.position.y).toBeGreaterThan(190);
  });
  it('ignores hidden siblings and other parents; a sibling that enclosed the old rect stays', () => {
    const ns = [box('a', 0, 0, 100, 100), box('h', 10, 10, 50, 50, { hidden: true }), box('o', 10, 10, 50, 50, { parentId: 'zz' })];
    expect(pushSiblingsClear(ns, 'a')).toBe(ns);
    const enclosing = [box('a', 20, 20, 100, 100), box('frame', 0, 0, 300, 300)];
    expect(pushSiblingsClear(enclosing, 'a', { x: 20, y: 20, width: 50, height: 50 })).toBe(enclosing);
    expect(pushSiblingsClear(enclosing, 'a', { x: 500, y: 500, width: 5, height: 5 })).not.toBe(enclosing);
  });
  it('freeSpot slides below blockers, repeatedly, and ignores nested/hidden nodes', () => {
    const ns = [box('a', 0, 0, 100, 100), box('b', 0, 130, 100, 100), box('hid', 0, 300, 100, 100, { hidden: true }), box('kid', 0, 300, 100, 100, { parentId: 'a' })];
    expect(freeSpot(ns, { x: 0, y: 0 }, { width: 50, height: 50 })).toEqual({ x: 0, y: 130 + 100 + CLUSTER_GAP });
    expect(freeSpot(ns, { x: 0, y: 320 }, { width: 50, height: 50 })).toEqual({ x: 0, y: 320 });
  });
});

describe('roles', () => {
  it('classifies roles', () => {
    expect(roleKind('leader')).toBe('accent');
    expect(roleKind('witness')).toBe('outline');
    expect(roleKind('follower')).toBe('muted');
    expect(isPrimaryRole('master')).toBe(true);
    expect(isPrimaryRole()).toBe(false);
    expect(isReplicaRole('standby')).toBe(true);
    expect(isReplicaRole('primary')).toBe(false);
  });
  it('validateRole trims and rejects empty, long and control characters', () => {
    expect(validateRole('  x ')).toEqual({ ok: true, role: 'x' });
    expect(validateRole('  ')).toMatchObject({ ok: false });
    expect(validateRole('a'.repeat(25))).toMatchObject({ ok: false });
    expect(validateRole('a\u0007b')).toMatchObject({ ok: false });
  });
  it('roleSummary orders known roles first, pluralizes, and handles custom roles', () => {
    const ns = [N('c', { type: 'cluster' }), N('1', { parentId: 'c', data: { role: 'replica' } }), N('2', { parentId: 'c', data: { role: 'replica' } }), N('3', { parentId: 'c', data: { role: 'primary' } }), N('4', { parentId: 'c', data: { role: 'zebra' } }), N('5', { parentId: 'c', data: { role: 'zebra' } }), N('6', { parentId: 'c', data: { role: 'aardvark' } }), N('7', { parentId: 'c' })];
    expect(roleSummary(ns, 'c')).toBe('1 primary · 2 replicas · 2 zebras · 1 aardvark');
    expect(roleSummary(ns, 'none')).toBe('');
  });
});

describe('regenerate with size-less generated nodes', () => {
  it('keeps the existing size when the fresh node has none, and records 0 for a collapsed root', () => {
    const mkProfile = (withSize: boolean) => ({
      generate: (_p: unknown, prefix: string) => ({
        rootId: prefix, size: { width: 10, height: 10 }, edges: [],
        nodes: [
          { id: prefix, type: 'cluster', position: { x: 0, y: 0 }, data: { label: 'r' } },
          { id: `${prefix}-m`, type: 'icon', parentId: prefix, position: { x: 5, y: 5 }, ...(withSize ? { width: 7, height: 8, style: { width: 7 } } : {}), data: { label: 'm' } },
        ],
      }),
    }) as never;
    const existing = [N('r', { type: 'cluster', data: { collapsed: true } }), N('r-m', { parentId: 'r', width: 33, height: 44, data: { genPos: { x: 5, y: 5 } } })];
    const out = regenerateCluster(existing, [], 'r', mkProfile(false), {});
    expect(out.nodes.find((n) => n.id === 'r-m')).toMatchObject({ width: 33, height: 44 });
    expect(out.nodes.find((n) => n.id === 'r')!.data.expandedSize).toEqual({ width: 0, height: 0 });
    const sized = regenerateCluster(existing, [], 'r', mkProfile(true), {});
    expect(sized.nodes.find((n) => n.id === 'r-m')).toMatchObject({ width: 7, height: 8, style: { width: 7 } });
  });
});

describe('generic + cassandra edge cases', () => {
  it('blank role/name fields fall back to defaults', () => {
    const p = getProfile('generic-cluster')!;
    const g = p.generate({ ...p.defaults, topology: 'active-passive', roleA: ' ', roleB: '', name: '  ', nodes: 3 }, 'z');
    expect(g.nodes.find((n) => n.id === 'z-n-1')!.data).toMatchObject({ role: 'primary', label: 'node-1' });
    expect(g.nodes.find((n) => n.id === 'z-n-2')!.data.role).toBe('replica');
    expect(p.summarize({ ...p.defaults, topology: 'shard-matrix', shards: 2, replicas: 2 })).toBe('shard matrix · 2 x 2');
    const hub = p.generate({ ...p.defaults, topology: 'hub-spoke', nodes: 4 }, 'z');
    expect(hub.nodes.filter((n) => n.type === 'icon')).toHaveLength(4);
    for (const t of ['ring', 'mesh', 'active-active']) expect(p.generate({ ...p.defaults, topology: t, nodes: 5 }, 'z').nodes.filter((n) => n.type === 'icon').length).toBe(5);
    expect(p.validate({ ...p.defaults, topology: 'active-passive', nodes: 5 }).join()).toMatch(/Active-passive/);
  });
  it('cassandra with two nodes per DC has no wrap-around edge', () => {
    const c = getProfile('cassandra')!;
    const two = c.generate({ ...c.defaults, nodesPerDc: 2, dcs: 1 }, 'q');
    expect(two.edges.filter((e) => e.target.endsWith('-n1') && e.source.endsWith('-n2'))).toHaveLength(0);
  });
});

describe('profile edge cases', () => {
  const gen = (id: string, over: Record<string, unknown>) => { const p = getProfile(id)!; const params = { ...p.defaults, ...over }; return { p, params, g: p.generate(params, 'q') }; };
  it('quorum warns for too few and too many nodes', () => {
    const q = getProfile('quorum')!;
    expect(q.validate({ ...q.defaults, nodes: 1 }).join()).toMatch(/Fewer than 3/);
    expect(q.validate({ ...q.defaults, nodes: 7 }).join()).not.toMatch(/More than 7/);
    expect(q.validate({ ...q.defaults, nodes: 9 }).join()).toMatch(/More than 7/);
  });
  it('cassandra / clickhouse / mysql warnings and ring closing', () => {
    const c = getProfile('cassandra')!;
    expect(c.validate({ ...c.defaults, nodesPerDc: 2 }).join()).toMatch(/Fewer than 3 nodes per datacenter/);
    const { g } = gen('cassandra', { nodesPerDc: 4 });
    expect(g.edges.some((e) => e.target.endsWith('-n1') && e.source.endsWith('-n4'))).toBe(true);
    const ch = getProfile('clickhouse')!;
    expect(ch.validate({ ...ch.defaults, keeper: 4 }).join()).toMatch(/Even number of Keeper/);
    expect(ch.validate({ ...ch.defaults, keeper: 3 }).join()).not.toMatch(/Even number/);
  });
  it('every profile is registered once and exposes a unique id', () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
    expect(getProfile('nope')).toBeUndefined();
  });
  it('regenerate keeps a collapsed cluster collapsed and hides new members; falls back to the origin without a root', () => {
    const p = getProfile('redis')!;
    const first = regenerateCluster([], [], 'r', p, p.defaults);
    const root = first.nodes.find((n) => n.id === 'r')!;
    expect(root.position).toEqual({ x: 0, y: 0 });
    const col = collapseCluster(first.nodes, 'r');
    const again = regenerateCluster(col, first.edges, 'r', p, { ...p.defaults, replicas: 3 });
    const r2 = again.nodes.find((n) => n.id === 'r')!;
    expect(r2.data.collapsed).toBe(true);
    expect(r2.data.expandedSize).toBeTruthy();
    expect(again.nodes.filter((n) => n.id !== 'r').every((n) => n.hidden)).toBe(true);
    // a member the user moved keeps its position
    const moved = first.nodes.map((n) => (n.id !== 'r' && n.type === 'icon' ? { ...n, position: { x: n.position.x + 77, y: n.position.y + 11 } } : n));
    const keep = regenerateCluster(moved, first.edges, 'r', p, p.defaults);
    const icon = moved.find((n) => n.type === 'icon')!;
    expect(keep.nodes.find((n) => n.id === icon.id)!.position).toEqual(icon.position);
  });
});
