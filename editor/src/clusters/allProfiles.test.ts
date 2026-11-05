import { describe, expect, it } from 'vitest';
import { PROFILES } from './profiles';
import { categoryOf, clusterSection } from './palette';
import { getIcon, hasIcon } from '../data/icons';
import { ancestorsOf, sortParentsFirst } from '../lib/graph';

const REQUIRED = [
  'mariadb', 'valkey', 'keydb', 'dragonfly', 'memcached', 'scylladb', 'cockroachdb', 'yugabytedb', 'tidb', 'vitess', 'citus', 'neo4j', 'arangodb', 'couchbase', 'couchdb', 'aerospike', 'hazelcast', 'ignite', 'foundationdb', 'singlestore', 'oracle-rac', 'sqlserver-ag',
  'opensearch', 'solrcloud', 'druid', 'pinot', 'starrocks', 'doris', 'trino', 'influxdb', 'timescaledb', 'victoriametrics', 'thanos', 'mimir', 'loki', 'tempo', 'milvus', 'qdrant', 'weaviate',
  'redpanda', 'pulsar', 'nats-jetstream', 'artemis', 'rocketmq', 'emqx', 'kafka-connect', 'flink', 'spark', 'hadoop', 'hbase', 'airflow', 'temporal', 'celery',
  'nomad', 'vault', 'kubernetes', 'k3s', 'docker-swarm', 'ceph', 'minio', 'longhorn', 'haproxy-keepalived', 'istio', 'prometheus-ha', 'alertmanager', 'grafana-ha', 'jenkins', 'gitlab-runner', 'keycloak',
  'generic-cluster', 'lb-app-tier',
];

describe('all registered cluster profiles', () => {
  it('registers every requested technology', () => {
    const ids = PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED) expect(ids, id).toContain(id);
  });

  const section = clusterSection();
  const items = section.subs.flatMap((s) => s.items);
  for (const p of PROFILES) {
    describe(p.id, () => {
      it('generate(defaults) is valid, validate(defaults) has no errors, summarize non-empty', () => {
        const parsed = p.schema.safeParse(p.defaults);
        expect(parsed.success).toBe(true);
        const g = p.generate(p.defaults, 'c');
        const ids = g.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(sortParentsFirst(g.nodes).map((n) => n.id)).toEqual(ids);
        expect(g.nodes[0]).toMatchObject({ id: 'c', type: 'cluster' });
        expect(g.nodes.filter((n) => n.type === 'icon').length).toBeGreaterThan(1);
        for (const e of g.edges) { expect(ids).toContain(e.source); expect(ids).toContain(e.target); }
        expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length);
        for (const n of g.nodes) {
          expect(ancestorsOf(g.nodes, n.id).length).toBeLessThanOrEqual(2);
          if (n.type === 'icon') {
            expect(n.data.iconId, n.id).toBeTruthy();
            expect(hasIcon(n.data.iconId!), `${p.id}:${n.id}:${n.data.iconId}`).toBe(true);
          }
        }
        expect(Array.isArray(p.validate(p.defaults))).toBe(true);
        // new (spec) profiles ship warning-free defaults; the older hand-written ones may carry advisory notes (e.g. single DC)
        if ((p as { category?: string }).category) expect(p.validate(p.defaults), `${p.id} default warnings`).toEqual([]);
        expect(p.summarize(p.defaults).trim().length).toBeGreaterThan(0);
        expect(g.nodes[0].data.warnings).toEqual(p.validate(p.defaults));
      });
      it('palette entry under "Clusters" > category with a real (non-badge) logo', () => {
        const item = items.find((i) => i.profileId === p.id);
        expect(item, 'palette item').toBeTruthy();
        expect(item!.kind).toBe('cluster');
        expect(item!.tags).toContain('cluster');
        const sub = section.subs.find((s) => s.items.includes(item!))!;
        expect(sub.label).toBe(categoryOf(p));
        expect(hasIcon(p.iconId), `icon ${p.iconId}`).toBe(true);
        const def = getIcon(p.iconId);
        expect(['brand', 'generic', 'pending']).toContain(def.kind);
      });
    });
  }
});
