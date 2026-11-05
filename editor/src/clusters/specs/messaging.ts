/* eslint-disable @typescript-eslint/no-explicit-any */
import { azs, bool, comp, defineSpecProfile, grp, lead, num, oddRule, quorum, sel, when, withExporter } from '../spec';

type A = Record<string, any>;
const MSG = 'Messaging';
const DATA = 'Data Processing';

export const redpandaProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'redpanda', tech: 'Redpanda', label: 'Redpanda (Raft brokers)', iconId: 'redpanda', accent: '#e2401b', category: MSG, aliases: ['redpanda cluster'], topologies: ['quorum'], roles: ['leader', 'follower'],
  fields: [num('brokers', 'Brokers', 1, 12, 3), num('rf', 'Topic replication factor', 1, 5, 3), azs(), bool('console', 'Redpanda Console', true), bool('registry', 'Schema registry (built-in)', false)], topology: 'quorum',
  groups: [grp('b', 'Brokers (thread-per-core, Raft per partition)', [comp('broker', 'redpanda', (p) => p.brokers, { port: 9092, role: lead, noun: 'brokers' })], { azSpread: true })],
  externals: [comp('console', 'Console', (p) => (p.console ? 1 : 0), { port: 8080, iconId: 'kafka-ui' })],
  links: [{ from: 'broker', to: 'broker', mode: 'chain', kind: 'replication', replMode: 'sync', label: 'Raft' }, { from: 'console', to: 'broker', mode: 'first-to-first', label: 'admin API' }],
  rules: [when((p) => p.rf > p.brokers, 'Replication factor exceeds the broker count.'), when((p) => p.brokers < 3, 'Fewer than 3 brokers: no Raft fault tolerance.'), when((p) => p.rf % 2 === 0, 'Even replication factor: Raft majority needs rf/2+1 replicas, use an odd RF.')],
  summarize: (p) => `${p.brokers} brokers · RF${p.rf}${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
}, { target: 'broker', port: 9644, label: 'metrics' }));

export const pulsarProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'pulsar', tech: 'Apache Pulsar', label: 'Apache Pulsar (brokers + BookKeeper)', iconId: 'pulsar', accent: '#188fff', category: MSG, aliases: ['pulsar cluster', 'bookkeeper'], topologies: ['tiered'], roles: ['broker', 'data', 'leader'],
  fields: [num('brokers', 'Brokers (stateless)', 1, 8, 3), num('bookies', 'Bookies', 1, 12, 3), num('ensemble', 'Ensemble size (E)', 1, 5, 3), num('writeq', 'Write quorum (Qw)', 1, 5, 2), num('ackq', 'Ack quorum (Qa)', 1, 5, 2), quorum('zk', 'Metadata store (ZooKeeper)'), bool('proxy', 'Pulsar proxy', false), azs()], topology: 'tiered',
  groups: [grp('b', 'Brokers (serving)', [comp('broker', 'broker', (p) => p.brokers, { port: 6650, role: 'broker', noun: 'brokers' })]), grp('bk', (p) => `Bookies (E${p.ensemble}/Qw${p.writeq}/Qa${p.ackq})`, [comp('bookie', 'bookie', (p) => p.bookies, { port: 3181, role: 'data', noun: 'bookies' })], { azSpread: true }), grp('zk', 'Metadata (ZooKeeper)', [comp('zk', 'zookeeper', (p) => p.zk, { port: 2181, role: lead, iconId: 'zookeeper', noun: 'zookeepers' })])],
  externals: [comp('proxy', 'proxy', (p) => (p.proxy ? 1 : 0), { port: 6650, iconId: 'pulsar' })],
  links: [{ from: 'broker', to: 'bookie', mode: 'first-to-all', label: 'ledger writes' }, { from: 'broker', to: 'zk', mode: 'first-to-first', label: 'metadata' }, { from: 'zk', to: 'zk', mode: 'chain', kind: 'heartbeat' }, { from: 'proxy', to: 'broker', mode: 'first-to-all' }],
  rules: [oddRule('ZooKeeper nodes', (p) => p.zk), when((p) => p.ensemble > p.bookies, 'Ensemble size exceeds the bookie count: ledgers cannot be created.'), when((p) => p.writeq > p.ensemble, 'Write quorum (Qw) must be <= ensemble size (E).'), when((p) => p.ackq > p.writeq, 'Ack quorum (Qa) must be <= write quorum (Qw).')],
  summarize: (p) => `${p.brokers} brokers · ${p.bookies} bookies (E${p.ensemble}/Qw${p.writeq}/Qa${p.ackq}) · ${p.zk} ZK`,
}, { target: 'broker', port: 8080, label: 'metrics' }));

export const natsProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'nats-jetstream', tech: 'NATS JetStream', label: 'NATS JetStream cluster', iconId: 'nats', accent: '#27aae1', category: MSG, aliases: ['nats cluster', 'jetstream'], topologies: ['mesh', 'quorum'], roles: ['leader', 'follower'],
  fields: [sel('servers', 'Servers (meta Raft group)', [[3, '3'], [5, '5'], [7, '7']], 3), num('replicas', 'Stream replicas (R)', 1, 5, 3), num('leafnodes', 'Leaf nodes', 0, 4, 0), azs()], topology: 'mesh',
  groups: [grp('s', 'NATS servers (full mesh, route port 6222)', [comp('server', 'nats', (p) => p.servers, { port: 4222, role: lead, noun: 'servers' })], { azSpread: true })],
  externals: [comp('leaf', 'leaf node', (p) => p.leafnodes, { port: 7422, iconId: 'nats' })],
  links: [{ from: 'server', to: 'server', mode: 'mesh', kind: 'heartbeat', label: ':6222' }, { from: 'leaf', to: 'server', mode: 'pair', label: 'leafnode' }],
  rules: [oddRule('servers', (p) => p.servers), when((p) => p.replicas > p.servers, 'Stream replicas exceed the server count.'), when((p) => p.replicas % 2 === 0, 'Even R: no more fault tolerant than R-1; use R of 1, 3 or 5.')],
  summarize: (p) => `${p.servers} servers · R${p.replicas}${p.leafnodes ? ` · ${p.leafnodes} leaf` : ''}${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
}, { target: 'server', port: 7777, label: 'prometheus-nats-exporter' }));

export const artemisProfile = defineSpecProfile<A>({
  id: 'artemis', tech: 'ActiveMQ Artemis', label: 'ActiveMQ Artemis (live/backup)', iconId: 'artemis', accent: '#3f6fb0', category: MSG, aliases: ['activemq cluster', 'artemis ha'], topologies: ['active-passive'], roles: ['primary', 'standby'],
  fields: [num('pairs', 'Live/backup pairs', 1, 6, 2), sel('ha', 'HA policy', [['replication', 'Replication (shared-nothing)'], ['shared', 'Shared store']], 'replication'), bool('cluster', 'Message redistribution (cluster connections)', true)], topology: 'active-passive',
  groups: [grp('live', 'Live brokers', [comp('live', 'live', (p) => p.pairs, { port: 61616, role: 'primary', noun: 'live brokers' })]), grp('bak', 'Backup brokers', [comp('backup', 'backup', (p) => p.pairs, { port: 61616, role: 'standby', noun: 'backups' })])],
  links: [{ from: 'live', to: 'backup', mode: 'pair', kind: 'replication', replMode: 'sync', show: (p) => p.ha === 'replication' }, { from: 'live', to: 'backup', mode: 'pair', kind: 'failover', show: (p) => p.ha === 'shared' }, { from: 'live', to: 'live', mode: 'chain', kind: 'heartbeat', label: 'cluster', show: (p) => p.cluster }],
  rules: [when((p) => p.ha === 'replication' && p.pairs === 1, 'One pair with replication: after a network partition the pair cannot reach quorum; use 3+ pairs or a shared store.')],
  summarize: (p) => `${p.pairs} live + ${p.pairs} backup · ${p.ha}`,
});

export const rocketmqProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'rocketmq', tech: 'Apache RocketMQ', label: 'Apache RocketMQ (NameServer + brokers)', iconId: 'rocketmq', accent: '#d77310', category: MSG, aliases: ['rocketmq cluster'], topologies: ['active-passive'], roles: ['master', 'slave', 'coordinator'],
  fields: [num('namesrv', 'NameServers', 2, 5, 2), num('groups', 'Broker groups', 1, 6, 2), sel('mode', 'Replication', [['dledger', 'DLedger (Raft, 3 per group)'], ['masterslave', 'Master + slave']], 'masterslave'), bool('proxy', 'Proxy (gRPC)', false)], topology: 'active-passive',
  groups: [grp('ns', 'NameServers (stateless routing)', [comp('ns', 'namesrv', (p) => p.namesrv, { port: 9876, role: 'coordinator', noun: 'nameservers' })]), grp('m', 'Broker masters', [comp('master', 'broker-master', (p) => p.groups, { port: 10911, role: 'master', noun: 'masters' })]), grp('s', 'Broker slaves', [comp('slave', 'broker-slave', (p) => p.groups * (p.mode === 'dledger' ? 2 : 1), { port: 10911, role: 'slave', noun: 'slaves' })])],
  externals: [comp('proxy', 'proxy', (p) => (p.proxy ? 1 : 0), { port: 8081, iconId: 'rocketmq' })],
  links: [{ from: 'master', to: 'ns', mode: 'first-to-first', label: 'register route' }, { from: 'master', to: 'slave', mode: 'pair', kind: 'replication', replMode: (p) => (p.mode === 'dledger' ? 'sync' : 'async') }, { from: 'proxy', to: 'ns', mode: 'first-to-first' }],
  rules: [when((p) => p.namesrv < 2, 'Single NameServer: routing info is a single point of failure.')],
  summarize: (p) => `${p.namesrv} NameServers · ${p.groups} broker groups (${p.mode === 'dledger' ? 'DLedger' : 'master/slave'})`,
}, { target: 'master', port: 5557, label: 'rocketmq-exporter' }));

export const emqxProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'emqx', tech: 'EMQX', label: 'EMQX (core + replicant)', iconId: 'emqx', accent: '#00b173', category: MSG, aliases: ['mqtt cluster', 'mqtt broker cluster'], topologies: ['tiered'], roles: ['core', 'replicant'],
  fields: [num('core', 'Core nodes', 1, 5, 3), num('replicant', 'Replicant nodes', 0, 12, 2), bool('lb', 'Load balancer (MQTT 1883/8883)', true), num('devices', 'Device groups', 0, 4, 1)], topology: 'tiered',
  groups: [grp('core', 'Core (Mria writers)', [comp('core', 'core', (p) => p.core, { port: 4370, role: 'core', noun: 'core nodes' })]), grp('rep', 'Replicants (stateless sessions)', [comp('rep', 'replicant', (p) => p.replicant, { port: 1883, role: 'replicant', noun: 'replicants' })], { show: (p) => p.replicant > 0 })],
  externals: [comp('lb', 'MQTT LB', (p) => (p.lb ? 1 : 0), { port: 1883, iconId: 'load-balancer' }), comp('dev', 'devices', (p) => p.devices, { iconId: 'iot' })],
  links: [{ from: 'core', to: 'core', mode: 'mesh', kind: 'replication', replMode: 'async', label: 'Mria', data: { arrows: 'both' } }, { from: 'rep', to: 'core', mode: 'first-to-first', label: 'route table' }, { from: 'lb', to: 'rep', mode: 'first-to-all' }, { from: 'lb', to: 'core', mode: 'first-to-first', show: (p) => p.replicant === 0 }, { from: 'dev', to: 'lb', mode: 'all-to-first' }],
  rules: [when((p) => p.core > 1 && p.core % 2 === 0, 'Even core count: split brain risk; use 1, 3 or 5 core nodes.'), when((p) => p.core < 3, 'Fewer than 3 core nodes: a single failure stops route replication.')],
  summarize: (p) => `${p.core} core · ${p.replicant} replicant`,
}, { target: 'core', port: 18083, label: 'prometheus' }));

export const kafkaConnectProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'kafka-connect', tech: 'Kafka Connect', label: 'Kafka Connect (distributed)', iconId: 'kafka-connect', accent: '#231f20', category: DATA, aliases: ['connect cluster', 'debezium cluster'], topologies: ['hub-spoke'], roles: ['worker', 'leader'],
  fields: [num('workers', 'Workers', 1, 12, 3), num('sources', 'Source connectors', 0, 6, 2), num('sinks', 'Sink connectors', 0, 6, 2), bool('rest', 'REST load balancer', true)], topology: 'hub-spoke',
  groups: [grp('w', 'Connect workers (group.id)', [comp('worker', 'worker', (p) => p.workers, { port: 8083, role: (i) => (i === 0 ? 'leader' : 'worker'), noun: 'workers' })])],
  externals: [comp('kafka', 'Kafka cluster', 1, { port: 9092, iconId: 'kafka' }), comp('src', 'source system', (p) => p.sources, { iconId: 'database' }), comp('snk', 'sink system', (p) => p.sinks, { iconId: 'database' }), comp('lb', 'REST LB', (p) => (p.rest ? 1 : 0), { port: 8083, iconId: 'load-balancer' })],
  links: [{ from: 'src', to: 'worker', mode: 'pair', label: 'source' }, { from: 'worker', to: 'kafka', mode: 'first-to-first', label: 'config/offset/status topics' }, { from: 'worker', to: 'snk', mode: 'pair', label: 'sink' }, { from: 'lb', to: 'worker', mode: 'first-to-first' }],
  rules: [when((p) => p.workers < 2, 'Single worker: no rebalancing on failure.'), when((p) => p.sources + p.sinks === 0, 'No connectors configured.')],
  summarize: (p) => `${p.workers} workers · ${p.sources} sources · ${p.sinks} sinks`,
}, { target: 'worker', port: 9404, label: 'jmx-exporter' }));

export const flinkProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'flink', tech: 'Apache Flink', label: 'Apache Flink (HA session cluster)', iconId: 'flink', accent: '#e6526f', category: DATA, aliases: ['flink cluster'], topologies: ['hub-spoke'], roles: ['leader', 'standby', 'worker'],
  fields: [num('jobmanagers', 'JobManagers (1 leader + standbys)', 1, 3, 2), num('taskmanagers', 'TaskManagers', 1, 24, 4), num('slots', 'Slots per TaskManager', 1, 16, 4), sel('ha', 'HA services', [['zookeeper', 'ZooKeeper'], ['kubernetes', 'Kubernetes ConfigMaps']], 'zookeeper')], topology: 'hub-spoke',
  groups: [grp('jm', 'JobManagers', [comp('jm', 'jobmanager', (p) => p.jobmanagers, { port: 8081, role: (i) => (i === 0 ? 'leader' : 'standby'), noun: 'jobmanagers' })]), grp('tm', (p) => `TaskManagers (${p.taskmanagers * p.slots} slots)`, [comp('tm', 'taskmanager', (p) => p.taskmanagers, { port: 6122, role: 'worker', noun: 'taskmanagers' })], { maxCols: 6 })],
  externals: [comp('zk', 'zookeeper', (p) => (p.ha === 'zookeeper' ? 1 : 0), { port: 2181, iconId: 'zookeeper' }), comp('ckpt', 'checkpoint storage', 1, { iconId: 'minio' })],
  links: [{ from: 'jm', to: 'tm', mode: 'first-to-all', label: 'deploy tasks' }, { from: 'jm', to: 'jm', mode: 'chain', kind: 'failover' }, { from: 'jm', to: 'zk', mode: 'first-to-first', label: 'leader election' }, { from: 'tm', to: 'ckpt', mode: 'first-to-first', label: 'checkpoints' }],
  rules: [when((p) => p.jobmanagers < 2, 'Single JobManager: job recovery requires a manual restart.')],
  summarize: (p) => `${p.jobmanagers} JM · ${p.taskmanagers} TM x ${p.slots} slots · HA ${p.ha}`,
}, { target: 'jm', port: 9249, label: 'prometheus-reporter' }));

export const sparkProfile = defineSpecProfile<A>({
  id: 'spark', tech: 'Apache Spark', label: 'Apache Spark (standalone HA)', iconId: 'spark', accent: '#e25a1c', category: DATA, aliases: ['spark cluster'], topologies: ['hub-spoke'], roles: ['leader', 'standby', 'worker'],
  fields: [num('masters', 'Masters (1 active + standbys)', 1, 3, 2), num('workers', 'Workers', 1, 24, 4), num('drivers', 'Driver apps', 0, 4, 1)], topology: 'hub-spoke',
  groups: [grp('m', 'Masters', [comp('master', 'master', (p) => p.masters, { port: 7077, role: (i) => (i === 0 ? 'leader' : 'standby'), noun: 'masters' })]), grp('w', 'Workers (executors)', [comp('worker', 'worker', (p) => p.workers, { port: 8081, role: 'worker', noun: 'workers' })], { maxCols: 6 })],
  externals: [comp('zk', 'zookeeper', (p) => (p.masters > 1 ? 1 : 0), { port: 2181, iconId: 'zookeeper' }), comp('driver', 'driver', (p) => p.drivers, { port: 4040, iconId: 'spark' })],
  links: [{ from: 'master', to: 'worker', mode: 'first-to-all', label: 'schedule' }, { from: 'master', to: 'master', mode: 'chain', kind: 'failover' }, { from: 'master', to: 'zk', mode: 'first-to-first', label: 'recovery' }, { from: 'driver', to: 'master', mode: 'first-to-first', label: 'submit' }, { from: 'driver', to: 'worker', mode: 'first-to-first', label: 'tasks' }],
  rules: [when((p) => p.masters < 2, 'Single master: no standalone HA.')],
  summarize: (p) => `${p.masters} masters · ${p.workers} workers`,
});

export const hadoopProfile = defineSpecProfile<A>({
  id: 'hadoop', tech: 'Hadoop (HDFS + YARN)', label: 'Hadoop HDFS HA + YARN', iconId: 'hadoop', accent: '#66ccff', category: DATA, aliases: ['hdfs cluster', 'yarn cluster', 'hdfs ha'], topologies: ['tiered'], roles: ['primary', 'standby', 'data', 'leader'],
  fields: [sel('journal', 'JournalNodes', [[3, '3'], [5, '5']], 3), num('datanodes', 'DataNodes / NodeManagers', 3, 24, 4), num('rf', 'HDFS replication', 1, 5, 3), bool('yarn', 'YARN ResourceManagers (active/standby)', true), azs()], topology: 'tiered',
  groups: [
    grp('nn', 'HDFS NameNodes (HA)', [comp('active', 'namenode-active', 1, { port: 8020, role: 'primary' }), comp('standby', 'namenode-standby', 1, { port: 8020, role: 'standby' })]),
    grp('jn', 'JournalNodes (quorum edit log)', [comp('jn', 'journalnode', (p) => p.journal, { port: 8485, role: 'witness', noun: 'journalnodes' })]),
    grp('rm', 'YARN ResourceManagers', [comp('rm', 'resourcemanager', (p) => (p.yarn ? 2 : 0), { port: 8032, role: (i) => (i === 0 ? 'primary' : 'standby'), noun: 'resourcemanagers' })], { show: (p) => p.yarn }),
    grp('dn', 'DataNodes + NodeManagers', [comp('dn', 'datanode', (p) => p.datanodes, { port: 9866, role: 'data', noun: 'datanodes' })], { azSpread: true }),
  ],
  externals: [comp('zk', 'zookeeper (ZKFC)', 1, { port: 2181, iconId: 'zookeeper' })],
  links: [{ from: 'active', to: 'standby', mode: 'first-to-first', kind: 'failover', label: 'ZKFC' }, { from: 'active', to: 'jn', mode: 'first-to-all', label: 'edit log' }, { from: 'standby', to: 'jn', mode: 'first-to-first', label: 'tail' }, { from: 'dn', to: 'active', mode: 'first-to-first', label: 'block reports' }, { from: 'active', to: 'zk', mode: 'first-to-first' }],
  rules: [oddRule('JournalNodes', (p) => p.journal), when((p) => p.rf > p.datanodes, 'HDFS replication exceeds the DataNode count: blocks stay under-replicated.')],
  summarize: (p) => `2 NameNodes · ${p.journal} JN · ${p.datanodes} DataNodes · RF${p.rf}${p.yarn ? ' · YARN HA' : ''}`,
});

export const hbaseProfile = defineSpecProfile<A>({
  id: 'hbase', tech: 'Apache HBase', label: 'Apache HBase', iconId: 'hbase', accent: '#c0392b', category: DATA, topologies: ['tiered'], roles: ['primary', 'standby', 'data', 'leader'],
  fields: [num('masters', 'HMasters (1 active + backups)', 1, 3, 2), num('regionservers', 'RegionServers', 2, 24, 3), quorum('zk', 'ZooKeeper'), num('dn', 'HDFS DataNodes', 3, 24, 3), azs()], topology: 'tiered',
  groups: [grp('m', 'HMasters', [comp('master', 'hmaster', (p) => p.masters, { port: 16000, role: (i) => (i === 0 ? 'primary' : 'standby'), noun: 'hmasters' })]), grp('zk', 'ZooKeeper', [comp('zk', 'zookeeper', (p) => p.zk, { port: 2181, role: lead, iconId: 'zookeeper', noun: 'zookeepers' })]), grp('rs', 'RegionServers', [comp('rs', 'regionserver', (p) => p.regionservers, { port: 16020, role: 'data', noun: 'regionservers' })], { azSpread: true }), grp('dn', 'HDFS DataNodes', [comp('dn', 'datanode', (p) => p.dn, { port: 9866, role: 'data', iconId: 'hadoop', noun: 'datanodes' })])],
  links: [{ from: 'zk', to: 'zk', mode: 'chain', kind: 'heartbeat' }, { from: 'master', to: 'zk', mode: 'first-to-first', label: 'active master lock' }, { from: 'master', to: 'rs', mode: 'first-to-all', label: 'assign regions' }, { from: 'rs', to: 'dn', mode: 'first-to-first', label: 'HFiles / WAL' }],
  rules: [oddRule('ZooKeeper nodes', (p) => p.zk), when((p) => p.masters < 2, 'Single HMaster: no backup master for failover.')],
});

export const airflowProfile = defineSpecProfile<A>({
  id: 'airflow', tech: 'Apache Airflow', label: 'Airflow (CeleryExecutor HA)', iconId: 'airflow', accent: '#017cee', category: DATA, aliases: ['airflow cluster'], topologies: ['hub-spoke'], roles: ['coordinator', 'worker'],
  fields: [num('schedulers', 'Schedulers (HA)', 1, 4, 2), num('web', 'Webservers', 1, 4, 2), num('workers', 'Celery workers', 1, 20, 3), bool('triggerer', 'Triggerer', true), sel('broker', 'Broker', [['redis', 'Redis'], ['rabbitmq', 'RabbitMQ']], 'redis')], topology: 'hub-spoke',
  groups: [grp('ctl', 'Control plane', [comp('web', 'webserver', (p) => p.web, { port: 8080, role: 'coordinator', noun: 'webservers' }), comp('sched', 'scheduler', (p) => p.schedulers, { role: 'coordinator', noun: 'schedulers' }), comp('trig', 'triggerer', (p) => (p.triggerer ? 1 : 0), { role: 'coordinator' })]), grp('w', 'Workers', [comp('worker', 'worker', (p) => p.workers, { port: 8793, role: 'worker', noun: 'workers' })], { maxCols: 6 })],
  externals: [comp('db', 'metadata DB', 1, { port: 5432, iconId: 'postgresql' }), comp('broker', 'redis', (p) => (p.broker === 'redis' ? 1 : 0), { port: 6379, iconId: 'redis' }), comp('broker', 'rabbitmq', (p) => (p.broker === 'rabbitmq' ? 1 : 0), { port: 5672, iconId: 'rabbitmq' })],
  links: [{ from: 'sched', to: 'db', mode: 'first-to-first', label: 'row-level locks' }, { from: 'web', to: 'db', mode: 'first-to-first' }, { from: 'sched', to: 'broker', mode: 'first-to-first', label: 'enqueue' }, { from: 'broker', to: 'worker', mode: 'first-to-all', label: 'tasks' }, { from: 'worker', to: 'db', mode: 'first-to-first' }],
  rules: [when((p) => p.schedulers < 2, 'Single scheduler: scheduling stops if it fails (Airflow 2 supports active-active schedulers).')],
  summarize: (p) => `${p.schedulers} schedulers · ${p.web} web · ${p.workers} workers · ${p.broker}`,
});

export const temporalProfile = defineSpecProfile<A>({
  id: 'temporal', tech: 'Temporal', label: 'Temporal (frontend / history / matching / worker)', iconId: 'temporal', accent: '#8b5cf6', category: DATA, aliases: ['temporal cluster'], topologies: ['tiered'], roles: ['coordinator', 'data'],
  fields: [num('frontend', 'Frontend', 1, 6, 2), num('history', 'History', 1, 12, 3), num('matching', 'Matching', 1, 6, 2), num('workers', 'Internal workers', 1, 4, 1), sel('db', 'Persistence', [['postgresql', 'PostgreSQL'], ['cassandra', 'Cassandra'], ['mysql', 'MySQL']], 'postgresql'), num('shards', 'History shards', 4, 16384, 512), bool('visibility', 'Advanced visibility (Elasticsearch)', true)], topology: 'tiered',
  groups: [grp('f', 'Frontend', [comp('frontend', 'frontend', (p) => p.frontend, { port: 7233, role: 'coordinator', noun: 'frontends' })]), grp('s', 'Services', [comp('history', 'history', (p) => p.history, { port: 7234, role: 'data', noun: 'history services' }), comp('matching', 'matching', (p) => p.matching, { port: 7235, role: 'data', noun: 'matching services' }), comp('worker', 'worker', (p) => p.workers, { port: 7239, role: 'data', noun: 'workers' })])],
  externals: [comp('db', 'persistence', 1, { iconId: 'postgresql' }), comp('es', 'visibility store', (p) => (p.visibility ? 1 : 0), { port: 9200, iconId: 'elasticsearch' })],
  links: [{ from: 'frontend', to: 'history', mode: 'first-to-first', label: 'gRPC' }, { from: 'frontend', to: 'matching', mode: 'first-to-first' }, { from: 'history', to: 'matching', mode: 'first-to-first', label: 'tasks' }, { from: 'history', to: 'db', mode: 'first-to-first', label: 'shards' }, { from: 'history', to: 'es', mode: 'first-to-first', label: 'visibility' }],
  rules: [when((p) => p.history > p.shards, 'More history hosts than shards: some sit idle.'), when((p) => (p.shards & (p.shards - 1)) !== 0, 'History shard count is fixed forever; use a power of two.')],
  summarize: (p) => `${p.frontend} frontend · ${p.history} history · ${p.matching} matching · ${p.shards} shards · ${p.db}`,
});

export const celeryProfile = defineSpecProfile<A>({
  id: 'celery', tech: 'Celery', label: 'Celery (workers + broker)', iconId: 'celery', accent: '#37814a', category: DATA, aliases: ['celery workers', 'task queue'], topologies: ['hub-spoke'], roles: ['coordinator', 'worker'],
  fields: [num('workers', 'Workers', 1, 24, 4), sel('broker', 'Broker', [['redis', 'Redis'], ['rabbitmq', 'RabbitMQ']], 'rabbitmq'), sel('backend', 'Result backend', [['redis', 'Redis'], ['postgresql', 'PostgreSQL'], ['none', 'None']], 'redis'), bool('flower', 'Flower monitoring', true), num('producers', 'Producer apps', 1, 4, 1)], topology: 'hub-spoke',
  groups: [grp('w', 'Celery workers (prefork)', [comp('worker', 'worker', (p) => p.workers, { role: 'worker', noun: 'workers' }), comp('beat', 'beat', 1, { role: 'coordinator' })], { maxCols: 6 })],
  externals: [comp('app', 'app', (p) => p.producers, { iconId: 'service' }), comp('broker', 'rabbitmq', (p) => (p.broker === 'rabbitmq' ? 1 : 0), { iconId: 'rabbitmq', port: 5672 }), comp('broker', 'redis', (p) => (p.broker === 'redis' ? 1 : 0), { iconId: 'redis', port: 6379 }), comp('result', 'result-redis', (p) => (p.backend === 'redis' ? 1 : 0), { iconId: 'redis', port: 6379 }), comp('result', 'result-postgres', (p) => (p.backend === 'postgresql' ? 1 : 0), { iconId: 'postgresql', port: 5432 }), comp('flower', 'flower', (p) => (p.flower ? 1 : 0), { port: 5555, iconId: 'celery' })],
  links: [{ from: 'app', to: 'broker', mode: 'all-to-first', label: 'apply_async' }, { from: 'beat', to: 'broker', mode: 'first-to-first', label: 'schedule' }, { from: 'broker', to: 'worker', mode: 'first-to-all', label: 'tasks' }, { from: 'worker', to: 'result', mode: 'first-to-first', label: 'results' }, { from: 'flower', to: 'broker', mode: 'first-to-first', data: { strokeStyle: 'dashed' } as never }],
  rules: [when((p) => p.workers < 2, 'Single worker: queue stalls when it restarts.')],
  summarize: (p) => `${p.workers} workers · ${p.broker} broker · beat x1`,
});

export const MESSAGING_PROFILES = [redpandaProfile, pulsarProfile, natsProfile, artemisProfile, rocketmqProfile, emqxProfile, kafkaConnectProfile, flinkProfile, sparkProfile, hadoopProfile, hbaseProfile, airflowProfile, temporalProfile, celeryProfile];
