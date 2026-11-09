/**
 * FIX recommendations: one entry per architecture lint rule and per capacity status (`capacity/over`, `capacity/warn`,
 * `capacity/down`). Pure data plus `archFixFor`, the trivial one-click fixes (applied by `applyFix`, kind 'set-arch' / 'add-replica').
 * Blog slugs are URL pieces only (the editor never imports the blog app); the base path is configurable.
 */
import type { CNode } from '../types';
import { archOf, techOf } from './index';
import type { Fix } from '../lintFix';

export interface Recommendation { title: string; steps: string; blogSlug?: string }

/** where blog posts live in the host app (`/posts/$slug`) */
export const BLOG_BASE = '/posts';
export const blogUrl = (slug: string, base: string = BLOG_BASE): string => `${base.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`;

export const RECOMMENDATIONS: Record<string, Recommendation> = {
  'arch/spof': { title: 'Remove the single point of failure', steps: 'Run at least two instances behind the load balancer (set replicas to 2 or more) and spread them over zones. Check that health checks remove a dead instance.', blogSlug: 'single-point-of-failure' },
  'arch/db-no-replica': { title: 'Add a replica or standby', steps: 'Add a read replica or a hot standby with automatic failover. Decide async (fast, may lose the last writes) or sync (safe, slower writes).', blogSlug: 'database-replication' },
  'arch/db-no-backup': { title: 'Back the database up', steps: 'Enable snapshots or point-in-time recovery, store them in another zone or region, and test a restore regularly.', blogSlug: 'database-backups' },
  'arch/public-no-waf': { title: 'Shield public traffic', steps: 'Put a WAF, API gateway or load balancer between clients and the service: TLS termination, rate limits and filtering belong there.', blogSlug: 'api-gateway' },
  'arch/sync-cycle': { title: 'Break the synchronous cycle', steps: 'Make one hop asynchronous with a queue or an event, or merge the services. Cycles of blocking calls deadlock and amplify load.', blogSlug: 'event-driven-architecture' },
  'arch/no-monitoring': { title: 'Add monitoring', steps: 'Connect metrics, logs and alerts (Prometheus, CloudWatch) to every service, database and queue. Alert on latency, errors and saturation.', blogSlug: 'monitoring-and-observability' },
  'arch/cluster-profile': { title: 'Fix the cluster profile', steps: 'Follow the warning of the cluster profile: adjust node count, quorum or replication to what the technology needs.' },
  'arch/single-az': { title: 'Use more than one availability zone', steps: 'Deploy to multi-az: replicas in different zones survive a zone outage. Expect some extra cost and cross-zone latency.', blogSlug: 'high-availability' },
  'arch/cache-write-back-loss': { title: 'Avoid data loss with write-back', steps: 'Switch to write-through or write-around, or accept the loss window and persist the cache (AOF) with a short flush interval.', blogSlug: 'caching-strategies' },
  'arch/stale-reads': { title: 'Handle stale replica reads', steps: 'Read from the primary after a write (read-your-writes), or pin a session to the primary for a short time, or accept eventual consistency in the UI.', blogSlug: 'replication-lag' },
  'arch/hot-shard': { title: 'Avoid hot shards', steps: 'Use hash sharding or a composite key so that sequential keys spread over shards. Re-check the distribution under real traffic.', blogSlug: 'database-sharding' },
  'arch/idempotency': { title: 'Make consumers idempotent', steps: 'Give every message an id and store processed ids, or make the write an upsert. At-least-once delivery will redeliver.', blogSlug: 'idempotency' },
  'arch/no-dlq': { title: 'Add a dead-letter queue', steps: 'Route messages that fail after N retries to a DLQ, alert on its size, and build a replay tool.', blogSlug: 'dead-letter-queues' },
  'arch/stateful-no-affinity': { title: 'Add session affinity or externalise state', steps: 'Enable sticky sessions on the load balancer, or move the state to Redis or a database so any instance can serve any request.', blogSlug: 'stateless-services' },
  'arch/lb-no-healthcheck': { title: 'Enable health checks', steps: 'Turn on active health checks so the balancer stops sending traffic to dead or slow instances.', blogSlug: 'load-balancing' },
  'arch/kafka-rf': { title: 'Raise the Kafka replication factor', steps: 'Use replication factor 3 with min.insync.replicas 2: one broker can fail without losing data or availability.', blogSlug: 'kafka-replication' },
  'arch/kafka-acks': { title: 'Use acks=all', steps: 'Set producer acks to all with min.insync.replicas 2 so an acknowledged write survives a broker failure.', blogSlug: 'kafka-replication' },
  'arch/kafka-minisr': { title: 'Lower min.insync.replicas', steps: 'min.insync.replicas must be below the replication factor, or one broker loss blocks every producer. Use RF-1.', blogSlug: 'kafka-replication' },
  'arch/rabbit-not-durable': { title: 'Make the queue durable', steps: 'Declare durable queues and persistent messages, or use quorum queues, so a broker restart keeps messages.' },
  'arch/redis-standalone': { title: 'Replace standalone Redis', steps: 'Use Sentinel (failover) or Cluster (sharding and failover) so one node loss does not take the cache down.', blogSlug: 'redis-high-availability' },
  'arch/redis-no-persistence': { title: 'Persist Redis if it is a primary store', steps: 'Enable RDB snapshots and/or AOF. If it is only a cache, keep a database behind it and ignore this.', blogSlug: 'redis-persistence' },
  'arch/memcached-no-replication': { title: 'Plan for cache node loss', steps: 'Expect a cold share after a node loss: warm the cache gradually, protect the database with rate limits, or use Redis with replicas.', blogSlug: 'caching-strategies' },
  'arch/mongo-even-members': { title: 'Use an odd replica set size', steps: 'Use 3 or 5 voting members; an even count adds cost without better fault tolerance.', blogSlug: 'mongodb-replica-sets' },
  'arch/mongo-w1': { title: 'Use write concern majority', steps: 'Set w:majority so acknowledged writes survive a primary failover.', blogSlug: 'mongodb-replica-sets' },
  'arch/cassandra-rf': { title: 'Use replication factor 3', steps: 'RF 3 with LOCAL_QUORUM tolerates one node loss per datacenter.', blogSlug: 'cassandra-replication' },
  'arch/es-no-replicas': { title: 'Add replica shards', steps: 'Set at least one replica per shard so a node loss keeps all data searchable.' },
  'capacity/over': { title: 'Relieve the overloaded component', steps: 'Add replicas or raise capacity per replica, cache the hot reads in front of it, shed or queue the excess load, or cut the calls per request on the edge into it.', blogSlug: 'capacity-planning' },
  'capacity/warn': { title: 'Add headroom', steps: 'Above 70% utilization queueing latency grows fast. Add a replica, autoscale, or cache before traffic grows further.', blogSlug: 'capacity-planning' },
  'capacity/down': { title: 'Survive a lost component', steps: 'Run redundant instances in more than one zone, add health checks and retries with backoff, and degrade gracefully (serve cached data) when a dependency is down.', blogSlug: 'high-availability' },
};

export const recommendationFor = (key: string): Recommendation | undefined => RECOMMENDATIONS[key];

const setArch = (node: CNode, label: string, arch: Record<string, string | number | boolean>): Fix => ({ kind: 'set-arch', label, nodeId: node.id, arch });

/** the one-click fix of an architecture problem, when there is a trivial one (`node` = the component the problem is about) */
export function archFixFor(rule: string, node: CNode | undefined): Fix | undefined {
  if (!node) return undefined;
  const a = archOf(node);
  const tech = techOf(node)?.id;
  switch (rule) {
    case 'arch/spof': return { kind: 'add-replica', label: `Add a replica to ${String(node.data.label)}`, nodeId: node.id };
    case 'arch/db-no-replica': {
      if (tech === 'mongodb') return setArch(node, 'Use 3 replica set members', { replicaSetMembers: 3 });
      if (tech === 'elasticsearch') return setArch(node, 'Add 1 replica shard', { replicas: 1 });
      if (tech === 'cassandra') return setArch(node, 'Use replication factor 3', { replicationFactor: 3 });
      const mode = tech === 'postgres' ? 'streaming-async' : tech === 'mysql' ? 'async' : 'primary-replica-async';
      return setArch(node, 'Add a replica (async)', { replication: mode, replicas: Math.max(1, Number(a.replicas ?? 1)) });
    }
    case 'arch/db-no-backup': return setArch(node, 'Enable snapshot backups', { backup: 'snapshot' });
    case 'arch/single-az': return setArch(node, 'Deploy multi-az', { deployment: 'multi-az' });
    case 'arch/cache-write-back-loss': return setArch(node, 'Use write-through', { strategy: 'write-through' });
    case 'arch/no-dlq': return setArch(node, 'Enable the dead-letter queue', { dlq: true });
    case 'arch/lb-no-healthcheck': return setArch(node, 'Enable health checks', { healthCheck: true });
    case 'arch/kafka-rf': return setArch(node, 'Set replication factor 3', { replicationFactor: 3 });
    case 'arch/kafka-acks': return setArch(node, 'Set acks=all', { acks: 'all' });
    case 'arch/kafka-minisr': return setArch(node, 'Set min in-sync replicas to RF-1', { minInsyncReplicas: Math.max(1, Number(a.replicationFactor) - 1) });
    case 'arch/rabbit-not-durable': return setArch(node, 'Make durable', { durable: true });
    case 'arch/redis-standalone': return setArch(node, 'Use Sentinel', { mode: 'sentinel' });
    case 'arch/redis-no-persistence': return setArch(node, 'Enable RDB snapshots', { persistence: 'rdb' });
    case 'arch/mongo-even-members': return setArch(node, 'Add one member', { replicaSetMembers: Number(a.replicaSetMembers) + 1 });
    case 'arch/mongo-w1': return setArch(node, 'Use majority write concern', { writeConcern: 'majority' });
    case 'arch/cassandra-rf': return setArch(node, 'Set replication factor 3', { replicationFactor: 3 });
    case 'arch/es-no-replicas': return setArch(node, 'Add 1 replica shard', { replicas: 1 });
    default: return undefined;
  }
}
