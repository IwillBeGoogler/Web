/* eslint-disable @typescript-eslint/no-explicit-any */
import { azs, bool, comp, defineSpecProfile, grp, lead, minRule, num, oddRule, quorum, sel, when } from '../spec';
import { slotRanges } from '../profiles/redis';

type A = Record<string, any>;
const DB = 'Databases';

export const mariadbProfile = defineSpecProfile<A>({
  id: 'mariadb', tech: 'MariaDB', label: 'MariaDB (Galera / MaxScale)', iconId: 'mariadb', accent: '#003545', category: DB, aliases: ['galera cluster', 'maxscale cluster', 'mariadb galera'],
  topologies: ['multi-primary', 'single-primary'], roles: ['primary', 'replica'],
  fields: [sel('mode', 'Mode', [['galera', 'Galera (multi-primary)'], ['replication', 'Primary + replicas']], 'galera'), num('nodes', 'Nodes', 1, 9, 3), bool('maxscale', 'MaxScale proxy', true)],
  title: (p) => `MariaDB ${p.mode === 'galera' ? 'Galera' : 'replication'} cluster`, topology: (p) => (p.mode === 'galera' ? 'multi-primary' : 'single-primary'),
  groups: [grp('db', 'MariaDB nodes', [comp('node', 'mariadb', (p) => p.nodes, { port: 3306, noun: 'nodes', role: (i, _n, p) => (p.mode === 'galera' || i === 0 ? 'primary' : 'replica') })], { maxCols: 5 })],
  externals: [comp('maxscale', 'MaxScale', (p) => (p.maxscale ? 1 : 0), { port: 4006 })],
  links: [
    { from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat', label: 'wsrep', show: (p) => p.mode === 'galera' },
    { from: 'node', to: 'node', mode: 'first-to-all', kind: 'replication', replMode: 'async', show: (p) => p.mode !== 'galera' },
    { from: 'maxscale', to: 'node', mode: 'first-to-first', label: 'read/write split' },
  ],
  rules: [when((p) => p.mode === 'galera' && p.nodes < 3, 'Galera needs at least 3 nodes for quorum.'), oddRule('Galera nodes', (p) => (p.mode === 'galera' ? p.nodes : 0))],
  summarize: (p) => `${p.mode === 'galera' ? 'Galera' : 'Replication'} · ${p.nodes} nodes${p.maxscale ? ' · MaxScale' : ''}`,
});

const redisLike = (id: string, tech: string, icon: string, accent: string, aliases: string[]) =>
  defineSpecProfile<A>({
    id, tech, label: `${tech} (cluster)`, iconId: icon, accent, category: DB, aliases, topologies: ['sharded', 'single-primary'], roles: ['master', 'replica'],
    fields: [num('masters', 'Masters', 3, 8, 3), num('replicas', 'Replicas per master', 0, 3, 1)], topology: 'sharded',
    groups: [
      grp('m', 'Masters (hash slots)', [comp('master', 'master', (p) => p.masters, { port: 6379, role: 'master', sub: (i, n) => { const r = slotRanges(n)[i]; return `slots ${r.from}-${r.to}`; }, noun: 'masters' })]),
      grp('r', 'Replicas', [comp('replica', 'replica', (p) => p.masters * p.replicas, { port: 6379, role: 'replica', noun: 'replicas' })]),
    ],
    links: [{ from: 'master', to: 'replica', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'master', to: 'master', mode: 'chain', kind: 'heartbeat' }],
    rules: [when((p) => p.replicas === 0, 'Without replicas a failed master loses its slots (no failover).')],
    summarize: (p) => `${p.masters} masters x ${1 + p.replicas} · 16384 slots`,
  });
export const valkeyProfile = redisLike('valkey', 'Valkey', 'valkey', '#6983ff', ['valkey cluster']);
export const dragonflyProfile = defineSpecProfile<A>({
  id: 'dragonfly', tech: 'DragonflyDB', label: 'DragonflyDB (primary + replicas)', iconId: 'dragonfly', accent: '#b57ffe', category: DB, topologies: ['single-primary'], roles: ['master', 'replica'],
  fields: [num('replicas', 'Replicas', 0, 5, 2), bool('sentinel', 'Sentinel for failover', true)],
  groups: [grp('d', 'Dragonfly nodes', [comp('master', 'dragonfly', 1, { port: 6379, role: 'master' }), comp('replica', 'replica', (p) => p.replicas, { port: 6379, role: 'replica', noun: 'replicas' })]), grp('s', 'Sentinels', [comp('sentinel', 'sentinel', 3, { port: 26379, role: 'sentinel' })], { show: (p) => p.sentinel })],
  links: [{ from: 'master', to: 'replica', mode: 'first-to-all', kind: 'replication', replMode: 'async' }, { from: 'sentinel', to: 'sentinel', mode: 'chain', kind: 'heartbeat' }, { from: 'sentinel', to: 'master', mode: 'first-to-first', label: 'monitor' }],
  rules: [when((p) => p.replicas === 0, 'No replicas: nothing to fail over to.')],
  summarize: (p) => `1 master + ${p.replicas} replicas${p.sentinel ? ' · 3 sentinels' : ''}`,
});
export const keydbProfile = defineSpecProfile<A>({
  id: 'keydb', tech: 'KeyDB', label: 'KeyDB (active-active)', iconId: 'keydb', accent: '#d62d2d', category: DB, topologies: ['multi-primary'], roles: ['master'],
  fields: [num('nodes', 'Nodes', 2, 5, 2)], topology: 'multi-primary',
  groups: [grp('n', 'KeyDB masters (multi-master)', [comp('node', 'keydb', (p) => p.nodes, { port: 6379, role: 'master', noun: 'nodes' })])],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'replication', replMode: 'async', data: { arrows: 'both' } }],
  rules: [when((p) => p.nodes < 2, 'Active-active needs at least two nodes.')],
});
export const memcachedProfile = defineSpecProfile<A>({
  id: 'memcached', tech: 'Memcached', label: 'Memcached (client-side sharding)', iconId: 'memcached', accent: '#4fa94e', category: DB, aliases: ['memcache ring'], topologies: ['ring'], roles: ['shard'],
  fields: [num('nodes', 'Memcached nodes', 2, 12, 4)], topology: 'ring',
  groups: [grp('ring', 'Consistent-hash ring', [comp('node', 'memcached', (p) => p.nodes, { port: 11211, role: 'shard', noun: 'nodes' })], { layout: 'ring' })],
  externals: [comp('clients', 'app clients', 1, { iconId: 'service' })],
  links: [{ from: 'clients', to: 'node', mode: 'first-to-all', label: 'hash(key)' }],
  rules: [when((p) => p.nodes < 3, 'Few nodes: losing one remaps a large share of the keys; add nodes or use consistent hashing.')],
  summarize: (p) => `${p.nodes} nodes · client-side consistent hashing`,
});
export const scylladbProfile = defineSpecProfile<A>({
  id: 'scylladb', tech: 'ScyllaDB', label: 'ScyllaDB ring', iconId: 'scylladb', accent: '#4e9fd1', category: DB, topologies: ['ring'], roles: ['data'],
  fields: [num('nodes', 'Nodes', 3, 12, 6), num('rf', 'Replication factor', 1, 5, 3)], topology: 'ring',
  groups: [grp('ring', (p) => `dc1 (RF ${p.rf})`, [comp('node', 'node', (p) => p.nodes, { port: 9042, role: 'data', noun: 'nodes' })], { layout: 'ring' })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat' }],
  rules: [when((p) => p.rf > p.nodes, (p) => `Replication factor (${p.rf}) exceeds the node count (${p.nodes}).`), when((p) => p.rf < 3, 'RF below 3: QUORUM cannot tolerate a node loss.')],
  summarize: (p) => `${p.nodes} nodes · RF${p.rf} · shard-per-core`,
});
export const cockroachProfile = defineSpecProfile<A>({
  id: 'cockroachdb', tech: 'CockroachDB', label: 'CockroachDB', iconId: 'cockroachdb', accent: '#6933ff', category: DB, aliases: ['crdb cluster'], topologies: ['multi-primary'], roles: ['data'],
  fields: [num('nodes', 'Nodes', 3, 12, 3), azs(), bool('lb', 'Load balancer', true)], topology: 'multi-primary',
  groups: [grp('n', 'CockroachDB nodes (Raft ranges, RF 3)', [comp('node', 'crdb', (p) => p.nodes, { port: 26257, role: 'data', noun: 'nodes' })], { azSpread: true })],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { iconId: 'load-balancer' })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat', label: 'gossip' }, { from: 'lb', to: 'node', mode: 'first-to-all' }],
  rules: [minRule(3, (p) => p.nodes, 'CockroachDB needs at least 3 nodes for RF 3.'), when((p) => p.azs > 1 && p.nodes < p.azs * 1, 'More AZs than nodes.')],
});
export const yugabyteProfile = defineSpecProfile<A>({
  id: 'yugabytedb', tech: 'YugabyteDB', label: 'YugabyteDB', iconId: 'yugabytedb', accent: '#ff6d3b', category: DB, aliases: ['yugabyte cluster', 'yb cluster'], topologies: ['multi-primary'], roles: ['leader', 'follower', 'data'],
  fields: [quorum('masters', 'YB-Masters'), num('tservers', 'YB-TServers', 3, 12, 3), num('rf', 'Replication factor', 1, 5, 3), azs()], topology: 'multi-primary',
  groups: [grp('m', 'YB-Master (catalog)', [comp('master', 'yb-master', (p) => p.masters, { port: 7100, role: lead, noun: 'masters' })]), grp('t', 'YB-TServer (tablets)', [comp('tserver', 'yb-tserver', (p) => p.tservers, { port: 9100, role: 'data', noun: 'tservers' })], { azSpread: true })],
  links: [{ from: 'master', to: 'master', mode: 'chain', kind: 'heartbeat' }, { from: 'master', to: 'tserver', mode: 'first-to-first', label: 'tablet assignment' }],
  rules: [when((p) => p.rf > p.tservers, 'Replication factor exceeds the TServer count.'), oddRule('YB-Masters', (p) => p.masters)],
});
export const tidbProfile = defineSpecProfile<A>({
  id: 'tidb', tech: 'TiDB', label: 'TiDB (PD + TiKV + TiDB + TiFlash)', iconId: 'tidb', accent: '#e60012', category: DB, aliases: ['tikv cluster'], topologies: ['multi-primary'], roles: ['leader', 'follower', 'data', 'coordinator'],
  fields: [quorum('pd', 'PD nodes'), num('tikv', 'TiKV nodes', 3, 12, 3), num('tidb', 'TiDB servers', 1, 8, 2), num('tiflash', 'TiFlash nodes', 0, 6, 0)], topology: 'multi-primary',
  groups: [
    grp('sql', 'TiDB (SQL layer)', [comp('tidb', 'tidb', (p) => p.tidb, { port: 4000, role: 'coordinator', noun: 'TiDB servers' })]),
    grp('pd', 'Placement Driver', [comp('pd', 'pd', (p) => p.pd, { port: 2379, role: lead, noun: 'PD nodes' })]),
    grp('store', 'Storage', [comp('tikv', 'tikv', (p) => p.tikv, { port: 20160, role: 'data', noun: 'TiKV nodes' }), comp('tiflash', 'tiflash', (p) => p.tiflash, { port: 3930, role: 'data', noun: 'TiFlash nodes' })]),
  ],
  links: [{ from: 'tidb', to: 'pd', mode: 'first-to-first', label: 'metadata / TSO' }, { from: 'tidb', to: 'tikv', mode: 'first-to-first', label: 'gRPC' }, { from: 'pd', to: 'pd', mode: 'chain', kind: 'heartbeat' }, { from: 'tikv', to: 'tiflash', mode: 'first-to-first', kind: 'replication', replMode: 'async', label: 'Raft learner' }],
  rules: [oddRule('PD nodes', (p) => p.pd), when((p) => p.tidb < 2, 'A single TiDB server is a single point of failure for SQL.')],
});
export const vitessProfile = defineSpecProfile<A>({
  id: 'vitess', tech: 'Vitess', label: 'Vitess (vtgate / vttablet)', iconId: 'vitess', accent: '#f4a300', category: DB, topologies: ['sharded'], roles: ['coordinator', 'primary', 'replica', 'leader', 'follower'],
  fields: [num('shards', 'Shards', 1, 6, 2), num('replicas', 'Replicas per shard', 1, 4, 2), num('vtgate', 'vtgate instances', 1, 6, 2), quorum('topo', 'Topology server (etcd) nodes')], topology: 'sharded',
  arrange: 'rows',
  groups: [
    grp('gate', 'vtgate (routing)', [comp('vtgate', 'vtgate', (p) => p.vtgate, { port: 15991, role: 'coordinator', noun: 'vtgates' })]),
    grp('tablets', 'vttablets', [comp('primary', 'vttablet-primary', (p) => p.shards, { port: 15100, role: 'primary', noun: 'primaries' }), comp('replica', 'vttablet-replica', (p) => p.shards * p.replicas, { port: 15100, role: 'replica', noun: 'replicas' })]),
    grp('topo', 'Topology service (etcd)', [comp('etcd', 'etcd', (p) => p.topo, { port: 2379, role: lead, iconId: 'etcd', noun: 'etcd nodes' })]),
  ],
  links: [{ from: 'vtgate', to: 'primary', mode: 'first-to-all', kind: 'sharding', label: 'route' }, { from: 'primary', to: 'replica', mode: 'pair', kind: 'replication', replMode: 'semi-sync' }, { from: 'etcd', to: 'etcd', mode: 'chain', kind: 'heartbeat' }],
  rules: [oddRule('topology nodes', (p) => p.topo), when((p) => p.vtgate < 2, 'A single vtgate is a single point of failure.')],
  summarize: (p) => `${p.shards} shards x ${1 + p.replicas} tablets · ${p.vtgate} vtgate · ${p.topo} topo`,
});
export const citusProfile = defineSpecProfile<A>({
  id: 'citus', tech: 'Citus', label: 'Citus (distributed PostgreSQL)', iconId: 'postgresql', accent: '#336791', category: DB, aliases: ['citus cluster'], topologies: ['sharded'], roles: ['coordinator', 'shard', 'standby'],
  fields: [num('workers', 'Workers', 2, 12, 3), bool('standby', 'Coordinator standby', true)], topology: 'sharded',
  groups: [grp('c', 'Coordinator', [comp('coordinator', 'coordinator', 1, { port: 5432, role: 'coordinator' }), comp('standby', 'coordinator-standby', (p) => (p.standby ? 1 : 0), { port: 5432, role: 'standby' })]), grp('w', 'Workers (shards)', [comp('worker', 'worker', (p) => p.workers, { port: 5432, role: 'shard', noun: 'workers' })])],
  links: [{ from: 'coordinator', to: 'worker', mode: 'first-to-all', kind: 'sharding', label: 'shards' }, { from: 'coordinator', to: 'standby', mode: 'first-to-first', kind: 'replication', replMode: 'async' }],
  rules: [when((p) => !p.standby, 'No coordinator standby: the coordinator is a single point of failure.')],
});
export const neo4jProfile = defineSpecProfile<A>({
  id: 'neo4j', tech: 'Neo4j', label: 'Neo4j (primaries + secondaries)', iconId: 'neo4j', accent: '#018bff', category: DB, topologies: ['quorum'], roles: ['leader', 'follower', 'replica'],
  fields: [sel('cores', 'Primary servers (Raft)', [[3, '3'], [5, '5']], 3), num('replicas', 'Secondary (read) servers', 0, 8, 2)], topology: 'quorum',
  groups: [grp('core', 'Primaries (Raft)', [comp('core', 'core', (p) => p.cores, { port: 7687, role: lead, noun: 'primaries' })]), grp('rr', 'Read replicas', [comp('replica', 'read-replica', (p) => p.replicas, { port: 7687, role: 'replica', noun: 'secondaries' })])],
  links: [{ from: 'core', to: 'core', mode: 'chain', kind: 'heartbeat' }, { from: 'core', to: 'replica', mode: 'first-to-all', kind: 'replication', replMode: 'async', label: 'tx log' }],
  rules: [oddRule('primaries', (p) => p.cores)],
});
export const arangoProfile = defineSpecProfile<A>({
  id: 'arangodb', tech: 'ArangoDB', label: 'ArangoDB cluster', iconId: 'arangodb', accent: '#68a63d', category: DB, topologies: ['sharded'], roles: ['leader', 'follower', 'coordinator', 'shard'],
  fields: [quorum('agents', 'Agents'), num('coordinators', 'Coordinators', 1, 6, 2), num('dbservers', 'DB-Servers', 2, 9, 3)], topology: 'sharded',
  groups: [grp('agency', 'Agency (Raft)', [comp('agent', 'agent', (p) => p.agents, { port: 8531, role: lead, noun: 'agents' })]), grp('c', 'Coordinators', [comp('coord', 'coordinator', (p) => p.coordinators, { port: 8529, role: 'coordinator', noun: 'coordinators' })]), grp('d', 'DB-Servers', [comp('db', 'dbserver', (p) => p.dbservers, { port: 8530, role: 'shard', noun: 'DB-Servers' })])],
  links: [{ from: 'agent', to: 'agent', mode: 'chain', kind: 'heartbeat' }, { from: 'coord', to: 'db', mode: 'first-to-all', kind: 'sharding' }],
  rules: [oddRule('agents', (p) => p.agents), when((p) => p.coordinators < 2, 'A single coordinator is a single point of failure.')],
});
export const couchbaseProfile = defineSpecProfile<A>({
  id: 'couchbase', tech: 'Couchbase', label: 'Couchbase (multi-dimensional scaling)', iconId: 'couchbase', accent: '#ea2328', category: DB, topologies: ['sharded'], roles: ['data', 'coordinator'],
  fields: [num('data', 'Data service nodes', 3, 12, 3), num('index', 'Index service nodes', 0, 6, 2), num('query', 'Query service nodes', 0, 6, 2), num('search', 'Search service nodes', 0, 4, 0), azs()], topology: 'sharded',
  groups: [
    grp('data', 'Data service', [comp('data', 'data', (p) => p.data, { port: 11210, role: 'data', noun: 'data nodes' })], { azSpread: true }),
    grp('svc', 'Index / Query / Search services', [comp('index', 'index', (p) => p.index, { port: 9102, role: 'data', noun: 'index nodes' }), comp('query', 'query', (p) => p.query, { port: 8093, role: 'coordinator', noun: 'query nodes' }), comp('search', 'search', (p) => p.search, { port: 8094, role: 'data', noun: 'search nodes' })]),
  ],
  links: [{ from: 'data', to: 'data', mode: 'chain', kind: 'replication', replMode: 'async', label: 'DCP', data: { arrows: 'both' } }, { from: 'query', to: 'data', mode: 'first-to-first' }, { from: 'query', to: 'index', mode: 'first-to-first' }],
  rules: [minRule(3, (p) => p.data, 'Fewer than 3 data nodes: auto-failover needs at least 3.')],
});
export const couchdbProfile = defineSpecProfile<A>({
  id: 'couchdb', tech: 'CouchDB', label: 'CouchDB cluster', iconId: 'couchdb', accent: '#e42528', category: DB, topologies: ['multi-primary'], roles: ['data'],
  fields: [num('nodes', 'Nodes', 1, 9, 3), bool('lb', 'Load balancer', true)], topology: 'multi-primary',
  groups: [grp('n', 'CouchDB nodes (n=3, q=2 shards)', [comp('node', 'couchdb', (p) => p.nodes, { port: 5984, role: 'data', noun: 'nodes' })])],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { iconId: 'load-balancer' })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'replication', replMode: 'async', data: { arrows: 'both' } }, { from: 'lb', to: 'node', mode: 'first-to-all' }],
  rules: [minRule(3, (p) => p.nodes, 'Fewer than 3 nodes: shard copies (n=3) cannot be spread.')],
});
export const ravendbProfile = defineSpecProfile<A>({
  id: 'ravendb', tech: 'RavenDB', label: 'RavenDB cluster', iconId: 'ravendb', accent: '#dd5a20', category: DB, topologies: ['quorum'], roles: ['leader', 'follower'],
  fields: [sel('nodes', 'Cluster nodes (Raft)', [[3, '3'], [5, '5']], 3)], topology: 'quorum',
  groups: [grp('n', 'RavenDB nodes (Raft cluster, multi-master databases)', [comp('node', 'raven', (p) => p.nodes, { port: 8080, role: lead, noun: 'nodes' })])],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat' }],
  rules: [oddRule('nodes', (p) => p.nodes)],
});
export const aerospikeProfile = defineSpecProfile<A>({
  id: 'aerospike', tech: 'Aerospike', label: 'Aerospike (rack aware)', iconId: 'aerospike', accent: '#c4302b', category: DB, topologies: ['sharded'], roles: ['data'],
  fields: [num('nodes', 'Nodes', 3, 12, 4), azs(), bool('xdr', 'XDR to a second DC', false)], topology: 'sharded',
  groups: [grp('n', 'Aerospike nodes (partition map)', [comp('node', 'asd', (p) => p.nodes, { port: 3000, role: 'data', noun: 'nodes' })], { azSpread: true })],
  externals: [comp('dc2', 'DC2 cluster', (p) => (p.xdr ? 1 : 0), { port: 3000 })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat', label: 'mesh' }, { from: 'node', to: 'dc2', mode: 'first-to-first', kind: 'replication', replMode: 'async', label: 'XDR' }],
  rules: [minRule(3, (p) => p.nodes, 'Fewer than 3 nodes: no protection with replication factor 2.')],
});
export const hazelcastProfile = defineSpecProfile<A>({
  id: 'hazelcast', tech: 'Hazelcast', label: 'Hazelcast (IMDG)', iconId: 'hazelcast', accent: '#f6b100', category: DB, topologies: ['ring'], roles: ['master', 'data'],
  fields: [num('members', 'Members', 3, 12, 3), num('clients', 'Clients', 0, 6, 2), azs()], topology: 'ring',
  groups: [grp('m', 'Hazelcast cluster (partitions + backups)', [comp('member', 'member', (p) => p.members, { port: 5701, role: (i) => (i === 0 ? 'master' : 'data'), noun: 'members' })], { azSpread: true })],
  externals: [comp('client', 'client', (p) => p.clients, { iconId: 'service' })],
  links: [{ from: 'member', to: 'member', mode: 'chain', kind: 'heartbeat' }, { from: 'client', to: 'member', mode: 'pair', label: 'smart client' }],
  rules: [minRule(3, (p) => p.members, 'Fewer than 3 members: split-brain protection needs a quorum.')],
});
export const igniteProfile = defineSpecProfile<A>({
  id: 'ignite', tech: 'Apache Ignite', label: 'Apache Ignite', iconId: 'ignite', accent: '#ee1c25', category: DB, topologies: ['ring'], roles: ['data'],
  fields: [num('servers', 'Server nodes', 3, 12, 3), num('clients', 'Client nodes', 0, 6, 2), azs()], topology: 'ring',
  groups: [grp('s', 'Server nodes (baseline topology)', [comp('server', 'ignite', (p) => p.servers, { port: 10800, role: 'data', noun: 'server nodes' })], { azSpread: true })],
  externals: [comp('client', 'thin client', (p) => p.clients, { iconId: 'service' })],
  links: [{ from: 'server', to: 'server', mode: 'chain', kind: 'heartbeat', label: 'discovery ring' }, { from: 'client', to: 'server', mode: 'pair' }],
  rules: [minRule(3, (p) => p.servers, 'Fewer than 3 server nodes: no fault tolerance with 1 backup.')],
});
export const foundationdbProfile = defineSpecProfile<A>({
  id: 'foundationdb', tech: 'FoundationDB', label: 'FoundationDB', iconId: 'foundationdb', accent: '#1f6feb', category: DB, topologies: ['quorum'], roles: ['coordinator', 'storage', 'log', 'proxy', 'resolver'],
  fields: [sel('coordinators', 'Coordinators', [[3, '3'], [5, '5'], [7, '7']], 3), num('storage', 'Storage servers', 3, 12, 3), num('logs', 'Transaction logs', 2, 8, 3), num('proxies', 'Commit / GRV proxies', 1, 6, 2), num('resolvers', 'Resolvers', 1, 4, 1)], topology: 'quorum',
  groups: [grp('coord', 'Coordinators (Paxos)', [comp('coordinator', 'coordinator', (p) => p.coordinators, { port: 4500, role: 'coordinator', noun: 'coordinators' })]), grp('txn', 'Transaction subsystem', [comp('proxy', 'proxy', (p) => p.proxies, { port: 4501, role: 'proxy', noun: 'proxies' }), comp('resolver', 'resolver', (p) => p.resolvers, { port: 4502, role: 'resolver', noun: 'resolvers' }), comp('log', 'tlog', (p) => p.logs, { port: 4503, role: 'log', noun: 'logs' })]), grp('st', 'Storage', [comp('storage', 'storage', (p) => p.storage, { port: 4504, role: 'storage', noun: 'storage servers' })])],
  links: [{ from: 'coordinator', to: 'coordinator', mode: 'chain', kind: 'heartbeat' }, { from: 'proxy', to: 'resolver', mode: 'first-to-first' }, { from: 'proxy', to: 'log', mode: 'first-to-first' }, { from: 'log', to: 'storage', mode: 'first-to-first', label: 'mutations' }],
  rules: [oddRule('coordinators', (p) => p.coordinators)],
});
export const singlestoreProfile = defineSpecProfile<A>({
  id: 'singlestore', tech: 'SingleStore', label: 'SingleStore (aggregators + leaves)', iconId: 'singlestore', accent: '#aa00ff', category: DB, topologies: ['sharded'], roles: ['coordinator', 'primary', 'replica', 'leader'],
  fields: [num('aggregators', 'Child aggregators', 1, 6, 2), num('leaves', 'Leaf nodes', 2, 12, 4), sel('ha', 'High availability', [[2, 'HA (2 copies)'], [1, 'None']], 2)], topology: 'sharded',
  groups: [grp('agg', 'Aggregators', [comp('master', 'master-agg', 1, { port: 3306, role: 'leader' }), comp('child', 'child-agg', (p) => p.aggregators, { port: 3306, role: 'coordinator', noun: 'child aggregators' })]), grp('leaf', 'Leaves (partitions)', [comp('leaf', 'leaf', (p) => p.leaves, { port: 3306, role: (i) => (i % 2 === 0 ? 'primary' : 'replica'), noun: 'leaves' })])],
  links: [{ from: 'master', to: 'child', mode: 'first-to-all', kind: 'heartbeat' }, { from: 'child', to: 'leaf', mode: 'first-to-first', kind: 'sharding', label: 'fan-out' }, { from: 'leaf', to: 'leaf', mode: 'pair', kind: 'replication', replMode: 'async', show: (p) => p.ha === 2 && p.leaves > 1 }],
  rules: [when((p) => p.ha === 1, 'No HA: losing a leaf loses its partitions.'), when((p) => p.ha === 2 && p.leaves % 2 === 1, 'HA works in leaf pairs: use an even number of leaves.')],
});
export const oracleRacProfile = defineSpecProfile<A>({
  id: 'oracle-rac', tech: 'Oracle RAC', label: 'Oracle RAC', iconId: 'oracle-db', accent: '#c74634', category: DB, aliases: ['oracle cluster', 'rac cluster'], topologies: ['multi-primary'], roles: ['primary', 'witness'],
  fields: [num('nodes', 'RAC nodes', 2, 8, 2), bool('dataguard', 'Data Guard standby', false)], topology: 'multi-primary',
  groups: [grp('rac', 'Oracle RAC nodes (Cache Fusion)', [comp('node', 'rac', (p) => p.nodes, { port: 1521, role: 'primary', noun: 'nodes' })]), grp('stor', 'Shared storage', [comp('asm', 'ASM disk group', 1, { iconId: 'file-storage' })])],
  externals: [comp('standby', 'Data Guard standby', (p) => (p.dataguard ? 1 : 0), { port: 1521 })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'heartbeat', label: 'interconnect' }, { from: 'node', to: 'asm', mode: 'first-to-first', label: 'shared disk' }, { from: 'node', to: 'standby', mode: 'first-to-first', kind: 'replication', replMode: 'async', label: 'redo' }],
  rules: [minRule(2, (p) => p.nodes, 'RAC needs at least two nodes.')],
});
export const sqlserverAgProfile = defineSpecProfile<A>({
  id: 'sqlserver-ag', tech: 'SQL Server', label: 'SQL Server Always On AG', iconId: 'sqlserver', accent: '#cc2927', category: DB, aliases: ['always on', 'mssql ag'], topologies: ['single-primary'], roles: ['primary', 'replica', 'witness'],
  fields: [num('secondaries', 'Secondary replicas', 1, 8, 2), sel('mode', 'Availability mode', [['sync', 'Synchronous commit'], ['async', 'Asynchronous commit']], 'sync'), bool('witness', 'File-share witness', true)], topology: 'single-primary',
  groups: [grp('ag', 'Availability group', [comp('primary', 'sql', 1, { port: 1433, role: 'primary' }), comp('secondary', 'sql-secondary', (p) => p.secondaries, { port: 1433, role: 'replica', noun: 'secondaries' })]), grp('w', 'Quorum', [comp('witness', 'witness', (p) => (p.witness ? 1 : 0), { role: 'witness', iconId: 'file-storage' })])],
  externals: [comp('listener', 'AG listener', 1, { port: 1433, iconId: 'load-balancer' })],
  links: [{ from: 'primary', to: 'secondary', mode: 'first-to-all', kind: 'replication', replMode: (p) => (p.mode === 'sync' ? 'sync' : 'async') }, { from: 'listener', to: 'primary', mode: 'first-to-first', label: 'routes to primary' }, { from: 'witness', to: 'primary', mode: 'first-to-first', kind: 'heartbeat' }],
  rules: [when((p) => !p.witness && (1 + p.secondaries) % 2 === 0, 'Even number of voting nodes without a witness: add a file-share witness.'), when((p) => p.mode === 'async', 'Asynchronous commit can lose data on failover.')],
});
export const db2PureScaleProfile = defineSpecProfile<A>({
  id: 'db2-purescale', tech: 'IBM Db2', label: 'Db2 pureScale', iconId: 'db2', accent: '#054ada', category: DB, aliases: ['db2 cluster', 'purescale'], topologies: ['multi-primary'], roles: ['primary', 'leader', 'standby'],
  fields: [num('members', 'Members', 2, 8, 3)], topology: 'multi-primary',
  groups: [grp('m', 'Members (active-active)', [comp('member', 'member', (p) => p.members, { port: 50000, role: 'primary', noun: 'members' })]), grp('cf', 'Cluster caching facilities', [comp('cf', 'cf', 2, { port: 56000, role: (i) => (i === 0 ? 'primary' : 'standby'), noun: 'CFs' })]), grp('st', 'Shared storage', [comp('gpfs', 'GPFS storage', 1, { iconId: 'file-storage' })])],
  links: [{ from: 'member', to: 'cf', mode: 'first-to-first', label: 'RDMA' }, { from: 'cf', to: 'cf', mode: 'chain', kind: 'replication', replMode: 'sync' }, { from: 'member', to: 'gpfs', mode: 'first-to-first' }],
});

export const DATABASE_PROFILES = [mariadbProfile, valkeyProfile, dragonflyProfile, keydbProfile, memcachedProfile, scylladbProfile, cockroachProfile, yugabyteProfile, tidbProfile, vitessProfile, citusProfile, neo4jProfile, arangoProfile, couchbaseProfile, couchdbProfile, ravendbProfile, aerospikeProfile, hazelcastProfile, igniteProfile, foundationdbProfile, singlestoreProfile, oracleRacProfile, sqlserverAgProfile, db2PureScaleProfile];
