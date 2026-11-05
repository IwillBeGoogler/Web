/* eslint-disable @typescript-eslint/no-explicit-any */
import { azs, bool, comp, defineSpecProfile, grp, num, sel, when, type CompSpec } from '../spec';
import { validateRole } from '../roles';
import { text } from './fields';

type A = Record<string, any>;
const GEN = 'Generic';
const TOPOS = ['active-active', 'active-passive', 'leader-follower', 'ring', 'shard-matrix', 'mesh', 'hub-spoke'] as const;
const is = (...t: string[]) => (p: A) => t.includes(p.topology);

const roleA = (p: A) => (p.roleA as string).trim() || 'primary';
const roleB = (p: A) => (p.roleB as string).trim() || 'replica';
const nodeRole = (i: number, _n: number, p: A): string => {
  switch (p.topology) {
    case 'active-active': case 'mesh': case 'ring': return roleA(p);
    case 'active-passive': case 'leader-follower': case 'hub-spoke': return i === 0 ? roleA(p) : roleB(p);
    default: return roleA(p);
  }
};
const matrixRow = (row: number): CompSpec<A> => comp(`r${row}`, row === 1 ? 'shard' : `replica-${row - 1}`, (p) => (p.topology === 'shard-matrix' && p.replicas >= row ? p.shards : 0), { role: row === 1 ? (_i: number, _n: number, p: A) => roleA(p) : (_i: number, _n: number, p: A) => roleB(p), port: undefined, noun: row === 1 ? 'shards' : 'replicas' });

export const genericClusterProfile = defineSpecProfile<A>({
  id: 'generic-cluster', tech: 'Generic', label: 'Generic cluster (free roles + topology)', iconId: 'server', accent: '#64748b', category: GEN, aliases: ['cluster', 'ha group', 'custom cluster', 'replica set', 'node group'], topologies: [...TOPOS], roles: ['primary', 'replica', 'leader', 'follower', 'standby', 'shard', 'coordinator', 'data'],
  fields: [
    sel('topology', 'Topology', TOPOS.map((t) => [t, t.replace('-', ' ')] as [string, string]), 'leader-follower'),
    num('nodes', 'Nodes', 2, 12, 3, (p) => !is('shard-matrix')(p as A)),
    num('shards', 'Shards', 1, 8, 3, is('shard-matrix')), num('replicas', 'Replicas per shard (rows)', 1, 4, 2, is('shard-matrix')),
    text('name', 'Node name', 'node'), text('roleA', 'Role of primary / first node', 'leader'), text('roleB', 'Role of other nodes', 'follower'),
    num('port', 'Port (0 = none)', 0, 65535, 0), azs(), bool('lb', 'Front load balancer', false),
  ],
  topology: (p) => p.topology,
  title: (p) => `Cluster (${String(p.topology).replace('-', ' ')})`,
  groups: [
    grp('n', (p) => `${p.topology.replace('-', ' ')} · ${p.nodes} nodes`, [comp('n', (p) => (String(p.name).trim() || 'node'), (p) => p.nodes, { role: nodeRole, noun: 'nodes' })], { show: (p) => !is('shard-matrix', 'hub-spoke')(p), azSpread: true, layout: (p) => (p.topology === 'ring' || (p.topology === 'mesh' && p.nodes > 3) ? 'ring' : 'rows') }),
    grp('hub', 'hub and spokes', [comp('hub', 'hub', 1, { role: (_i, _n, p) => roleA(p) }), comp('n', 'spoke', (p) => p.nodes - 1, { role: (_i, _n, p) => roleB(p), noun: 'spokes' })], { show: is('hub-spoke'), maxCols: 6 }),
    grp('mx', (p) => `${p.shards} shards x ${p.replicas} copies`, [1, 2, 3, 4].map(matrixRow), { show: is('shard-matrix'), maxCols: 8 }),
  ],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { iconId: 'load-balancer' })],
  links: [
    { from: 'n', to: 'n', mode: 'mesh', kind: 'replication', replMode: 'async', show: is('active-active'), data: { arrows: 'both' } },
    { from: 'n', to: 'n', mode: 'first-to-all', kind: 'replication', replMode: 'async', show: is('leader-follower') },
    { from: 'n', to: 'n', mode: 'first-to-all', kind: 'failover', show: is('active-passive') },
    { from: 'n', to: 'n', mode: 'ring', kind: 'heartbeat', show: is('ring') },
    { from: 'n', to: 'n', mode: 'mesh', kind: 'heartbeat', show: is('mesh'), data: { arrows: 'both' } },
    { from: 'hub', to: 'n', mode: 'first-to-all', show: is('hub-spoke') },
    { from: 'r1', to: 'r2', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r3', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r4', mode: 'pair', kind: 'replication', replMode: 'async' },
    { from: 'lb', to: 'n', mode: 'first-to-all', show: is('active-active', 'leader-follower', 'ring', 'mesh') },
    { from: 'lb', to: 'n', mode: 'first-to-first', show: is('active-passive') },
    { from: 'lb', to: 'hub', mode: 'first-to-first', show: is('hub-spoke') },
    { from: 'lb', to: 'r1', mode: 'first-to-all', show: is('shard-matrix') },
  ],
  rules: [
    (p) => { const a = validateRole(String(p.roleA)); return a.ok ? undefined : `Primary role: ${a.error}.`; },
    (p) => { const b = validateRole(String(p.roleB)); return b.ok ? undefined : `Other role: ${b.error}.`; },
    when((p) => p.topology === 'ring' && p.nodes < 3, 'A ring needs at least 3 nodes.'),
    when((p) => p.topology === 'mesh' && p.nodes > 6, 'Full mesh with more than 6 nodes is unreadable and costs n(n-1)/2 links; consider hub-spoke or ring.'),
    when((p) => p.topology === 'shard-matrix' && p.replicas === 1, 'One copy per shard: no redundancy.'),
    when((p) => p.topology === 'active-passive' && p.nodes > 3, 'Active-passive usually needs one or two standbys; extra passive nodes are idle capacity.'),
  ],
  summarize: (p) => (p.topology === 'shard-matrix' ? `shard matrix · ${p.shards} x ${p.replicas}` : `${String(p.topology).replace('-', ' ')} · ${p.nodes} nodes · ${roleA(p)}${p.nodes > 1 ? ` / ${roleB(p)}` : ''}`),
});

export const lbAppTierProfile = defineSpecProfile<A>({
  id: 'lb-app-tier', tech: 'Load-balanced app tier', label: 'Load balancer + app instances (autoscaling)', iconId: 'load-balancer', accent: '#0ea5e9', category: GEN, aliases: ['autoscaling group', 'asg', 'app tier', 'web tier', 'load balanced', 'lb cluster', 'stateless tier'], topologies: ['hub-spoke'], roles: ['coordinator', 'worker'],
  fields: [
    sel('lb', 'Load balancer', [['generic', 'Load balancer'], ['nginx', 'NGINX'], ['haproxy', 'HAProxy'], ['envoy', 'Envoy']], 'generic'),
    num('instances', 'Instances', 1, 20, 3), azs(), bool('autoscaling', 'Autoscaling', true),
    num('min', 'Min instances', 1, 20, 2, (p) => !!p.autoscaling), num('max', 'Max instances', 1, 100, 10, (p) => !!p.autoscaling), num('cpu', 'Target CPU %', 10, 95, 70, (p) => !!p.autoscaling),
    num('port', 'App port', 1, 65535, 8080), bool('health', 'Health checks', true),
  ],
  topology: 'hub-spoke',
  groups: [grp('i', (p) => `App instances${p.autoscaling ? ` (autoscaling ${p.min}-${p.max})` : ''}`, [comp('app', 'app', (p) => p.instances, { port: undefined, role: 'worker', iconId: 'server', noun: 'instances', sub: (_i, _n, p) => (p.autoscaling ? `scales ${p.min}-${p.max}` : undefined) })], { azSpread: true, maxCols: 6 })],
  externals: [
    comp('lb', 'Load balancer', (p) => (p.lb === 'generic' ? 1 : 0), { port: 443, iconId: 'load-balancer', role: 'coordinator' }),
    comp('lb', 'nginx', (p) => (p.lb === 'nginx' ? 1 : 0), { port: 443, iconId: 'nginx', role: 'coordinator' }),
    comp('lb', 'haproxy', (p) => (p.lb === 'haproxy' ? 1 : 0), { port: 443, iconId: 'haproxy', role: 'coordinator' }),
    comp('lb', 'envoy', (p) => (p.lb === 'envoy' ? 1 : 0), { port: 443, iconId: 'envoy', role: 'coordinator' }),
    comp('asg', 'autoscaler', (p) => (p.autoscaling ? 1 : 0), { iconId: 'cron', role: 'controller', sub: (_i, _n, p) => `${p.min}-${p.max} · CPU ${p.cpu}%` }),
  ],
  links: [{ from: 'lb', to: 'app', mode: 'first-to-all', label: 'round robin' }, { from: 'asg', to: 'app', mode: 'first-to-first', label: 'scales', data: { strokeStyle: 'dashed' } as never }],
  rules: [
    when((p) => p.autoscaling && p.min > p.max, 'Autoscaling min is above max.'),
    when((p) => p.autoscaling && (p.instances < p.min || p.instances > p.max), (p) => `Instances (${p.instances}) are outside the autoscaling range ${p.min}-${p.max}.`),
    when((p) => p.instances < 2, 'A single instance: no redundancy behind the load balancer.'),
    when((p) => p.azs > p.instances, 'More AZs than instances: some AZs stay empty.'),
  ],
  summarize: (p) => `${p.instances} instances${p.autoscaling ? ` · autoscaling ${p.min}-${p.max} @ ${p.cpu}% CPU` : ''}${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
});

export const GENERIC_PROFILES = [genericClusterProfile, lbAppTierProfile];
