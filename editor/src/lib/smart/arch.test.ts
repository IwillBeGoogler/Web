import { describe, expect, it } from 'vitest';
import { archBadges, archOf, archScale, nodeBadges, techOf } from '@core/arch';
import { analyzeCapacity } from '@core/capacity';
import { lintPage } from '@core/lint';
import type { CEdge, CNode, CPage } from '@core/types';

const icon = (id: string, iconId: string, arch?: Record<string, unknown>, extra: Record<string, unknown> = {}): CNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id, iconId, ...(arch ? { arch } : {}), ...extra } });
const edge = (id: string, source: string, target: string): CEdge => ({ id, source, target });
const page = (nodes: CNode[], edges: CEdge[] = []): CPage => ({ id: 'p', name: 'p', nodes, edges });
const rules = (p: CPage, rule: string) => lintPage(p).filter((x) => x.rule === rule);
const fires = (n: CNode, rule: string) => rules(page([n]), rule).length;

describe('archOf / badges', () => {
  it('merges defaults, ignores bad values, clamps numbers', () => {
    const n = icon('c', 'redis', { hitRate: 250, strategy: 'nope' });
    const a = archOf(n);
    expect(a.hitRate).toBe(100);
    expect(a.strategy).toBe('cache-aside');
    expect(a.mode).toBe('standalone');
    expect(archOf(icon('d', 'postgresql')).workload).toBe('OLTP');
  });
  it('badges', () => {
    expect(archBadges('database', archOf(icon('d', 'database', { replication: 'primary-replica-async' })))).toEqual(['OLTP', 'PR·async']);
    expect(archBadges('cache', archOf(icon('c', 'cache', { deployment: 'multi-az' })))).toEqual(['Cache-aside 80%', 'multi-az']);
    expect(archBadges('lb', archOf(icon('l', 'load-balancer')))).toEqual(['L7 RR']);
    expect(archBadges('queue', archOf(icon('q', 'queue')))).toContain('≥1 at-least');
    expect(nodeBadges(icon('k', 'kafka', {}))).toEqual(['RF3', 'acks=all', '3p']);
    expect(nodeBadges(icon('k', 'kafka'))).toEqual([]);
    expect(techOf(icon('m', 'mongodb'))?.id).toBe('mongodb');
  });
});

describe('arch lint (opt-in via data.arch)', () => {
  it('nothing without arch', () => {
    for (const r of ['arch/single-az', 'arch/no-dlq', 'arch/kafka-rf', 'arch/redis-standalone']) expect(lintPage(page([icon('x', 'kafka'), icon('r', 'redis'), icon('q', 'queue')])).filter((p) => p.rule === r)).toHaveLength(0);
  });
  it('single-az, write-back, stale reads, hot shard', () => {
    expect(fires(icon('d', 'postgresql', {}), 'arch/single-az')).toBe(1);
    expect(fires(icon('d', 'postgresql', { deployment: 'multi-az' }), 'arch/single-az')).toBe(0);
    expect(fires(icon('c', 'cache', { strategy: 'write-back' }), 'arch/cache-write-back-loss')).toBe(1);
    expect(fires(icon('c', 'cache', { strategy: 'write-through' }), 'arch/cache-write-back-loss')).toBe(0);
    expect(fires(icon('d', 'database', { replication: 'primary-replica-async' }), 'arch/stale-reads')).toBe(1);
    expect(fires(icon('d', 'database', { replication: 'primary-replica-sync' }), 'arch/stale-reads')).toBe(0);
    expect(fires(icon('d', 'database', { sharding: 'range' }), 'arch/hot-shard')).toBe(1);
  });
  it('db replica / backup use arch', () => {
    expect(fires(icon('d', 'database'), 'arch/db-no-replica')).toBe(1);
    expect(fires(icon('d', 'database', { replication: 'quorum' }), 'arch/db-no-replica')).toBe(0);
    expect(fires(icon('d', 'database', { replication: 'none' }), 'arch/db-no-replica')).toBe(1);
    expect(fires(icon('d', 'database', { backup: 'pitr' }), 'arch/db-no-backup')).toBe(0);
    const [p] = rules(page([icon('d', 'database', { backup: 'none' })]), 'arch/db-no-backup');
    expect(p.message).toMatch(/"none"/);
  });
  it('queue rules', () => {
    expect(fires(icon('q', 'queue', {}), 'arch/idempotency')).toBe(1);
    expect(fires(icon('q', 'queue', { delivery: 'exactly-once' }), 'arch/idempotency')).toBe(0);
    expect(fires(icon('q', 'queue', {}), 'arch/no-dlq')).toBe(1);
    expect(fires(icon('q', 'queue', { dlq: true }), 'arch/no-dlq')).toBe(0);
  });
  it('lb health check and stateful affinity', () => {
    expect(fires(icon('l', 'load-balancer', { healthCheck: false }), 'arch/lb-no-healthcheck')).toBe(1);
    const svc = icon('s', 'service', { stateful: true, instances: 3 });
    const mk = (lb: Record<string, unknown>) => page([icon('l', 'load-balancer', lb), svc], [edge('e', 'l', 's')]);
    expect(rules(mk({}), 'arch/stateful-no-affinity')).toHaveLength(1);
    expect(rules(mk({ sticky: true }), 'arch/stateful-no-affinity')).toHaveLength(0);
    expect(rules(mk({ algorithm: 'ip-hash' }), 'arch/stateful-no-affinity')).toHaveLength(0);
    expect(rules(page([icon('l', 'load-balancer'), icon('s', 'service', { stateful: true, instances: 1 })], [edge('e', 'l', 's')]), 'arch/stateful-no-affinity')).toHaveLength(0);
  });
  it('kafka', () => {
    expect(fires(icon('k', 'kafka', { replicationFactor: 2, minInsyncReplicas: 1 }), 'arch/kafka-rf')).toBe(1);
    expect(fires(icon('k', 'kafka', {}), 'arch/kafka-rf')).toBe(0);
    expect(fires(icon('k', 'kafka', { acks: '1' }), 'arch/kafka-acks')).toBe(1);
    expect(fires(icon('k', 'kafka', { acks: 'all' }), 'arch/kafka-acks')).toBe(0);
    const [e] = rules(page([icon('k', 'kafka', { replicationFactor: 3, minInsyncReplicas: 3 })]), 'arch/kafka-minisr');
    expect(e.severity).toBe('error');
    expect(fires(icon('k', 'kafka', {}), 'arch/kafka-minisr')).toBe(0);
  });
  it('rabbitmq / redis / memcached', () => {
    expect(fires(icon('r', 'rabbitmq', { durable: false }), 'arch/rabbit-not-durable')).toBe(1);
    expect(fires(icon('r', 'rabbitmq', { durable: false, queueType: 'quorum' }), 'arch/rabbit-not-durable')).toBe(0);
    expect(fires(icon('r', 'redis', {}), 'arch/redis-standalone')).toBe(1);
    expect(fires(icon('r', 'redis', { mode: 'cluster' }), 'arch/redis-standalone')).toBe(0);
    expect(fires(icon('r', 'redis', { persistence: 'none' }), 'arch/redis-no-persistence')).toBe(1);
    expect(rules(page([icon('r', 'redis', { persistence: 'none' }), icon('d', 'postgresql')], [edge('e', 'r', 'd')]), 'arch/redis-no-persistence')).toHaveLength(0);
    expect(fires(icon('m', 'memcached', {}), 'arch/memcached-no-replication')).toBe(1);
  });
  it('mongodb / cassandra / elasticsearch', () => {
    expect(fires(icon('m', 'mongodb', { replicaSetMembers: 4 }), 'arch/mongo-even-members')).toBe(1);
    expect(fires(icon('m', 'mongodb', {}), 'arch/mongo-even-members')).toBe(0);
    expect(fires(icon('m', 'mongodb', { writeConcern: '1' }), 'arch/mongo-w1')).toBe(1);
    expect(fires(icon('c', 'cassandra', { replicationFactor: 2 }), 'arch/cassandra-rf')).toBe(1);
    expect(fires(icon('e', 'elasticsearch', { replicas: 0 }), 'arch/es-no-replicas')).toBe(1);
    expect(fires(icon('e', 'elasticsearch', {}), 'arch/es-no-replicas')).toBe(0);
  });
});

describe('arch capacity', () => {
  const cap = (rps: number, extra: Record<string, unknown> = {}) => ({ capacity: { rps, ...extra } });
  it('cache hit rate reduces forwarded load', () => {
    const p = page([icon('c', 'redis', { hitRate: 90 }, cap(1000)), icon('d', 'postgresql')], [edge('e', 'c', 'd')]);
    const r = analyzeCapacity(p);
    expect(r.nodes.d.load).toBeCloseTo(100);
    expect(r.edges.e.rps).toBeCloseTo(100);
    // no arch: everything forwarded
    expect(analyzeCapacity(page([icon('c', 'redis', undefined, cap(1000)), icon('d', 'postgresql')], [edge('e', 'c', 'd')])).nodes.d.load).toBe(1000);
  });
  it('cdn hit rate default 90', () => {
    const r = analyzeCapacity(page([icon('c', 'cdn', {}, cap(1000)), icon('s', 'service')], [edge('e', 'c', 's')]));
    expect(r.nodes.s.load).toBeCloseTo(100);
  });
  it('db replicas scale reads, not writes', () => {
    const mk = (extra: Record<string, unknown>, arch: Record<string, unknown>) => analyzeCapacity(page([icon('d', 'database', arch, { capacity: { rps: 100, capacityRps: 100, ...extra } })])).nodes.d.capacity;
    expect(mk({}, { replication: 'primary-replica-async', replicas: 3 })).toBe(400);
    expect(mk({ writeRatio: 1 }, { replication: 'primary-replica-async', replicas: 3 })).toBe(100);
    expect(mk({ writeRatio: 0.5 }, { replication: 'primary-replica-async', replicas: 3 })).toBeCloseTo(160);
    expect(mk({}, { replication: 'multi-primary', replicas: 2, })).toBe(300);
    expect(mk({}, {})).toBe(100);
    // explicit replicas win
    expect(mk({ replicas: 2 }, { replication: 'primary-replica-async', replicas: 3 })).toBe(200);
  });
  it('service instances default replicas; kafka partitions', () => {
    const c = (iconId: string, arch: Record<string, unknown>, extra: Record<string, unknown> = {}) => analyzeCapacity(page([icon('s', iconId, arch, { capacity: { rps: 10, capacityRps: 50, ...extra } })])).nodes.s.capacity;
    expect(c('service', { instances: 4 })).toBe(200);
    expect(c('service', { instances: 4 }, { replicas: 1 })).toBe(50);
    expect(c('kafka', { partitions: 6 })).toBe(300);
    expect(archScale(icon('m', 'mongodb', { replicaSetMembers: 3, readPreference: 'secondary' }), 'database')?.mult).toBe(3);
  });
});
