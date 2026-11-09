/**
 * Per-component architecture config (`node.data.arch`): the knobs that make a "Database" an OLTP primary-replica Postgres or a
 * "Cache" a write-back Redis. Role-level fields (`ARCH_FIELDS`, keyed by lint `Role`) are merged with technology profiles
 * (`TECH_PROFILES`, matched on iconId / profileId like `ID_ROLES`). Pure and deterministic; feeds lint and capacity.
 *
 * Opt-in: lint and capacity only react to a node that has an `arch` object (`hasArch`). Unconfigured nodes keep today's behaviour,
 * so existing diagrams get no new warnings or numbers until somebody touches the Architecture section.
 */
import { roleOf, type Role } from '../lint';
import type { CNode } from '../types';

export type ArchValue = string | number | boolean;
export type ArchConfig = Record<string, ArchValue>;
export interface FieldDef {
  key: string;
  /** English label (i18n key) */
  label: string;
  kind: 'enum' | 'number' | 'bool';
  options?: readonly string[];
  def: ArchValue;
  min?: number;
  max?: number;
}

const en = (key: string, label: string, options: readonly string[], def: string): FieldDef => ({ key, label, kind: 'enum', options, def });
const nu = (key: string, label: string, def: number, min = 0, max?: number): FieldDef => ({ key, label, kind: 'number', def, min, max });
const bo = (key: string, label: string, def: boolean): FieldDef => ({ key, label, kind: 'bool', def });

const DEPLOYMENT = en('deployment', 'Deployment', ['single-az', 'multi-az', 'multi-region'], 'single-az');

const ROLE_FIELDS: Record<Role, FieldDef[]> = {
  database: [
    en('workload', 'Workload', ['OLTP', 'OLAP', 'HTAP'], 'OLTP'),
    en('model', 'Data model', ['relational', 'document', 'key-value', 'wide-column', 'graph', 'time-series'], 'relational'),
    en('replication', 'Replication', ['none', 'primary-replica-async', 'primary-replica-sync', 'semi-sync', 'multi-primary', 'quorum'], 'none'),
    nu('replicas', 'Replicas', 1, 0, 15),
    en('sharding', 'Sharding', ['none', 'hash', 'range', 'geo'], 'none'),
    en('consistency', 'Consistency', ['strong', 'eventual', 'read-your-writes'], 'strong'),
    en('backup', 'Backup', ['none', 'snapshot', 'pitr'], 'snapshot'),
  ],
  cache: [
    en('strategy', 'Strategy', ['cache-aside', 'read-through', 'write-through', 'write-back', 'write-around'], 'cache-aside'),
    en('eviction', 'Eviction', ['LRU', 'LFU', 'TTL', 'FIFO'], 'LRU'),
    nu('hitRate', 'Hit rate %', 80, 0, 100),
    nu('ttlSec', 'TTL (s)', 300),
    en('replication', 'Replication', ['none', 'primary-replica', 'cluster'], 'none'),
  ],
  queue: [
    en('delivery', 'Delivery', ['at-most-once', 'at-least-once', 'exactly-once'], 'at-least-once'),
    en('ordering', 'Ordering', ['none', 'per-partition', 'fifo'], 'none'),
    en('pattern', 'Pattern', ['queue', 'pub-sub', 'stream'], 'queue'),
    nu('partitions', 'Partitions', 1, 1),
    nu('retentionHours', 'Retention (h)', 168),
    bo('dlq', 'Dead-letter queue', false),
  ],
  lb: [
    en('layer', 'Layer', ['L4', 'L7'], 'L7'),
    en('algorithm', 'Algorithm', ['round-robin', 'least-connections', 'ip-hash', 'consistent-hash', 'weighted'], 'round-robin'),
    bo('healthCheck', 'Health checks', true),
    bo('sticky', 'Sticky sessions', false),
  ],
  gateway: [bo('rateLimit', 'Rate limiting', false), en('auth', 'Auth', ['none', 'jwt', 'oauth', 'api-key'], 'none'), bo('caching', 'Response caching', false)],
  cdn: [en('cacheMode', 'Cache mode', ['pull', 'push'], 'pull'), nu('ttlSec', 'TTL (s)', 86400), nu('hitRate', 'Hit rate %', 90, 0, 100)],
  storage: [en('class', 'Storage class', ['standard', 'infrequent', 'archive'], 'standard'), en('replication', 'Replication', ['single-zone', 'multi-zone', 'cross-region'], 'multi-zone'), bo('versioning', 'Versioning', false)],
  service: [nu('instances', 'Instances', 1, 1), en('autoscale', 'Autoscale', ['none', 'horizontal'], 'none'), bo('stateful', 'Stateful', false), en('protocol', 'Protocol', ['rest', 'grpc', 'graphql', 'websocket'], 'rest')],
  client: [],
  waf: [],
  monitoring: [],
  other: [],
};
/** roles that have an Architecture section; every one of them also gets the common `deployment` field */
export const ARCH_ROLES: Role[] = ['database', 'cache', 'queue', 'lb', 'gateway', 'cdn', 'storage', 'service', 'waf'];
export const ARCH_FIELDS: Record<Role, FieldDef[]> = Object.fromEntries(
  (Object.keys(ROLE_FIELDS) as Role[]).map((r) => [r, ARCH_ROLES.includes(r) ? [...ROLE_FIELDS[r], DEPLOYMENT] : []]),
) as Record<Role, FieldDef[]>;

// ---------- technology profiles ----------
export interface TechProfile { id: string; label: string; match: RegExp; fields: FieldDef[] }
const SQL_ISOLATION = en('isolation', 'Isolation', ['read-committed', 'repeatable-read', 'serializable'], 'read-committed');
export const TECH_PROFILES: TechProfile[] = [
  { id: 'kafka', label: 'Kafka', match: /(^|-)(kafka|redpanda|msk)(-|$)/, fields: [
    nu('partitions', 'Partitions', 3, 1), nu('replicationFactor', 'Replication factor', 3, 1, 5), en('acks', 'Producer acks', ['0', '1', 'all'], 'all'),
    nu('minInsyncReplicas', 'Min in-sync replicas', 2, 1, 5), nu('retentionHours', 'Retention (h)', 168), en('cleanupPolicy', 'Cleanup policy', ['delete', 'compact'], 'delete'),
    en('compression', 'Compression', ['none', 'gzip', 'lz4', 'zstd', 'snappy'], 'none'), nu('consumerGroups', 'Consumer groups', 1, 0),
  ] },
  { id: 'rabbitmq', label: 'RabbitMQ', match: /(^|-)rabbitmq(-|$)/, fields: [
    en('queueType', 'Queue type', ['classic', 'quorum', 'stream'], 'classic'), bo('durable', 'Durable', true), en('ack', 'Consumer ack', ['auto', 'manual'], 'manual'), nu('prefetch', 'Prefetch', 10, 0),
  ] },
  { id: 'redis', label: 'Redis', match: /(^|-)(redis|valkey|keydb|dragonfly)(-|$)/, fields: [
    en('mode', 'Mode', ['standalone', 'sentinel', 'cluster'], 'standalone'), en('persistence', 'Persistence', ['none', 'rdb', 'aof', 'rdb+aof'], 'rdb'),
    en('maxmemoryPolicy', 'Maxmemory policy', ['noeviction', 'allkeys-lru', 'allkeys-lfu', 'volatile-lru', 'volatile-ttl'], 'allkeys-lru'),
  ] },
  { id: 'memcached', label: 'Memcached', match: /(^|-)memcached(-|$)/, fields: [] },
  { id: 'mysql', label: 'MySQL', match: /(^|-)(mysql|mariadb|aurora)(-|$)/, fields: [
    en('replication', 'Replication', ['none', 'async', 'semi-sync', 'group-replication'], 'none'), en('pooler', 'Pooler', ['none', 'proxysql'], 'none'), SQL_ISOLATION,
    en('ha', 'HA manager', ['none', 'orchestrator'], 'none'),
  ] },
  { id: 'postgres', label: 'PostgreSQL', match: /(^|-)(postgres|postgresql)(-|$)/, fields: [
    en('replication', 'Replication', ['none', 'streaming-async', 'streaming-sync', 'logical'], 'none'), en('pooler', 'Pooler', ['none', 'pgbouncer'], 'none'), SQL_ISOLATION,
    en('ha', 'HA manager', ['none', 'patroni'], 'none'),
  ] },
  { id: 'mongodb', label: 'MongoDB', match: /(^|-)(mongodb|documentdb)(-|$)/, fields: [
    nu('replicaSetMembers', 'Replica set members', 3, 1, 50), en('writeConcern', 'Write concern', ['1', 'majority'], 'majority'),
    en('readPreference', 'Read preference', ['primary', 'secondary', 'nearest'], 'primary'), bo('sharded', 'Sharded', false),
  ] },
  { id: 'cassandra', label: 'Cassandra', match: /(^|-)(cassandra|scylla|scylladb)(-|$)/, fields: [
    nu('replicationFactor', 'Replication factor', 3, 1, 9), en('consistency', 'Consistency', ['ONE', 'QUORUM', 'ALL', 'LOCAL_QUORUM'], 'LOCAL_QUORUM'), en('strategy', 'Strategy', ['Simple', 'NetworkTopology'], 'NetworkTopology'),
  ] },
  { id: 'elasticsearch', label: 'Elasticsearch', match: /(^|-)(elasticsearch|opensearch)(-|$)/, fields: [nu('shards', 'Shards', 1, 1), nu('replicas', 'Replicas', 1, 0)] },
  { id: 'nginx', label: 'NGINX', match: /(^|-)nginx(-|$)/, fields: [en('algorithm', 'Algorithm', ['round-robin', 'least-connections', 'ip-hash', 'consistent-hash', 'weighted'], 'round-robin'), en('layer', 'Layer', ['L4', 'L7'], 'L7')] },
  { id: 'haproxy', label: 'HAProxy', match: /(^|-)haproxy(-|$)/, fields: [en('algorithm', 'Algorithm', ['round-robin', 'least-connections', 'ip-hash', 'consistent-hash', 'weighted'], 'least-connections'), en('layer', 'Layer', ['L4', 'L7'], 'L4')] },
  { id: 'envoy', label: 'Envoy', match: /(^|-)envoy(-|$)/, fields: [en('algorithm', 'Algorithm', ['round-robin', 'least-connections', 'ip-hash', 'consistent-hash', 'weighted'], 'least-connections'), en('layer', 'Layer', ['L4', 'L7'], 'L7')] },
];

/** the technology profile of a node, matched on its iconId then profileId */
export function techOf(node: Pick<CNode, 'data'>): TechProfile | undefined {
  const id = String(node.data.iconId ?? '');
  const profile = String(node.data.profileId ?? '');
  return TECH_PROFILES.find((p) => (id && p.match.test(id)) || (profile && p.match.test(profile)));
}

/** fields of a role split into generic ones and technology ones (a tech field replaces a generic one with the same key) */
export function fieldsFor(role: Role, tech?: TechProfile): { generic: FieldDef[]; tech: FieldDef[] } {
  const t = tech?.fields ?? [];
  const keys = new Set(t.map((f) => f.key));
  return { generic: (ARCH_FIELDS[role] ?? []).filter((f) => !keys.has(f.key)), tech: t };
}

export const hasArch = (node: Pick<CNode, 'data'>): boolean => !!node.data.arch && typeof node.data.arch === 'object';

/** merged config: defaults of the role and the technology, then the values stored on the node (only well-typed ones) */
export function archOf(node: Pick<CNode, 'data' | 'type'>, role?: Role): ArchConfig {
  const r = role ?? roleOf(node as CNode);
  const { generic, tech } = fieldsFor(r, techOf(node));
  const stored = (hasArch(node) ? node.data.arch : {}) as Record<string, unknown>;
  const out: ArchConfig = {};
  for (const f of [...generic, ...tech]) {
    const v = stored[f.key];
    out[f.key] =
      f.kind === 'enum' ? (typeof v === 'string' && f.options!.includes(v) ? v : f.def)
      : f.kind === 'bool' ? (typeof v === 'boolean' ? v : f.def)
      : typeof v === 'number' && Number.isFinite(v) ? Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v)) : f.def;
  }
  return out;
}

const REPL_SHORT: Record<string, string> = { 'primary-replica-async': 'PR·async', 'primary-replica-sync': 'PR·sync', 'semi-sync': 'PR·semi', 'multi-primary': 'MP', quorum: 'quorum', 'streaming-async': 'PR·async', 'streaming-sync': 'PR·sync', async: 'PR·async', 'group-replication': 'GR', logical: 'logical' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DELIVERY: Record<string, string> = { 'at-most-once': '≤1 at-most', 'at-least-once': '≥1 at-least', 'exactly-once': '=1 exactly' };
const ALGO: Record<string, string> = { 'round-robin': 'RR', 'least-connections': 'LC', 'ip-hash': 'IPH', 'consistent-hash': 'CH', weighted: 'WRR' };

/** technology badges (preferred over the generic ones when a profile matches) */
function techBadges(tech: TechProfile, a: ArchConfig): string[] {
  switch (tech.id) {
    case 'kafka': return [`RF${a.replicationFactor}`, `acks=${a.acks}`, `${a.partitions}p`];
    case 'rabbitmq': return [String(a.queueType), a.durable ? 'durable' : 'transient'];
    case 'redis': return [String(a.mode), String(a.persistence)];
    case 'memcached': return ['no repl'];
    case 'mysql': case 'postgres': return [String(a.workload ?? 'OLTP'), a.replication !== 'none' ? REPL_SHORT[String(a.replication)] ?? String(a.replication) : 'no repl', ...(a.pooler !== 'none' ? [String(a.pooler)] : []), ...(a.ha !== 'none' ? [String(a.ha)] : [])];
    case 'mongodb': return [`${a.replicaSetMembers}m w:${a.writeConcern}`, ...(a.sharded ? ['sharded'] : [])];
    case 'cassandra': return [`RF${a.replicationFactor}`, String(a.consistency)];
    case 'elasticsearch': return [`${a.shards}s/${a.replicas}r`];
    default: return [`${a.layer} ${ALGO[String(a.algorithm)] ?? a.algorithm}`];
  }
}

/** short pill strings for the canvas, e.g. "OLTP", "PR·async", "Cache-aside 80%", "L7 RR", "≥1 at-least" */
export function archBadges(role: Role, arch: ArchConfig, tech?: TechProfile): string[] {
  const out: string[] = tech ? techBadges(tech, arch) : [];
  if (!tech || role === 'database') {
    switch (role) {
      case 'database':
        if (!tech) { out.push(String(arch.workload)); if (arch.replication !== 'none') out.push(REPL_SHORT[String(arch.replication)] ?? String(arch.replication)); }
        if (arch.sharding !== 'none') out.push(`shard:${arch.sharding}`);
        break;
      case 'cache': out.push(`${cap(String(arch.strategy))} ${arch.hitRate}%`); break;
      case 'queue': out.push(DELIVERY[String(arch.delivery)] ?? String(arch.delivery)); if (arch.ordering !== 'none') out.push(String(arch.ordering) === 'fifo' ? 'FIFO' : 'ordered'); if (arch.dlq) out.push('DLQ'); break;
      case 'lb': out.push(`${arch.layer} ${ALGO[String(arch.algorithm)] ?? arch.algorithm}`); if (arch.sticky) out.push('sticky'); break;
      case 'gateway': if (arch.auth !== 'none') out.push(String(arch.auth)); if (arch.rateLimit) out.push('rate-limit'); break;
      case 'cdn': out.push(`${arch.cacheMode} ${arch.hitRate}%`); break;
      case 'storage': out.push(String(arch.class)); out.push(String(arch.replication)); break;
      case 'service': out.push(`×${arch.instances}`); if (arch.stateful) out.push('stateful'); if (arch.autoscale !== 'none') out.push('autoscale'); break;
      default: break;
    }
  }
  if (arch.deployment && arch.deployment !== 'single-az') out.push(String(arch.deployment));
  return out;
}

/** badges of a node, or [] when it has no architecture config */
export function nodeBadges(node: Pick<CNode, 'data' | 'type'>): string[] {
  if (!hasArch(node)) return [];
  const role = roleOf(node as CNode);
  return ARCH_ROLES.includes(role) ? archBadges(role, archOf(node, role), techOf(node)) : [];
}

/**
 * Capacity scaling of a node from its arch (used when `capacity.replicas` is unset; explicit capacity fields always win).
 * `count`: instances for cost. `mult`: throughput multiplier on `capacityRps`.
 *  - service: instances.
 *  - database: reads spread over replicas + 1 nodes, writes stay on the primary: mult = 1 / (w + (1 - w) / (r + 1)) with
 *    w = capacity.writeRatio (default 0 = read-only). multi-primary / quorum scale both: r + 1. Sharding is ignored (shard
 *    count unknown). MongoDB: r = members - 1 unless readPreference is primary (reads then hit one node). Elasticsearch: replicas + 1.
 *  - kafka: partitions (capacityRps is then per partition); count stays the broker-ish partitions too.
 */
export function archScale(node: CNode, role: Role, writeRatio = 0): { count: number; mult: number } | undefined {
  if (!hasArch(node)) return undefined;
  const a = archOf(node, role);
  const tech = techOf(node);
  const readScale = (r: number, mp = false) => {
    const w = Math.min(1, Math.max(0, writeRatio));
    return { count: r + 1, mult: mp ? r + 1 : 1 / (w + (1 - w) / (r + 1)) };
  };
  if (tech?.id === 'kafka') return { count: Number(a.partitions), mult: Number(a.partitions) };
  if (tech?.id === 'mongodb') return readScale(a.readPreference === 'primary' ? 0 : Number(a.replicaSetMembers) - 1);
  if (tech?.id === 'elasticsearch') return { count: Number(a.replicas) + 1, mult: Number(a.replicas) + 1 };
  if (role === 'service') return { count: Number(a.instances), mult: Number(a.instances) };
  if (role === 'database') {
    if (a.replication === 'none' || a.replication === undefined) return { count: 1, mult: 1 };
    return readScale(Number(a.replicas ?? 1), a.replication === 'multi-primary' || a.replication === 'quorum');
  }
  return undefined;
}
