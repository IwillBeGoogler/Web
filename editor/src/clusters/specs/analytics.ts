/* eslint-disable @typescript-eslint/no-explicit-any */
import { azs, bool, comp, defineSpecProfile, grp, lead, num, oddRule, quorum, sel, when, withExporter } from '../spec';

type A = Record<string, any>;
const SA = 'Search & Analytics';
const OBS = 'Observability';

const store = (label = 'Object storage', iconId = 'minio') => comp('objstore', label, 1, { iconId, port: 9000 });
const zk = (key = 'zk', n: (p: A) => number = () => 3) => grp(key, 'ZooKeeper', [comp(key, 'zookeeper', n, { port: 2181, role: lead, iconId: 'zookeeper', noun: 'zookeepers' })]);

/* ---------------- search ---------------- */
export const opensearchProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'opensearch', tech: 'OpenSearch', label: 'OpenSearch (dedicated roles)', iconId: 'opensearch', accent: '#005eb8', category: SA, aliases: ['opensearch cluster'], topologies: ['tiered'], roles: ['master', 'data', 'ingest', 'coordinator'],
  fields: [quorum('masters', 'Cluster-manager nodes'), num('data', 'Data nodes', 1, 12, 3), num('ingest', 'Ingest nodes', 0, 4, 0), num('replicas', 'Index replicas', 0, 3, 1), azs(), bool('dashboards', 'OpenSearch Dashboards', true)], topology: 'tiered',
  groups: [
    grp('m', 'Cluster-manager (voting)', [comp('master', 'master', (p) => p.masters, { port: 9300, role: lead, noun: 'cluster managers' })]),
    grp('d', 'Data nodes', [comp('data', 'data', (p) => p.data, { port: 9200, role: 'data', noun: 'data nodes' })], { azSpread: true }),
    grp('i', 'Ingest', [comp('ingest', 'ingest', (p) => p.ingest, { port: 9200, role: 'ingest', noun: 'ingest nodes' })], { show: (p) => p.ingest > 0 }),
  ],
  externals: [comp('dash', 'Dashboards', (p) => (p.dashboards ? 1 : 0), { port: 5601, iconId: 'opensearch-dashboards' })],
  links: [{ from: 'master', to: 'master', mode: 'chain', kind: 'heartbeat' }, { from: 'master', to: 'data', mode: 'first-to-first', label: 'cluster state' }, { from: 'ingest', to: 'data', mode: 'first-to-first' }, { from: 'dash', to: 'data', mode: 'first-to-first', label: 'REST' }],
  rules: [oddRule('cluster-manager nodes', (p) => p.masters), when((p) => p.replicas >= p.data, (p) => `${p.replicas} replicas need at least ${p.replicas + 1} data nodes (replicas are never co-located with their primary).`), when((p) => p.azs > p.data, 'More AZs than data nodes.')],
  summarize: (p) => `${p.masters} managers · ${p.data} data · ${p.replicas} replica${p.replicas === 1 ? '' : 's'}${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
}, { target: 'data', port: 9114, label: 'es-exporter' }));

export const solrcloudProfile = defineSpecProfile<A>({
  id: 'solrcloud', tech: 'SolrCloud', label: 'SolrCloud (shards x replicas)', iconId: 'solr', accent: '#d9411e', category: SA, aliases: ['solr cluster'], topologies: ['shard-matrix'], roles: ['leader', 'replica', 'follower'],
  fields: [num('shards', 'Shards', 1, 8, 2), num('rf', 'Replication factor', 1, 4, 2), quorum('zk', 'ZooKeeper ensemble')], topology: 'shard-matrix',
  groups: [
    grp('mx', (p) => `Collection: ${p.shards} shards x RF ${p.rf}`, [
      comp('r1', 'leader', (p) => p.shards, { port: 8983, role: 'leader', noun: 'shard leaders' }),
      comp('r2', 'replica', (p) => (p.rf >= 2 ? p.shards : 0), { port: 8983, role: 'replica', noun: 'replicas' }),
      comp('r3', 'replica-b', (p) => (p.rf >= 3 ? p.shards : 0), { port: 8983, role: 'replica', noun: 'replicas' }),
      comp('r4', 'replica-c', (p) => (p.rf >= 4 ? p.shards : 0), { port: 8983, role: 'replica', noun: 'replicas' }),
    ], { maxCols: 8 }),
    zk(),
  ],
  links: [{ from: 'r1', to: 'r2', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r3', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r4', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'zk', to: 'zk', mode: 'chain', kind: 'heartbeat' }, { from: 'zk', to: 'r1', mode: 'first-to-first', label: 'cluster state' }],
  rules: [oddRule('ZooKeeper nodes', (p) => p.zk), when((p) => p.rf === 1, 'RF 1: a lost node loses its shard.')],
  summarize: (p) => `${p.shards} shards x RF${p.rf} = ${p.shards * p.rf} cores · ${p.zk} ZK`,
});

export const druidProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'druid', tech: 'Apache Druid', label: 'Apache Druid (master / query / data)', iconId: 'druid', accent: '#29f1fa', category: SA, aliases: ['druid cluster'], topologies: ['tiered'], roles: ['coordinator', 'broker', 'data', 'leader'],
  fields: [num('masters', 'Master servers (Coordinator+Overlord)', 1, 3, 2), num('brokers', 'Brokers', 1, 6, 2), num('historicals', 'Historicals', 2, 12, 3), num('middlemanagers', 'MiddleManagers / Indexers', 0, 8, 2), azs()], topology: 'tiered',
  groups: [
    grp('master', 'Master', [comp('coord', 'coordinator-overlord', (p) => p.masters, { port: 8081, role: 'coordinator', noun: 'masters' })]),
    grp('query', 'Query', [comp('broker', 'broker', (p) => p.brokers, { port: 8082, role: 'broker', noun: 'brokers' }), comp('router', 'router', 1, { port: 8888, role: 'coordinator' })]),
    grp('data', 'Data', [comp('hist', 'historical', (p) => p.historicals, { port: 8083, role: 'data', noun: 'historicals' }), comp('mm', 'middlemanager', (p) => p.middlemanagers, { port: 8091, role: 'data', noun: 'middlemanagers' })], { azSpread: true }),
  ],
  externals: [comp('zk', 'zookeeper', 1, { port: 2181, iconId: 'zookeeper' }), comp('meta', 'metadata store', 1, { port: 5432, iconId: 'postgresql' }), comp('deep', 'deep storage', 1, { iconId: 'minio' })],
  links: [{ from: 'router', to: 'broker', mode: 'first-to-first', label: 'route' }, { from: 'broker', to: 'hist', mode: 'first-to-first', label: 'scatter' }, { from: 'coord', to: 'hist', mode: 'first-to-first', label: 'segments' }, { from: 'coord', to: 'zk', mode: 'first-to-first' }, { from: 'coord', to: 'meta', mode: 'first-to-first' }, { from: 'hist', to: 'deep', mode: 'first-to-first', label: 'pull' }],
  rules: [when((p) => p.masters < 2, 'Single master: no Coordinator/Overlord failover.'), when((p) => p.brokers < 2, 'Single broker: queries are interrupted when it restarts.')],
}, { target: 'broker', port: 9102, label: 'druid-exporter' }));

export const pinotProfile = defineSpecProfile<A>({
  id: 'pinot', tech: 'Apache Pinot', label: 'Apache Pinot', iconId: 'pinot', accent: '#7c3aed', category: SA, aliases: ['pinot cluster'], topologies: ['tiered'], roles: ['controller', 'broker', 'data'],
  fields: [num('controllers', 'Controllers', 1, 5, 3), num('brokers', 'Brokers', 1, 6, 2), num('servers', 'Servers', 2, 12, 3), num('replicas', 'Segment replicas', 1, 3, 2), quorum('zk', 'ZooKeeper')], topology: 'tiered',
  groups: [grp('ctl', 'Controllers (Helix)', [comp('controller', 'controller', (p) => p.controllers, { port: 9000, role: 'controller', noun: 'controllers' })]), grp('brk', 'Brokers', [comp('broker', 'broker', (p) => p.brokers, { port: 8099, role: 'broker', noun: 'brokers' })]), grp('srv', 'Servers (segments)', [comp('server', 'server', (p) => p.servers, { port: 8098, role: 'data', noun: 'servers' })])],
  externals: [comp('zk', 'zookeeper', (p) => (p.zk ? 1 : 0), { port: 2181, iconId: 'zookeeper' })],
  links: [{ from: 'broker', to: 'server', mode: 'first-to-all', label: 'scatter-gather' }, { from: 'controller', to: 'zk', mode: 'first-to-first', label: 'Helix' }],
  rules: [when((p) => p.replicas > p.servers, 'Segment replicas exceed the server count.'), when((p) => p.controllers === 2, 'Two controllers: lead-controller election gains nothing over one; use 1 or 3.')],
  summarize: (p) => `${p.controllers} controllers · ${p.brokers} brokers · ${p.servers} servers · ${p.replicas} replicas`,
});

const olap = (id: string, tech: string, icon: string, accent: string, fe: { port: number; node: string }, be: { port: number; node: string }, beLabel: string) =>
  defineSpecProfile<A>(withExporter<A>({
    id, tech, label: `${tech} (FE / ${be.node.toUpperCase()})`, iconId: icon, accent, category: SA, aliases: [`${id} cluster`], topologies: ['tiered'], roles: ['leader', 'follower', 'data'],
    fields: [sel('fe', 'Frontend (FE) nodes', [[1, '1'], [3, '3 (1 leader + 2 followers)'], [5, '5']], 3), num('be', `${beLabel} nodes`, 3, 24, 3), num('replicas', 'Tablet replicas', 1, 3, 3), bool('lb', 'Load balancer (MySQL protocol)', true)], topology: 'tiered',
    groups: [
      grp('fe', 'Frontends (metadata, planning)', [comp('fe', 'fe', (p) => p.fe, { port: fe.port, role: lead, noun: 'FEs' })]),
      grp('be', `${beLabel} (storage + compute)`, [comp('be', be.node, (p) => p.be, { port: be.port, role: 'data', noun: `${be.node.toUpperCase()}s` })], { maxCols: 6 }),
    ],
    externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 9030, iconId: 'load-balancer' })],
    links: [{ from: 'fe', to: 'fe', mode: 'chain', kind: 'replication', replMode: 'sync', label: 'BDBJE' }, { from: 'fe', to: 'be', mode: 'first-to-all', label: 'plan fragments' }, { from: 'lb', to: 'fe', mode: 'first-to-all' }],
    rules: [oddRule('FE nodes', (p) => p.fe), when((p) => p.replicas > p.be, (p) => `${p.replicas} tablet replicas need at least ${p.replicas} ${be.node.toUpperCase()} nodes.`), when((p) => p.fe === 1, 'Single FE: metadata is a single point of failure.')],
    summarize: (p) => `${p.fe} FE · ${p.be} ${be.node.toUpperCase()} · ${p.replicas} replicas`,
  }, { target: 'be', port: 8030, label: 'metrics' }));
export const starrocksProfile = olap('starrocks', 'StarRocks', 'starrocks', '#00c8a0', { port: 9030, node: 'fe' }, { port: 9050, node: 'be' }, 'Backend (BE)');
export const dorisProfile = olap('doris', 'Apache Doris', 'doris', '#2bb4ff', { port: 9030, node: 'fe' }, { port: 9050, node: 'be' }, 'Backend (BE)');

export const trinoProfile = defineSpecProfile<A>({
  id: 'trino', tech: 'Trino', label: 'Trino (coordinator + workers)', iconId: 'trino', accent: '#dd00a1', category: SA, aliases: ['presto cluster'], topologies: ['hub-spoke'], roles: ['coordinator', 'data'],
  fields: [num('workers', 'Workers', 1, 20, 4), bool('ha', 'Standby coordinator', false), bool('metastore', 'Hive metastore', true), bool('lake', 'Object-storage lake', true)], topology: 'hub-spoke',
  groups: [grp('c', 'Coordinators', [comp('coord', 'coordinator', 1, { port: 8080, role: 'coordinator' }), comp('coord2', 'coordinator-standby', (p) => (p.ha ? 1 : 0), { port: 8080, role: 'standby' })]), grp('w', 'Workers (stateless)', [comp('worker', 'worker', (p) => p.workers, { port: 8080, role: 'data', noun: 'workers' })], { maxCols: 6 })],
  externals: [comp('hms', 'Hive metastore', (p) => (p.metastore ? 1 : 0), { port: 9083, iconId: 'hive' }), comp('lake', 'Object storage', (p) => (p.lake ? 1 : 0), { iconId: 'minio' })],
  links: [{ from: 'coord', to: 'worker', mode: 'first-to-all', label: 'tasks' }, { from: 'coord', to: 'coord2', mode: 'first-to-first', kind: 'failover' }, { from: 'coord', to: 'hms', mode: 'first-to-first', label: 'catalog' }, { from: 'worker', to: 'lake', mode: 'first-to-first', label: 'splits' }],
  rules: [when((p) => p.workers < 2, 'One worker: no parallelism and no failure tolerance for running queries.')],
});

export const influxdbProfile = defineSpecProfile<A>({
  id: 'influxdb', tech: 'InfluxDB', label: 'InfluxDB Enterprise (meta + data)', iconId: 'influxdb', accent: '#22adf6', category: OBS, aliases: ['influx enterprise', 'influxdb cluster'], topologies: ['tiered'], roles: ['leader', 'follower', 'data'],
  fields: [quorum('meta', 'Meta nodes'), num('data', 'Data nodes', 2, 12, 4), num('rf', 'Replication factor', 1, 4, 2), bool('lb', 'Load balancer', true)], topology: 'tiered',
  groups: [grp('meta', 'Meta nodes (Raft)', [comp('meta', 'meta', (p) => p.meta, { port: 8091, role: lead, noun: 'meta nodes' })]), grp('data', (p) => `Data nodes (RF ${p.rf})`, [comp('data', 'data', (p) => p.data, { port: 8086, role: 'data', noun: 'data nodes' })])],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 8086, iconId: 'load-balancer' })],
  links: [{ from: 'meta', to: 'meta', mode: 'chain', kind: 'heartbeat' }, { from: 'meta', to: 'data', mode: 'first-to-all', label: 'cluster metadata' }, { from: 'data', to: 'data', mode: 'chain', kind: 'replication', replMode: 'async', label: 'hinted handoff' }, { from: 'lb', to: 'data', mode: 'first-to-all' }],
  rules: [oddRule('meta nodes', (p) => p.meta), when((p) => p.rf > p.data, 'Replication factor exceeds the data node count.'), when((p) => p.rf > 1 && p.data % p.rf !== 0, 'Data node count should be a multiple of the replication factor for even shard-group placement.')],
});

export const timescaledbProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'timescaledb', tech: 'TimescaleDB', label: 'TimescaleDB HA (Patroni)', iconId: 'timescaledb', accent: '#fdb515', category: OBS, aliases: ['timescale cluster'], topologies: ['single-primary'], roles: ['primary', 'replica', 'leader'],
  fields: [num('replicas', 'Streaming replicas', 1, 4, 2), sel('mode', 'Replication', [['sync', 'Synchronous'], ['async', 'Asynchronous']], 'async'), quorum('dcs', 'etcd (Patroni DCS)'), bool('pgbouncer', 'PgBouncer', true), azs()], topology: 'single-primary',
  groups: [grp('db', 'TimescaleDB nodes', [comp('primary', 'primary', 1, { port: 5432, role: 'primary' }), comp('replica', 'replica', (p) => p.replicas, { port: 5432, role: 'replica', noun: 'replicas' })], { azSpread: true }), grp('dcs', 'etcd (leader lock)', [comp('etcd', 'etcd', (p) => p.dcs, { port: 2379, role: lead, iconId: 'etcd', noun: 'etcd nodes' })])],
  externals: [comp('pgb', 'PgBouncer', (p) => (p.pgbouncer ? 1 : 0), { port: 6432, iconId: 'postgresql' })],
  links: [{ from: 'primary', to: 'replica', mode: 'first-to-all', kind: 'replication', replMode: (p) => (p.mode === 'sync' ? 'sync' : 'async') }, { from: 'etcd', to: 'etcd', mode: 'chain', kind: 'heartbeat' }, { from: 'etcd', to: 'primary', mode: 'first-to-first', label: 'Patroni' }, { from: 'pgb', to: 'primary', mode: 'first-to-first' }],
  rules: [oddRule('etcd nodes', (p) => p.dcs)],
  summarize: (p) => `1 primary + ${p.replicas} replicas (${p.mode}) · ${p.dcs} etcd`,
}, { target: 'primary', port: 9187, label: 'postgres-exporter', iconId: 'postgres-exporter' }));

export const victoriametricsProfile = defineSpecProfile<A>({
  id: 'victoriametrics', tech: 'VictoriaMetrics', label: 'VictoriaMetrics cluster', iconId: 'victoriametrics-cluster', accent: '#621773', category: OBS, aliases: ['vm cluster', 'victoriametrics cluster', 'vmstorage'], topologies: ['tiered'], roles: ['coordinator', 'data'],
  fields: [num('insert', 'vminsert', 1, 6, 2), num('select', 'vmselect', 1, 6, 2), num('storage', 'vmstorage', 2, 12, 3), num('rf', 'Replication factor', 1, 3, 2), bool('vmauth', 'vmauth / LB', true)], topology: 'tiered',
  groups: [grp('ins', 'Write path', [comp('insert', 'vminsert', (p) => p.insert, { port: 8480, role: 'coordinator', noun: 'vminserts' })]), grp('st', (p) => `Storage (RF ${p.rf})`, [comp('storage', 'vmstorage', (p) => p.storage, { port: 8482, role: 'data', noun: 'vmstorages' })]), grp('sel', 'Read path', [comp('select', 'vmselect', (p) => p.select, { port: 8481, role: 'coordinator', noun: 'vmselects' })])],
  externals: [comp('auth', 'vmauth', (p) => (p.vmauth ? 1 : 0), { port: 8427, iconId: 'vmauth' })],
  links: [{ from: 'insert', to: 'storage', mode: 'first-to-all', label: 'sharded write' }, { from: 'select', to: 'storage', mode: 'first-to-all', label: 'fan-out read' }, { from: 'auth', to: 'insert', mode: 'first-to-first' }, { from: 'auth', to: 'select', mode: 'first-to-first' }],
  rules: [when((p) => p.rf > p.storage, 'Replication factor exceeds vmstorage count.'), when((p) => p.rf === 1, 'RF 1: losing a vmstorage loses recent data.')],
});

export const thanosProfile = defineSpecProfile<A>({
  id: 'thanos', tech: 'Thanos', label: 'Thanos (global view)', iconId: 'thanos', accent: '#6d41ff', category: OBS, aliases: ['thanos stack'], topologies: ['hub-spoke'], roles: ['coordinator', 'data'],
  fields: [num('prom', 'Prometheus + sidecar pairs', 1, 6, 2), num('queriers', 'Queriers', 1, 4, 2), num('stores', 'Store gateways', 1, 4, 2), bool('ruler', 'Ruler', false), bool('compactor', 'Compactor (singleton)', true)], topology: 'hub-spoke',
  groups: [grp('scrape', 'Prometheus + Thanos sidecar', [comp('prom', 'prometheus', (p) => p.prom, { port: 9090, iconId: 'prometheus', role: 'data', noun: 'Prometheus' }), comp('sidecar', 'sidecar', (p) => p.prom, { port: 10901, iconId: 'thanos', role: 'data', noun: 'sidecars' })]), grp('q', 'Query layer', [comp('qf', 'query-frontend', 1, { port: 9090, role: 'coordinator', iconId: 'thanos' }), comp('query', 'querier', (p) => p.queriers, { port: 10902, role: 'coordinator', iconId: 'thanos', noun: 'queriers' }), comp('ruler', 'ruler', (p) => (p.ruler ? 1 : 0), { port: 10902, iconId: 'thanos' })]), grp('s', 'Long-term storage', [comp('store', 'store-gateway', (p) => p.stores, { port: 10901, iconId: 'thanos', role: 'data', noun: 'store gateways' }), comp('compact', 'compactor', (p) => (p.compactor ? 1 : 0), { port: 10902, iconId: 'thanos' })])],
  externals: [store('Object storage (S3)')],
  links: [{ from: 'prom', to: 'sidecar', mode: 'pair' }, { from: 'qf', to: 'query', mode: 'first-to-all' }, { from: 'query', to: 'sidecar', mode: 'first-to-all', label: 'StoreAPI' }, { from: 'query', to: 'store', mode: 'first-to-all', label: 'StoreAPI' }, { from: 'sidecar', to: 'objstore', mode: 'first-to-first', label: 'upload blocks' }, { from: 'store', to: 'objstore', mode: 'first-to-first' }, { from: 'compact', to: 'objstore', mode: 'first-to-first', label: 'compact' }, { from: 'ruler', to: 'query', mode: 'first-to-first' }],
  rules: [when((p) => p.prom < 2, 'A single Prometheus replica: no HA (run 2 identical replicas with distinct external labels).'), when((p) => p.queriers < 2, 'Single querier is a single point of failure.')],
  summarize: (p) => `${p.prom} Prometheus+sidecar · ${p.queriers} queriers · ${p.stores} store gw`,
});

/* grafana LGTM microservices share the same shape: distributors -> ingesters (hash ring) -> object store */
const lgtm = (id: string, tech: string, icon: string, accent: string, port: number, extra: { key: string; label: string; port: number }, readWorker: { key: string; label: string }) =>
  defineSpecProfile<A>(withExporter<A>({
    id, tech, label: `${tech} (microservices)`, iconId: icon, accent, category: OBS, aliases: [`${id} microservices`, `${id} distributed`], topologies: ['tiered', 'ring'], roles: ['coordinator', 'data'],
    fields: [num('distributors', 'Distributors', 1, 8, 2), num('ingesters', 'Ingesters', 1, 12, 3), num('queriers', 'Queriers', 1, 8, 2), num('rf', 'Replication factor', 1, 3, 3), bool('compactor', 'Compactor', true), bool('memberlist', 'Gossip ring (memberlist)', true), azs()], topology: 'tiered',
    groups: [
      grp('w', 'Write path', [comp('dist', 'distributor', (p) => p.distributors, { port, role: 'coordinator', noun: 'distributors' }), comp('ing', 'ingester', (p) => p.ingesters, { port: 9095, role: 'data', noun: 'ingesters' })], { show: () => true }),
      grp('r', 'Read path', [comp('qf', 'query-frontend', 1, { port: 8080, role: 'coordinator' }), comp('query', 'querier', (p) => p.queriers, { port: 8080, role: 'coordinator', noun: 'queriers' }), comp('extra', extra.label, 1, { port: extra.port, role: 'data' }), comp('compact', 'compactor', (p) => (p.compactor ? 1 : 0), { port: 8080, role: 'data' })]),
    ],
    externals: [store()],
    links: [{ from: 'dist', to: 'ing', mode: 'first-to-all', label: 'hash ring' }, { from: 'ing', to: 'ing', mode: 'chain', kind: 'heartbeat', label: 'memberlist', show: (p) => p.memberlist }, { from: 'qf', to: 'query', mode: 'first-to-all' }, { from: 'query', to: 'ing', mode: 'first-to-first', label: 'recent data' }, { from: 'query', to: 'extra', mode: 'first-to-first', label: readWorker.label }, { from: 'ing', to: 'objstore', mode: 'first-to-first', label: 'flush blocks' }, { from: 'extra', to: 'objstore', mode: 'first-to-first' }, { from: 'compact', to: 'objstore', mode: 'first-to-first' }],
    rules: [when((p) => p.rf > p.ingesters, 'Replication factor exceeds the ingester count: writes fail quorum.'), when((p) => p.rf === 1, 'RF 1: an ingester restart loses unflushed data.')],
    summarize: (p) => `${p.distributors} distributors · ${p.ingesters} ingesters (RF${p.rf}) · ${p.queriers} queriers`,
  }, { target: 'ing', port: 8080, label: 'metrics' }));
export const mimirProfile = lgtm('mimir', 'Grafana Mimir', 'mimir', '#f46800', 8080, { key: 'sg', label: 'store-gateway', port: 8080 }, { key: 'sg', label: 'blocks' });
export const lokiProfile = lgtm('loki', 'Grafana Loki', 'loki', '#f5a623', 3100, { key: 'ig', label: 'index-gateway', port: 3100 }, { key: 'ig', label: 'index' });
export const tempoProfile = lgtm('tempo', 'Grafana Tempo', 'tempo', '#ff8833', 4317, { key: 'mg', label: 'metrics-generator', port: 3200 }, { key: 'mg', label: 'spans' });

/* ---------------- vector databases ---------------- */
export const milvusProfile = defineSpecProfile<A>({
  id: 'milvus', tech: 'Milvus', label: 'Milvus (distributed)', iconId: 'milvus', accent: '#00a1ea', category: SA, aliases: ['vector database cluster'], topologies: ['tiered'], roles: ['coordinator', 'data'],
  fields: [num('proxies', 'Proxies', 1, 6, 2), num('query', 'Query nodes', 1, 12, 2), num('dataNodes', 'Data nodes', 1, 8, 2), num('index', 'Index nodes', 1, 8, 2), quorum('etcd', 'etcd')], topology: 'tiered',
  groups: [grp('access', 'Access layer', [comp('proxy', 'proxy', (p) => p.proxies, { port: 19530, role: 'coordinator', noun: 'proxies' })]), grp('coord', 'Coordinator', [comp('mix', 'mixcoord', 1, { port: 53100, role: 'leader' })]), grp('w', 'Worker nodes', [comp('query', 'query-node', (p) => p.query, { port: 21123, role: 'data', noun: 'query nodes' }), comp('dn', 'data-node', (p) => p.dataNodes, { port: 21124, role: 'data', noun: 'data nodes' }), comp('index', 'index-node', (p) => p.index, { port: 21121, role: 'data', noun: 'index nodes' })])],
  externals: [comp('etcd', 'etcd', (p) => p.etcd, { port: 2379, iconId: 'etcd' }), comp('mq', 'message queue (Pulsar)', 1, { port: 6650, iconId: 'pulsar' }), store()],
  links: [{ from: 'proxy', to: 'mix', mode: 'first-to-first' }, { from: 'proxy', to: 'query', mode: 'first-to-first', label: 'search' }, { from: 'mix', to: 'etcd', mode: 'first-to-first', label: 'metadata' }, { from: 'dn', to: 'mq', mode: 'first-to-first', label: 'WAL' }, { from: 'dn', to: 'objstore', mode: 'first-to-first', label: 'segments' }, { from: 'query', to: 'objstore', mode: 'first-to-first' }],
  rules: [oddRule('etcd nodes', (p) => p.etcd), when((p) => p.proxies < 2, 'A single proxy is a single point of failure for clients.')],
});
export const qdrantProfile = defineSpecProfile<A>({
  id: 'qdrant', tech: 'Qdrant', label: 'Qdrant (distributed)', iconId: 'qdrant', accent: '#dc244c', category: SA, topologies: ['shard-matrix'], roles: ['leader', 'replica', 'follower'],
  fields: [num('nodes', 'Nodes', 1, 8, 3), num('shards', 'Shards', 1, 8, 3), num('rf', 'Replication factor', 1, 3, 2)], topology: 'shard-matrix',
  groups: [grp('mx', (p) => `${p.shards} shards x RF ${p.rf}`, [comp('r1', 'shard', (p) => p.shards, { port: 6333, role: 'leader', noun: 'shard primaries' }), comp('r2', 'replica', (p) => (p.rf >= 2 ? p.shards : 0), { port: 6333, role: 'replica', noun: 'replicas' }), comp('r3', 'replica-b', (p) => (p.rf >= 3 ? p.shards : 0), { port: 6333, role: 'replica', noun: 'replicas' })], { maxCols: 8 })],
  links: [{ from: 'r1', to: 'r2', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r3', mode: 'pair', kind: 'replication', replMode: 'async' }, { from: 'r1', to: 'r1', mode: 'chain', kind: 'heartbeat', label: 'Raft (topology)' }],
  rules: [when((p) => p.rf > p.nodes, 'Replication factor exceeds the node count.'), when((p) => p.nodes < 3, 'Consensus needs 3+ nodes to tolerate a failure.'), when((p) => p.nodes % 2 === 0, 'Even node count: Raft tolerates no more failures than with one fewer node.')],
  summarize: (p) => `${p.nodes} nodes · ${p.shards} shards x RF${p.rf}`,
});
export const weaviateProfile = defineSpecProfile<A>({
  id: 'weaviate', tech: 'Weaviate', label: 'Weaviate (replicated)', iconId: 'weaviate', accent: '#2cc3a0', category: SA, topologies: ['quorum'], roles: ['leader', 'follower'],
  fields: [num('nodes', 'Nodes', 1, 9, 3), num('rf', 'Replication factor', 1, 5, 3), azs()], topology: 'quorum',
  groups: [grp('n', 'Weaviate nodes (Raft schema, leaderless data)', [comp('node', 'weaviate', (p) => p.nodes, { port: 8080, role: lead, noun: 'nodes' })], { azSpread: true })],
  links: [{ from: 'node', to: 'node', mode: 'mesh', kind: 'replication', replMode: 'async', data: { arrows: 'both' } }],
  rules: [when((p) => p.rf > p.nodes, 'Replication factor exceeds the node count.'), when((p) => p.nodes % 2 === 0, 'Even node count: Raft schema quorum tolerates no more failures than with one fewer node.'), when((p) => p.nodes < 3, 'Fewer than 3 nodes: no Raft fault tolerance.')],
});

export const ANALYTICS_PROFILES = [opensearchProfile, solrcloudProfile, druidProfile, pinotProfile, starrocksProfile, dorisProfile, trinoProfile, influxdbProfile, timescaledbProfile, victoriametricsProfile, thanosProfile, mimirProfile, lokiProfile, tempoProfile, milvusProfile, qdrantProfile, weaviateProfile];
