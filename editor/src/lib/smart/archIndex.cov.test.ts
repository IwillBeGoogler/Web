import { describe, expect, it } from 'vitest';
import { ARCH_FIELDS, ARCH_ROLES, archBadges, archOf, archScale, fieldsFor, hasArch, nodeBadges, techOf, TECH_PROFILES } from '@core/arch';
import type { CNode } from '@core/types';

const node = (data: Record<string, unknown>, type = 'icon'): CNode => ({ id: 'n', type, position: { x: 0, y: 0 }, data: { label: 'n', ...data } });
const tech = (id: string) => TECH_PROFILES.find((p) => p.id === id)!;
const withArch = (iconId: string, arch: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => node({ iconId, arch, ...extra });

describe('techOf / fieldsFor / archOf', () => {
  it('matches by iconId then profileId; unknown gives undefined', () => {
    expect(techOf(node({ iconId: 'redis' }))?.id).toBe('redis');
    expect(techOf(node({ profileId: 'kafka' }))?.id).toBe('kafka');
    expect(techOf(node({ iconId: 'zzz', profileId: 'nginx' }))?.id).toBe('nginx');
    expect(techOf(node({}))).toBeUndefined();
    expect(techOf(node({ iconId: 'nothing' }))).toBeUndefined();
  });
  it('fieldsFor: tech fields replace generic ones with the same key; no tech returns all generic', () => {
    const none = fieldsFor('database');
    expect(none.tech).toEqual([]);
    expect(none.generic).toEqual(ARCH_FIELDS.database);
    const pg = fieldsFor('database', tech('postgres'));
    expect(pg.tech.length).toBeGreaterThan(0);
    expect(pg.generic.some((f) => f.key === 'replication')).toBe(false);
    expect(fieldsFor('other' as never).generic).toEqual([]);
  });
  it('archOf clamps numbers, rejects bad enums and bools, falls back to defaults', () => {
    const k = withArch('kafka', { partitions: 9999, replicationFactor: -4, acks: 'bogus', retentionHours: 'x', consumerGroups: Number.NaN });
    const a = archOf(k, 'queue');
    expect(a.replicationFactor).toBe(1);
    expect(a.acks).toBe('all');
    expect(a.retentionHours).toBe(168);
    expect(a.consumerGroups).toBe(1);
    expect(typeof a.partitions).toBe('number');
    expect(archOf(withArch('rabbitmq', { durable: 'yes' }), 'queue').durable).toBe(true);
    expect(archOf(withArch('rabbitmq', { durable: false }), 'queue').durable).toBe(false);
    expect(archOf(node({ iconId: 'redis' }), 'cache')).toBeTruthy();
    expect(hasArch(node({ arch: 'x' }))).toBe(false);
    expect(hasArch(node({ arch: {} }))).toBe(true);
  });
});

describe('archBadges', () => {
  const badges = (iconId: string, arch: Record<string, unknown>, role: (typeof ARCH_ROLES)[number]) => archBadges(role, archOf(withArch(iconId, arch), role), tech(iconId));
  it('every technology profile', () => {
    expect(badges('kafka', {}, 'queue')).toEqual(expect.arrayContaining(['acks=all']));
    expect(badges('rabbitmq', { queueType: 'quorum', durable: false }, 'queue')).toEqual(expect.arrayContaining(['quorum', 'transient']));
    expect(badges('rabbitmq', {}, 'queue')).toContain('durable');
    expect(badges('redis', { mode: 'cluster', persistence: 'aof' }, 'cache')).toEqual(expect.arrayContaining(['cluster', 'aof']));
    expect(badges('memcached', {}, 'cache')).toContain('no repl');
    expect(badges('postgres', {}, 'database')).toContain('no repl');
    expect(badges('postgres', { replication: 'streaming-sync', pooler: 'pgbouncer', ha: 'patroni' }, 'database')).toEqual(expect.arrayContaining(['PR·sync', 'pgbouncer', 'patroni']));
    expect(badges('mysql', { replication: 'group-replication' }, 'database')).toContain('GR');
    expect(badges('mongodb', { sharded: true }, 'database')).toEqual(expect.arrayContaining(['sharded']));
    expect(badges('mongodb', {}, 'database').some((b) => b.includes('w:'))).toBe(true);
    expect(badges('cassandra', {}, 'database').some((b) => b.startsWith('RF'))).toBe(true);
    expect(badges('elasticsearch', {}, 'database').some((b) => b.includes('s/'))).toBe(true);
    expect(badges('nginx', { algorithm: 'ip-hash' }, 'lb').some((b) => b.includes('IPH'))).toBe(true);
    expect(badges('haproxy', { algorithm: 'weird' }, 'lb').length).toBeGreaterThan(0);
  });
  it('generic roles without a profile', () => {
    const g = (role: (typeof ARCH_ROLES)[number], arch: Record<string, unknown> = {}) => archBadges(role, archOf(node({ arch }), role));
    expect(g('database', { replication: 'multi-primary', sharding: 'hash' })).toEqual(expect.arrayContaining(['MP', 'shard:hash']));
    expect(g('database', { replication: 'custom-repl' })).toBeDefined();
    expect(g('database')[0]).toBeTruthy();
    expect(g('cache').length).toBeGreaterThan(0);
    expect(g('queue', { delivery: 'exactly-once', ordering: 'fifo', dlq: true })).toEqual(expect.arrayContaining(['=1 exactly', 'FIFO', 'DLQ']));
    expect(g('queue', { ordering: 'per-partition' })).toContain('ordered');
    expect(g('lb', { sticky: true, algorithm: 'weighted' })).toEqual(expect.arrayContaining(['sticky']));
    expect(g('gateway', { auth: 'jwt', rateLimit: true })).toEqual(expect.arrayContaining(['jwt', 'rate-limit']));
    expect(g('gateway', { auth: 'none' })).not.toContain('none');
    expect(g('cdn').length).toBeGreaterThan(0);
    expect(g('storage').length).toBeGreaterThanOrEqual(2);
    expect(g('service', { instances: 3, stateful: true, autoscale: 'cpu' })).toEqual(expect.arrayContaining(['×3', 'stateful']));
    expect(g('waf')).toBeDefined();
    expect(archBadges('client' as never, {})).toEqual([]);
  });
  it('deployment other than single-az is appended', () => {
    expect(archBadges('service', { instances: 1, autoscale: 'none', deployment: 'multi-az' })).toContain('multi-az');
    expect(archBadges('service', { instances: 1, autoscale: 'none', deployment: 'single-az' })).not.toContain('single-az');
  });
});

describe('nodeBadges / archScale', () => {
  it('nodeBadges: no arch gives [], non-arch role gives []', () => {
    expect(nodeBadges(node({}))).toEqual([]);
    expect(nodeBadges(withArch('redis'))).toBeDefined();
    expect(nodeBadges(node({ arch: {}, label: 'users' })).length).toBeGreaterThanOrEqual(0);
  });
  it('archScale per technology and role', () => {
    expect(archScale(node({}), 'service')).toBeUndefined();
    expect(archScale(withArch('kafka', { partitions: 6 }), 'queue')).toEqual({ count: 6, mult: 6 });
    expect(archScale(withArch('mongodb', { readPreference: 'primary' }), 'database')).toEqual({ count: 1, mult: 1 });
    const mongo = archScale(withArch('mongodb', { readPreference: 'secondary', replicaSetMembers: 3 }), 'database', 0.5)!;
    expect(mongo.count).toBe(3);
    expect(mongo.mult).toBeGreaterThan(1);
    expect(archScale(withArch('elasticsearch', { replicas: 2 }), 'database')).toEqual({ count: 3, mult: 3 });
    expect(archScale(withArch('x', { instances: 4 }), 'service')).toEqual({ count: 4, mult: 4 });
    expect(archScale(withArch('postgres', { replication: 'none' }), 'database')).toEqual({ count: 1, mult: 1 });
    const pg = archScale(withArch('postgres', { replication: 'streaming-async' }), 'database', 2)!;
    expect(pg.count).toBeGreaterThanOrEqual(1);
    expect(archScale(withArch('postgres', { replication: 'streaming-async' }), 'database', -1)).toBeDefined();
    expect(archScale(withArch('x', { replication: 'multi-primary', replicas: 2 }), 'database')).toBeDefined();
    expect(archScale(withArch('x', { replication: 'quorum' }), 'database')).toBeDefined();
    expect(archScale(withArch('x'), 'cache')).toBeUndefined();
  });
});
