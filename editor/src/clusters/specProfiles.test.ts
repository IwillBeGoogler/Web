import { describe, expect, it } from 'vitest';
import { PROFILES, getProfile } from './profiles';
import type { ClusterProfile, FieldSpec } from './profiles/types';
import { clusterSection } from './palette';
import { searchItems, registerSections } from '../data/catalog';
import { SPEC_PROFILES } from './specs';
import { genericClusterProfile, lbAppTierProfile } from './specs/generic';
import { ancestorsOf } from '../lib/graph';
import type { DiagramNode } from '../types';

type P = Record<string, unknown>;
const spec = SPEC_PROFILES as unknown as ClusterProfile[];
const leaves = (nodes: DiagramNode[]) => nodes.filter((n) => n.type === 'icon');
const g = (id: string, over: P = {}) => { const p = getProfile(id)!; return { p, params: { ...p.defaults, ...over } as P, gen: p.generate({ ...p.defaults, ...over }, 'c') }; };
const warn = (id: string, over: P) => { const p = getProfile(id)!; return p.validate({ ...p.defaults, ...over }); };

/** every single-field variation (min, max, each option, boolean flip) */
function variations(f: FieldSpec): unknown[] {
  if (f.type === 'number') return [f.min, f.max, Math.round((f.min + Math.min(f.max, f.min + 6)) / 2), Math.min(f.max, f.min + 7)];
  if (f.type === 'select') return f.options.map((o) => o.value);
  if (f.type === 'boolean') return [!f.default, f.default];
  return [];
}

describe('spec profiles: every field variation generates a consistent diagram', () => {
  for (const p of spec) {
    it(p.id, () => {
      for (const f of p.fields) {
        for (const v of variations(f)) {
          const params = { ...p.defaults, [f.key]: v } as P;
          expect(p.schema.safeParse(params).success, `${p.id}.${f.key}=${String(v)}`).toBe(true);
          const out = p.generate(params, 'x');
          const ids = out.nodes.map((n) => n.id);
          expect(new Set(ids).size, `${p.id}.${f.key}=${String(v)} unique ids`).toBe(ids.length);
          for (const e of out.edges) {
            expect(ids, `${p.id}.${f.key}=${String(v)} edge ${e.id}`).toContain(e.source);
            expect(ids).toContain(e.target);
            expect(e.source).not.toBe(e.target);
          }
          expect(new Set(out.edges.map((e) => e.id)).size).toBe(out.edges.length);
          for (const n of out.nodes) expect(ancestorsOf(out.nodes, n.id).length).toBeLessThanOrEqual(3); // cluster > group > AZ > member
          expect(Array.isArray(p.validate(params))).toBe(true);
          expect(p.summarize(params).length).toBeGreaterThan(0);
          const dup = new Set<string>();
          for (const e of out.edges) { const k = `${e.source}>${e.target}`; expect(dup.has(k), `${p.id} duplicate edge ${k}`).toBe(false); dup.add(k); }
        }
      }
    });
  }
});

describe('spec profiles: leaf nodes fit their parents and never overlap', () => {
  for (const p of spec) {
    it(p.id, () => {
      const out = p.generate(p.defaults, 'c');
      const byId = new Map(out.nodes.map((n) => [n.id, n]));
      for (const n of out.nodes) {
        if (!n.parentId) continue;
        const par = byId.get(n.parentId)!;
        expect(n.position.x, `${n.id} x`).toBeGreaterThanOrEqual(-1);
        expect(n.position.y, `${n.id} y`).toBeGreaterThanOrEqual(-1);
        expect(n.position.x + (n.width ?? 0), `${n.id} right`).toBeLessThanOrEqual((par.width ?? 0) + 1);
        expect(n.position.y + (n.height ?? 0), `${n.id} bottom`).toBeLessThanOrEqual((par.height ?? 0) + 1);
      }
      const byParent = new Map<string, DiagramNode[]>();
      for (const n of leaves(out.nodes)) byParent.set(n.parentId ?? '', [...(byParent.get(n.parentId ?? '') ?? []), n]);
      for (const list of byParent.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i]; const b = list[j];
        const sep = a.position.x + a.width! <= b.position.x || b.position.x + b.width! <= a.position.x || a.position.y + a.height! <= b.position.y || b.position.y + b.height! <= a.position.y;
        expect(sep, `${p.id}: ${a.id} overlaps ${b.id}`).toBe(true);
      }
    });
  }
});

describe('validation rules', () => {
  it('quorum sizes must be odd (etcd, PD, agents, JournalNodes, ZooKeeper...)', () => {
    expect(warn('tidb', { pd: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number of PD nodes/)]));
    expect(warn('nomad', { servers: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number/)]));
    expect(warn('docker-swarm', { managers: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number/)]));
    expect(warn('kubernetes', { cp: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number/)]));
    expect(warn('hadoop', { journal: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number/)]));
    expect(warn('ceph', { mons: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/Even number/)]));
  });
  it('replication factor vs node count', () => {
    expect(warn('scylladb', { nodes: 3, rf: 5 })).toEqual(expect.arrayContaining([expect.stringMatching(/exceeds the node count/)]));
    expect(warn('qdrant', { nodes: 3, rf: 4 }).length).toBeGreaterThan(0);
    expect(warn('redpanda', { brokers: 3, rf: 5 }).length).toBeGreaterThan(0);
    expect(warn('longhorn', { nodes: 2, replicas: 3 }).length).toBeGreaterThan(0);
    expect(warn('victoriametrics', { storage: 2, rf: 3 }).length).toBeGreaterThan(0);
    expect(warn('ceph', { osds: 3, replicas: 3 })).toEqual([]);
    expect(warn('ceph', { osds: 3, replicas: 4 }).length).toBeGreaterThan(0);
  });
  it('Pulsar E >= Qw >= Qa', () => {
    expect(warn('pulsar', { writeq: 3, ensemble: 2 }).some((w) => /Write quorum/.test(w))).toBe(true);
    expect(warn('pulsar', { ackq: 3, writeq: 2 }).some((w) => /Ack quorum/.test(w))).toBe(true);
    expect(warn('pulsar', { bookies: 1 }).some((w) => /Ensemble/.test(w))).toBe(true);
  });
  it('k3s datastore constraints', () => {
    expect(warn('k3s', { datastore: 'sqlite', servers: 3 }).some((w) => /SQLite/.test(w))).toBe(true);
    expect(warn('k3s', { datastore: 'etcd', servers: 1 }).some((w) => /not HA/.test(w))).toBe(true);
    expect(warn('k3s', { datastore: 'etcd', servers: 3 })).toEqual([]);
  });
  it('MinIO erasure constraints', () => {
    expect(warn('minio', { nodes: 4, drives: 1, parity: 4 }).some((w) => /Parity/.test(w))).toBe(true);
    expect(warn('minio', { nodes: 5, drives: 3 }).some((w) => /Odd total/.test(w))).toBe(true);
  });
  it('warnings are mirrored on the cluster header node', () => {
    const { gen } = g('nomad', { servers: 4 });
    expect((gen.nodes[0].data.warnings ?? []).length).toBeGreaterThan(0);
  });
});

describe('layouts, ports, AZ spread', () => {
  it('default ports appear in member labels', () => {
    const labels = (id: string) => leaves(g(id).gen.nodes).map((n) => n.data.label ?? '');
    expect(labels('nomad').some((l) => l.includes(':4646'))).toBe(true);
    expect(labels('kubernetes').some((l) => l.includes(':6443'))).toBe(true);
    expect(labels('cockroachdb').some((l) => l.includes(':26257'))).toBe(true);
    expect(labels('minio').some((l) => l.includes(':9000'))).toBe(true);
    expect(labels('emqx').some((l) => l.includes(':4370'))).toBe(true);
  });
  it('azs creates AZ sub-groups, members spread round-robin', () => {
    for (const id of ['kubernetes', 'cockroachdb', 'ceph', 'redpanda', 'nats-jetstream', 'vault', 'opensearch']) {
      const { gen } = g(id, { azs: 3 });
      const azGroups = gen.nodes.filter((n) => n.type === 'group' && /^AZ \d$/.test(n.data.label ?? ''));
      expect(azGroups.length, id).toBeGreaterThanOrEqual(3);
    }
  });
  it('memcached / scylladb use a ring; thanos / trino hub-spoke; solr shard matrix has shards x rf', () => {
    const ys = (id: string, over: P = {}) => new Set(leaves(g(id, over).gen.nodes).map((n) => Math.round(n.position.y))).size;
    expect(ys('memcached')).toBeGreaterThan(2);
    const solr = g('solrcloud', { shards: 3, rf: 2 }).gen;
    expect(leaves(solr.nodes).filter((n) => n.id.includes('-r1-') || n.id.includes('-r2-')).length).toBe(6);
    expect(solr.edges.filter((e) => e.data?.kind === 'replication').length).toBe(3);
  });
  it('kubernetes: 3 control-plane + workers across AZs; external etcd adds a group', () => {
    const { gen } = g('kubernetes', { workers: 6, azs: 3 });
    expect(leaves(gen.nodes).filter((n) => n.data.role === 'controller').length).toBe(3);
    expect(leaves(gen.nodes).filter((n) => n.data.role === 'worker').length).toBe(6);
    const ext = g('kubernetes', { etcd: 'external' }).gen;
    expect(ext.nodes.some((n) => n.type === 'group' && /etcd/.test(n.data.label ?? ''))).toBe(true);
    expect(ext.nodes.filter((n) => n.type === 'icon' && n.data.label?.startsWith('etcd')).length).toBe(3);
  });
});

describe('optional sidecars (exporters)', () => {
  const withSidecar = spec.filter((p) => p.fields.some((f) => f.key === 'exporter'));
  it('a good share of profiles offer one, off by default', () => {
    expect(withSidecar.length).toBeGreaterThanOrEqual(15);
    for (const p of withSidecar) expect(p.defaults.exporter).toBe(false);
  });
  it('turning it on adds exactly one exporter node linked by a "scrape" edge', () => {
    for (const p of withSidecar) {
      const off = p.generate(p.defaults, 'c');
      const on = p.generate({ ...p.defaults, exporter: true }, 'c');
      expect(leaves(on.nodes).length, p.id).toBe(leaves(off.nodes).length + 1);
      expect(on.edges.filter((e) => e.label === 'scrape').length, p.id).toBe(1);
    }
  });
});

describe('generic cluster', () => {
  const topos = ['active-active', 'active-passive', 'leader-follower', 'ring', 'shard-matrix', 'mesh', 'hub-spoke'];
  it('every topology generates; roles and node name are free-form', () => {
    for (const t of topos) {
      const out = genericClusterProfile.generate({ ...genericClusterProfile.defaults, topology: t, roleA: 'writer', roleB: 'reader', name: 'srv' }, 'c');
      expect(leaves(out.nodes).length, t).toBeGreaterThan(1);
      expect(out.nodes[0].data.topology, t).toBe(t);
      expect(leaves(out.nodes).some((n) => n.data.role === 'writer'), t).toBe(true);
    }
    const lf = genericClusterProfile.generate({ ...genericClusterProfile.defaults, topology: 'leader-follower', nodes: 4, name: 'db' }, 'c');
    expect(leaves(lf.nodes).map((n) => n.data.label)).toEqual(['db-1', 'db-2', 'db-3', 'db-4']);
    expect(lf.edges).toHaveLength(3);
  });
  it('edge counts per topology', () => {
    const e = (t: string, nodes = 4) => genericClusterProfile.generate({ ...genericClusterProfile.defaults, topology: t, nodes }, 'c').edges.length;
    expect(e('active-active')).toBe(6);
    expect(e('mesh')).toBe(6);
    expect(e('ring')).toBe(4);
    expect(e('hub-spoke')).toBe(3);
    expect(e('active-passive')).toBe(3);
  });
  it('validates role names and ring size', () => {
    expect(genericClusterProfile.validate({ ...genericClusterProfile.defaults, roleA: '' }).length).toBeGreaterThan(0);
    expect(genericClusterProfile.validate({ ...genericClusterProfile.defaults, roleB: 'x'.repeat(30) }).length).toBeGreaterThan(0);
    expect(genericClusterProfile.validate({ ...genericClusterProfile.defaults, topology: 'ring', nodes: 2 }).length).toBeGreaterThan(0);
  });
});

describe('load-balanced app tier', () => {
  it('LB + N instances + autoscaling badge', () => {
    const out = lbAppTierProfile.generate({ ...lbAppTierProfile.defaults, instances: 4, min: 2, max: 8 }, 'c');
    expect(leaves(out.nodes).filter((n) => n.data.label?.startsWith('app')).length).toBe(4);
    const asg = leaves(out.nodes).find((n) => n.data.label === 'autoscaler')!;
    expect(asg.data.subtitle).toMatch(/2-8/);
    expect(out.edges.some((e) => e.label === 'scales')).toBe(true);
    expect(leaves(out.nodes).find((n) => n.id.includes('-lb-'))).toBeTruthy();
  });
  it('autoscaling off: no autoscaler node; range rules', () => {
    const out = lbAppTierProfile.generate({ ...lbAppTierProfile.defaults, autoscaling: false }, 'c');
    expect(leaves(out.nodes).some((n) => n.data.label === 'autoscaler')).toBe(false);
    expect(lbAppTierProfile.validate({ ...lbAppTierProfile.defaults, min: 5, max: 3 }).some((w) => /min is above max/.test(w))).toBe(true);
    expect(lbAppTierProfile.validate({ ...lbAppTierProfile.defaults, instances: 20, max: 10 }).some((w) => /outside the autoscaling range/.test(w))).toBe(true);
  });
  it('LB kind selects the logo', () => {
    const ic = (lb: string) => leaves(lbAppTierProfile.generate({ ...lbAppTierProfile.defaults, lb }, 'c').nodes).find((n) => n.id.includes('-lb-'))!.data.iconId;
    expect([ic('nginx'), ic('haproxy'), ic('envoy')]).toEqual(['nginx', 'haproxy', 'envoy']);
  });
});

describe('palette', () => {
  const section = clusterSection();
  registerSections([section]);
  it('groups profiles by category under "Clusters"', () => {
    expect(section.label).toBe('Clusters');
    expect(section.subs.length).toBeGreaterThanOrEqual(6);
    expect(section.count).toBe(PROFILES.length);
    expect(new Set(section.subs.map((s) => s.label)).size).toBe(section.subs.length);
  });
  it('searchable by tags and aliases', () => {
    const has = (q: string, id: string) => searchItems(q).some((i) => i.profileId === id);
    expect(has('pg cluster', 'postgresql')).toBe(true);
    expect(has('k8s cluster', 'kubernetes')).toBe(true);
    expect(has('galera', 'mariadb')).toBe(true);
    expect(has('vrrp', 'haproxy-keepalived')).toBe(true);
    expect(has('asg', 'lb-app-tier')).toBe(true);
    expect(has('#cluster etcd', 'quorum')).toBe(true);
    expect(has('service mesh', 'istio')).toBe(true);
  });
});
