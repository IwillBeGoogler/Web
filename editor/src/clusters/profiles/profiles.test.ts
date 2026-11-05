import { describe, expect, it } from 'vitest';
import { PROFILES, getProfile } from './index';
import { slotRanges, HASH_SLOTS, redisProfile, type RedisParams } from './redis';
import { cassandraProfile, tokenFor, type CassandraParams } from './cassandra';
import { postgresqlProfile, type PgParams } from './postgresql';
import { mysqlProfile, type MySqlParams } from './mysql';
import { mongodbProfile, type MongoParams } from './mongodb';
import { elasticsearchProfile, type EsParams } from './elasticsearch';
import { clickhouseProfile, type ChParams } from './clickhouse';
import { rabbitmqProfile, type RabbitParams } from './rabbitmq';
import { quorumProfile, type QuorumParams } from './quorum';
import { gridLayout, ringLayout, ringRadius, shardMatrix, tieredLayout } from '../layout';
import { ancestorsOf, sortParentsFirst } from '../../lib/graph';
import { hasIcon } from '../../data/icons';
import type { DiagramNode } from '../../types';

const leaves = (nodes: DiagramNode[]) => nodes.filter((n) => n.type === 'icon');
const role = (nodes: DiagramNode[], r: string) => leaves(nodes).filter((n) => n.data.role === r);

describe('every profile', () => {
  it('registry exposes the requested profiles', () => {
    expect(PROFILES.map((p) => p.id).slice(0, 10)).toEqual(['kafka', 'postgresql', 'mysql', 'mongodb', 'redis', 'cassandra', 'elasticsearch', 'clickhouse', 'rabbitmq', 'quorum']);
    expect(getProfile('redis')).toBe(redisProfile as never);
    expect(getProfile('nope')).toBeUndefined();
  });
  for (const profile of PROFILES) {
    describe(profile.id, () => {
      it('has the contract fields and resolvable icons', () => {
        expect(profile).toMatchObject({ id: expect.any(String), tech: expect.any(String), label: expect.any(String) });
        expect(hasIcon(profile.iconId)).toBe(true);
        expect(profile.roles.length).toBeGreaterThan(0);
        expect(profile.topologies.length).toBeGreaterThan(0);
        expect(profile.fields.length).toBeGreaterThan(0);
        expect(profile.schema.safeParse(profile.defaults).success).toBe(true);
        expect(profile.schema.safeParse({}).success).toBe(true);
      });
      it('default generate is consistent: unique ids, parents first, valid edges, depth <= 3, icons resolve, params stored', () => {
        const g = profile.generate(profile.defaults, 'c');
        const ids = g.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(sortParentsFirst(g.nodes).map((n) => n.id)).toEqual(ids);
        expect(g.nodes[0]).toMatchObject({ id: 'c', type: 'cluster' });
        expect(g.nodes[0].data.params).toEqual(profile.defaults);
        expect(g.nodes[0].data.profileId).toBe(profile.id);
        for (const e of g.edges) {
          expect(ids).toContain(e.source);
          expect(ids).toContain(e.target);
        }
        expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length);
        for (const n of g.nodes) {
          expect(ancestorsOf(g.nodes, n.id).length).toBeLessThanOrEqual(2);
          if (n.type === 'icon' && n.data.iconId) expect(hasIcon(n.data.iconId), `${profile.id}:${n.id}:${n.data.iconId}`).toBe(true);
        }
        expect(g.size.width).toBeGreaterThan(100);
        expect(typeof profile.summarize(profile.defaults)).toBe('string');
        expect(Array.isArray(profile.validate(profile.defaults))).toBe(true);
      });
      it('every generated direct child lies inside its cluster box (layout bounds)', () => {
        const g = profile.generate(profile.defaults, 'c');
        const root = g.nodes[0];
        for (const n of g.nodes.filter((x) => x.parentId === 'c')) {
          expect(n.position.x).toBeGreaterThanOrEqual(0);
          expect(n.position.y).toBeGreaterThanOrEqual(0);
          expect(n.position.x + (n.width ?? 0)).toBeLessThanOrEqual((root.width ?? 0) + 1);
          expect(n.position.y + (n.height ?? 0)).toBeLessThanOrEqual((root.height ?? 0) + 1);
        }
      });
    });
  }
});

describe('layout helpers', () => {
  it('ring: n points on a circle, first at the top, evenly spaced', () => {
    const c = { x: 100, y: 100 };
    const pts = ringLayout(6, 80, c);
    expect(pts[0].x).toBeCloseTo(100);
    expect(pts[0].y).toBeCloseTo(20); // top
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(80);
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const gaps = pts.map((p, i) => d(p, pts[(i + 1) % pts.length]));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);
    expect(pts[3].y).toBeCloseTo(180); // opposite side (bottom)
    expect(ringRadius(12, 150)).toBeGreaterThan(ringRadius(4, 150));
  });
  it('grid, tiered and shard matrix', () => {
    expect(gridLayout(5, 3, 10, 20)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 }]);
    const t = tieredLayout([1, 3], 100, 50);
    expect(t[0][0].x).toBe(100); // single master centred over 3 data nodes
    expect(t[1].map((p) => p.x)).toEqual([0, 100, 200]);
    expect(t[1][0].y).toBe(50);
    const m = shardMatrix(2, 3, 100, 60);
    expect(m).toHaveLength(6);
    expect(m[0]).toEqual({ x: 0, y: 0 });
    expect(m[2]).toEqual({ x: 0, y: 120 }); // shard 0, replica 2
    expect(m[3]).toEqual({ x: 100, y: 0 }); // shard 1, replica 0
  });
});

describe('Redis', () => {
  it('hash slots: 16384 split across masters (contiguous, complete, balanced)', () => {
    expect(slotRanges(3)).toEqual([{ from: 0, to: 5460 }, { from: 5461, to: 10922 }, { from: 10923, to: 16383 }]);
    for (const n of [3, 4, 5, 6, 7, 8]) {
      const r = slotRanges(n);
      expect(r[0].from).toBe(0);
      expect(r[n - 1].to).toBe(HASH_SLOTS - 1);
      for (let i = 1; i < n; i++) expect(r[i].from).toBe(r[i - 1].to + 1);
      const sizes = r.map((x) => x.to - x.from + 1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(HASH_SLOTS);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });
  const P = (o: Partial<RedisParams>): RedisParams => ({ ...redisProfile.defaults, ...o });
  it('cluster mode shows slot ranges on masters and replicas per master', () => {
    const g = redisProfile.generate(P({ mode: 'cluster', masters: 3, replicasPerMaster: 1 }), 'r');
    expect(role(g.nodes, 'master')).toHaveLength(3);
    expect(role(g.nodes, 'replica')).toHaveLength(3);
    expect(role(g.nodes, 'master').map((m) => m.data.subtitle)).toEqual(['slots 0-5460', 'slots 5461-10922', 'slots 10923-16383']);
    expect(g.edges.filter((e) => e.data?.kind === 'replication')).toHaveLength(3);
    expect(redisProfile.summarize(P({ mode: 'cluster', masters: 6, replicasPerMaster: 1 }))).toBe('Cluster · 6 masters x 2 · 16384 slots');
  });
  it('sentinel mode: master, replicas and sentinels', () => {
    const g = redisProfile.generate(P({ mode: 'sentinel', replicas: 2, sentinels: 3 }), 'r');
    expect(role(g.nodes, 'master')).toHaveLength(1);
    expect(role(g.nodes, 'replica')).toHaveLength(2);
    expect(role(g.nodes, 'sentinel')).toHaveLength(3);
  });
  it('validate', () => {
    expect(redisProfile.validate(P({ mode: 'sentinel', sentinels: 2 })).some((w) => /sentinel/i.test(w))).toBe(true);
    expect(redisProfile.validate(P({ mode: 'sentinel', sentinels: 4 })).some((w) => /even/i.test(w))).toBe(true);
    expect(redisProfile.validate(P({ mode: 'sentinel', replicas: 0 })).some((w) => /no replicas/i.test(w))).toBe(true);
    expect(redisProfile.validate(P({ mode: 'cluster', replicasPerMaster: 0 })).some((w) => /without replicas/i.test(w))).toBe(true);
    expect(redisProfile.validate(P({ mode: 'sentinel' }))).toEqual([]);
  });
});

describe('Cassandra / ScyllaDB ring', () => {
  const P = (o: Partial<CassandraParams>): CassandraParams => ({ ...cassandraProfile.defaults, ...o });
  it('N nodes per DC laid out on a circle; DC groups; Scylla swaps the logo', () => {
    const g = cassandraProfile.generate(P({ dcs: 2, nodesPerDc: 6 }), 'c');
    expect(g.nodes.filter((n) => n.type === 'group')).toHaveLength(2);
    expect(leaves(g.nodes)).toHaveLength(12);
    const dc1 = leaves(g.nodes).filter((n) => n.parentId === 'c-dc1');
    const cx = dc1.reduce((s, n) => s + n.position.x + (n.width ?? 0) / 2, 0) / dc1.length;
    const cy = dc1.reduce((s, n) => s + n.position.y + (n.height ?? 0) / 2, 0) / dc1.length;
    const radii = dc1.map((n) => Math.hypot(n.position.x + (n.width ?? 0) / 2 - cx, n.position.y + (n.height ?? 0) / 2 - cy));
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 5); // equal distance from the centre = a circle
    expect(g.edges.some((e) => e.label === 'cross-DC replication')).toBe(true);
    expect(leaves(cassandraProfile.generate(P({ tech: 'scylla' }), 'c').nodes)[0].data.iconId).toBe('scylladb');
  });
  it('token positions are evenly spread over the ring', () => {
    expect(tokenFor(0, 4)).toBe('-9.22e18');
    expect(tokenFor(2, 4)).toBe('0');
    expect(tokenFor(1, 4)).not.toBe(tokenFor(3, 4));
  });
  it('validate and summarize', () => {
    expect(cassandraProfile.validate(P({ nodesPerDc: 3, rfPerDc: 5 })).some((w) => /exceeds/i.test(w))).toBe(true);
    expect(cassandraProfile.validate(P({ rfPerDc: 1 })).some((w) => /QUORUM/.test(w))).toBe(true);
    expect(cassandraProfile.validate(P({ dcs: 1 })).some((w) => /single datacenter/i.test(w))).toBe(true);
    expect(cassandraProfile.validate(P({ dcs: 2, rfPerDc: 3 }))).toEqual([]);
    expect(cassandraProfile.summarize(P({ dcs: 2, nodesPerDc: 6 }))).toBe('Cassandra · 2 DCs x 6 nodes · RF dc1:3, dc2:3');
  });
});

describe('PostgreSQL', () => {
  const P = (o: Partial<PgParams>): PgParams => ({ ...postgresqlProfile.defaults, ...o });
  it('Patroni + etcd + HAProxy + PgBouncer by default', () => {
    const g = postgresqlProfile.generate(P({}), 'p');
    expect(role(g.nodes, 'primary')).toHaveLength(1);
    expect(role(g.nodes, 'replica')).toHaveLength(2);
    expect(leaves(g.nodes).filter((n) => n.data.iconId === 'etcd')).toHaveLength(3);
    expect(leaves(g.nodes).some((n) => n.data.label === 'HAProxy')).toBe(true);
    expect(leaves(g.nodes).some((n) => /PgBouncer/.test(n.data.label))).toBe(true);
    expect(g.edges.filter((e) => e.data?.kind === 'replication')).toHaveLength(2);
    expect(postgresqlProfile.summarize(P({ replication: 'sync' }))).toBe('Patroni · 1 primary + 2 replicas · sync · PgBouncer · HAProxy');
  });
  it('sync/async labels, Citus workers, manual HA', () => {
    expect(postgresqlProfile.generate(P({ replication: 'sync' }), 'p').edges.find((e) => e.data?.kind === 'replication')!.data).toMatchObject({ replMode: 'sync' });
    const c = postgresqlProfile.generate(P({ citus: true, workers: 3 }), 'p');
    expect(role(c.nodes, 'coordinator')).toHaveLength(1);
    expect(role(c.nodes, 'shard')).toHaveLength(3);
    expect(c.edges.filter((e) => e.data?.kind === 'sharding')).toHaveLength(3);
    expect(leaves(postgresqlProfile.generate(P({ ha: 'manual' }), 'p').nodes).some((n) => n.data.iconId === 'etcd')).toBe(false);
  });
  it('validate', () => {
    expect(postgresqlProfile.validate(P({ replicas: 0 })).some((w) => /no replicas/i.test(w))).toBe(true);
    expect(postgresqlProfile.validate(P({ replicas: 0, replication: 'sync' })).some((w) => /synchronous/i.test(w))).toBe(true);
    expect(postgresqlProfile.validate(P({ etcdNodes: 4 as never })).some((w) => /even/i.test(w))).toBe(true);
    expect(postgresqlProfile.validate(P({}))).toEqual([]);
  });
});

describe('MySQL', () => {
  const P = (o: Partial<MySqlParams>): MySqlParams => ({ ...mysqlProfile.defaults, ...o });
  it('InnoDB Cluster: 1 primary + replicas + router; Galera: all primaries with mesh heartbeats', () => {
    const g = mysqlProfile.generate(P({}), 'm');
    expect(role(g.nodes, 'primary')).toHaveLength(1);
    expect(role(g.nodes, 'replica')).toHaveLength(2);
    expect(leaves(g.nodes).some((n) => /Router/.test(n.data.label))).toBe(true);
    const gal = mysqlProfile.generate(P({ topology: 'galera', nodes: 5, router: false, proxysql: true }), 'm');
    expect(role(gal.nodes, 'primary')).toHaveLength(5);
    expect(leaves(gal.nodes).some((n) => /ProxySQL/.test(n.data.label))).toBe(true);
  });
  it('validate and summarize', () => {
    expect(mysqlProfile.validate(P({ nodes: 2 })).some((w) => /at least 3/.test(w))).toBe(true);
    expect(mysqlProfile.validate(P({ nodes: 4 })).some((w) => /even/i.test(w))).toBe(true);
    expect(mysqlProfile.validate(P({}))).toEqual([]);
    expect(mysqlProfile.summarize(P({}))).toBe('InnoDB Cluster · 3 nodes · single-primary · Router');
  });
});

describe('MongoDB', () => {
  const P = (o: Partial<MongoParams>): MongoParams => ({ ...mongodbProfile.defaults, ...o });
  it('replica set P-S-S and P-S-A', () => {
    const pss = mongodbProfile.generate(P({}), 'm');
    expect(role(pss.nodes, 'primary')).toHaveLength(1);
    expect(role(pss.nodes, 'replica')).toHaveLength(2);
    const psa = mongodbProfile.generate(P({ arbiter: true }), 'm');
    expect(role(psa.nodes, 'arbiter')).toHaveLength(1);
    expect(role(psa.nodes, 'replica')).toHaveLength(1);
    expect(mongodbProfile.summarize(P({ arbiter: true }))).toBe('Replica set · P-S-A · 2 data members + arbiter');
  });
  it('sharded: mongos + config RS + N shard replica sets laid out as a shard matrix', () => {
    const g = mongodbProfile.generate(P({ mode: 'sharded', shards: 3, shardMembers: 3, mongos: 2, configMembers: 3 }), 'm');
    expect(role(g.nodes, 'coordinator')).toHaveLength(2);
    expect(g.nodes.filter((n) => n.type === 'group' && /^Shard/.test(n.data.label))).toHaveLength(3);
    expect(leaves(g.nodes).filter((n) => /^shard\d-\d$/.test(n.data.label))).toHaveLength(9);
    expect(leaves(g.nodes).filter((n) => /^cfg-/.test(n.data.label))).toHaveLength(3);
    const col = (s: number) => leaves(g.nodes).filter((n) => n.parentId === `m-shard-${s}`).map((n) => n.position.y);
    expect(col(1)).toEqual(col(2)); // same rows in every shard column
    expect(mongodbProfile.summarize(P({ mode: 'sharded', shards: 3 }))).toBe('Sharded · 3 shards x 3 · 3 config · 2 mongos');
  });
  it('validate', () => {
    expect(mongodbProfile.validate(P({ arbiter: true })).some((w) => /arbiter/i.test(w))).toBe(true);
    expect(mongodbProfile.validate(P({ members: 4 })).some((w) => /even/i.test(w))).toBe(true);
    expect(mongodbProfile.validate(P({ mode: 'sharded', mongos: 1 })).some((w) => /mongos/.test(w))).toBe(true);
    expect(mongodbProfile.validate(P({}))).toEqual([]);
  });
});

describe('Elasticsearch / OpenSearch', () => {
  const P = (o: Partial<EsParams>): EsParams => ({ ...elasticsearchProfile.defaults, ...o });
  it('masters, hot/warm/cold data, ingest and coordinating tiers', () => {
    const g = elasticsearchProfile.generate(P({ warm: 2, cold: 1, ingest: 2, coordinating: 1 }), 'e');
    expect(role(g.nodes, 'master')).toHaveLength(3);
    expect(role(g.nodes, 'data')).toHaveLength(3 + 2 + 1);
    expect(role(g.nodes, 'ingest')).toHaveLength(2);
    expect(role(g.nodes, 'coordinator')).toHaveLength(1);
    expect(leaves(g.nodes).filter((n) => n.data.subtitle === 'warm')).toHaveLength(2);
    expect(g.edges.filter((e) => e.label === 'ILM rollover').length).toBe(2);
  });
  it('OpenSearch swaps the logo', () => {
    expect(leaves(elasticsearchProfile.generate(P({ engine: 'opensearch' }), 'e').nodes)[0].data.iconId).toBe('opensearch');
  });
  it('validate', () => {
    expect(elasticsearchProfile.validate(P({ masters: 2 })).some((w) => /even/i.test(w))).toBe(true);
    expect(elasticsearchProfile.validate(P({ hot: 0 })).some((w) => /no data nodes/i.test(w))).toBe(true);
    expect(elasticsearchProfile.validate(P({ hot: 0, warm: 2 })).some((w) => /hot tier/i.test(w))).toBe(true);
    expect(elasticsearchProfile.validate(P({}))).toEqual([]);
  });
});

describe('ClickHouse', () => {
  const P = (o: Partial<ChParams>): ChParams => ({ ...clickhouseProfile.defaults, ...o });
  it('shards x replicas matrix plus a Keeper quorum', () => {
    const g = clickhouseProfile.generate(P({ shards: 3, replicas: 2, keeper: 5 }), 'c');
    expect(leaves(g.nodes).filter((n) => /^ch-/.test(n.data.label))).toHaveLength(6);
    expect(leaves(g.nodes).filter((n) => /^keeper-/.test(n.data.label))).toHaveLength(5);
    expect(g.nodes.filter((n) => n.type === 'group' && /^Shard/.test(n.data.label))).toHaveLength(3);
    expect(g.edges.filter((e) => e.data?.kind === 'replication')).toHaveLength(3);
  });
  it('validate and summarize', () => {
    expect(clickhouseProfile.validate(P({ replicas: 1 })).some((w) => /no HA/i.test(w))).toBe(true);
    expect(clickhouseProfile.validate(P({}))).toEqual([]);
    expect(clickhouseProfile.summarize(P({}))).toBe('2 shards x 2 replicas · 3 Keeper');
  });
});

describe('RabbitMQ', () => {
  const P = (o: Partial<RabbitParams>): RabbitParams => ({ ...rabbitmqProfile.defaults, ...o });
  it('3 quorum-queue nodes with a leader', () => {
    const g = rabbitmqProfile.generate(P({}), 'r');
    expect(leaves(g.nodes)).toHaveLength(3);
    expect(role(g.nodes, 'leader')).toHaveLength(1);
    expect(rabbitmqProfile.summarize(P({}))).toBe('3 nodes · quorum queues');
  });
  it('validate', () => {
    expect(rabbitmqProfile.validate(P({ nodes: 4 })).some((w) => /even/i.test(w))).toBe(true);
    expect(rabbitmqProfile.validate(P({ quorumQueues: false })).some((w) => /deprecated/i.test(w))).toBe(true);
    expect(rabbitmqProfile.validate(P({}))).toEqual([]);
  });
});

describe('etcd / ZooKeeper / Consul quorum', () => {
  const P = (o: Partial<QuorumParams>): QuorumParams => ({ ...quorumProfile.defaults, ...o });
  it('3/5/7 nodes on a ring with exactly one leader and heartbeats', () => {
    for (const n of [3, 5, 7]) {
      const g = quorumProfile.generate(P({ nodes: n }), 'q');
      expect(leaves(g.nodes)).toHaveLength(n);
      expect(role(g.nodes, 'leader')).toHaveLength(1);
      expect(role(g.nodes, 'follower')).toHaveLength(n - 1);
      expect(g.edges.filter((e) => e.data?.kind === 'heartbeat')).toHaveLength(n - 1);
    }
  });
  it('technology switches ports and logos; Consul clients attach', () => {
    expect(leaves(quorumProfile.generate(P({ tech: 'zookeeper' }), 'q').nodes)[0].data).toMatchObject({ iconId: 'zookeeper', label: 'zookeeper-1 :2181' });
    const c = quorumProfile.generate(P({ tech: 'consul', clients: 2 }), 'q');
    expect(leaves(c.nodes).filter((n) => /^agent-/.test(n.data.label))).toHaveLength(2);
  });
  it('validate and summarize', () => {
    expect(quorumProfile.validate(P({ nodes: 4 as never })).some((w) => /even/i.test(w))).toBe(true);
    expect(quorumProfile.summarize(P({ nodes: 5 }))).toBe('etcd · 5 nodes · quorum 3');
  });
});
