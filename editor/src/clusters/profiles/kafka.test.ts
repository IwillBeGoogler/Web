import { describe, expect, it } from 'vitest';
import { kafkaProfile, assignPartitions, type KafkaParams } from './kafka';
import { ancestorsOf, sortParentsFirst } from '../../lib/graph';
import { parseDiagram, serializeDiagram } from '../../lib/serialization';
import { createProject } from '../../lib/project';
import { buildSdd, readSdd } from '../../lib/sdd/sdd';
import { regenerateCluster, instantiate } from '../regenerate';
import type { DiagramNode } from '../../types';

const P = (over: Partial<KafkaParams> = {}): KafkaParams => ({ ...kafkaProfile.defaults, ...over });
const gen = (over: Partial<KafkaParams> = {}) => kafkaProfile.generate(P(over), 'k');
const leaves = (nodes: DiagramNode[]) => nodes.filter((n) => n.type === 'icon');
const byRole = (nodes: DiagramNode[], role: string) => leaves(nodes).filter((n) => n.data.role === role);
const brokers = (nodes: DiagramNode[]) => leaves(nodes).filter((n) => /^broker-\d+ :9092$/.test(n.data.label));
const inCluster = (nodes: DiagramNode[], id: string) => ancestorsOf(nodes, id).some((a) => a.id === 'k');

describe('profile contract', () => {
  it('declares id, tech, icon, roles, topologies, defaults and a zod schema', () => {
    expect(kafkaProfile).toMatchObject({ id: 'kafka', tech: 'Kafka', iconId: 'kafka' });
    expect(kafkaProfile.roles).toEqual(expect.arrayContaining(['broker', 'controller', 'leader', 'follower']));
    expect(kafkaProfile.topologies.length).toBeGreaterThan(0);
    expect(kafkaProfile.schema.parse({})).toMatchObject({ mode: 'kraft', brokers: 3, controllers: 3, azs: 1, rf: 3, minIsr: 2 });
    expect(kafkaProfile.schema.safeParse({ brokers: 13 }).success).toBe(false);
    expect(kafkaProfile.schema.safeParse({ brokers: 0 }).success).toBe(false);
    expect(kafkaProfile.schema.safeParse({ mode: 'raft' }).success).toBe(false);
    expect(kafkaProfile.schema.safeParse({ azs: 4 }).success).toBe(false);
  });
});

describe('generate: KRaft', () => {
  it('default: cluster group, controller quorum subgroup and 3 brokers', () => {
    const g = gen();
    expect(g.rootId).toBe('k');
    expect(g.nodes[0]).toMatchObject({ id: 'k', type: 'cluster' });
    expect(g.nodes[0].data).toMatchObject({ label: 'Kafka cluster (KRaft · 3 brokers)', iconId: 'kafka', profileId: 'kafka' });
    expect(g.nodes.filter((n) => n.type === 'cluster')).toHaveLength(1);
    expect(brokers(g.nodes).map((n) => n.data.label)).toEqual(['broker-1 :9092', 'broker-2 :9092', 'broker-3 :9092']);
    const quorum = g.nodes.filter((n) => n.type === 'group');
    expect(quorum).toHaveLength(1);
    expect(quorum[0].data.label).toMatch(/controller/i);
    expect(byRole(g.nodes, 'leader')).toHaveLength(1);
    expect(byRole(g.nodes, 'follower')).toHaveLength(2);
    expect(g.edges.filter((e) => e.data?.kind === 'heartbeat')).toHaveLength(2);
  });
  it('controllers 5 -> 5 controller nodes, 4 heartbeat edges', () => {
    const g = gen({ controllers: 5 });
    expect(byRole(g.nodes, 'leader').length + byRole(g.nodes, 'follower').length).toBe(5);
    expect(g.edges.filter((e) => e.data?.kind === 'heartbeat')).toHaveLength(4);
  });
  it('brokers 1..12 produce that many brokers, all labelled and with the broker role', () => {
    for (const n of [1, 2, 7, 12]) {
      const g = gen({ brokers: n });
      expect(brokers(g.nodes)).toHaveLength(n);
      expect(byRole(g.nodes, 'broker')).toHaveLength(n);
    }
  });
  it('combined mode: no controller subgroup; first N brokers carry the controller role', () => {
    const g = gen({ controllerMode: 'combined', brokers: 5, controllers: 3 });
    expect(g.nodes.filter((n) => n.type === 'group')).toHaveLength(0);
    expect(brokers(g.nodes)).toHaveLength(5);
    expect(byRole(g.nodes, 'broker+controller')).toHaveLength(3);
    expect(byRole(g.nodes, 'broker')).toHaveLength(2);
  });
});

describe('generate: ZooKeeper', () => {
  it('ZooKeeper ensemble subgroup replaces the controller quorum', () => {
    const g = gen({ mode: 'zookeeper', zookeepers: 3 });
    expect(g.nodes[0].data.label).toBe('Kafka cluster (ZooKeeper · 3 brokers)');
    const zk = leaves(g.nodes).filter((n) => /^zk-\d+ :2181$/.test(n.data.label));
    expect(zk).toHaveLength(3);
    expect(zk.filter((n) => n.data.role === 'leader')).toHaveLength(1);
    expect(g.nodes.filter((n) => n.type === 'group').some((n) => /zookeeper/i.test(n.data.label))).toBe(true);
    expect(leaves(g.nodes).some((n) => n.data.label.startsWith('ctrl-'))).toBe(false);
    expect(gen({ mode: 'zookeeper', zookeepers: 5 }).nodes.filter((n) => /^zk-/.test(n.data.label))).toHaveLength(5);
  });
});

describe('generate: AZ / rack distribution', () => {
  it('azs = 1: brokers sit directly in the cluster, no AZ groups', () => {
    const g = gen({ brokers: 6, azs: 1, controllerMode: 'combined' });
    expect(g.nodes.filter((n) => n.type === 'group')).toHaveLength(0);
    expect(brokers(g.nodes).every((b) => b.parentId === 'k')).toBe(true);
  });
  it('azs = 3: round-robin into 3 AZ subgroups', () => {
    const g = gen({ brokers: 6, azs: 3 });
    const azs = g.nodes.filter((n) => n.type === 'group' && /^AZ/.test(n.data.label));
    expect(azs).toHaveLength(3);
    const members = (az: DiagramNode) => brokers(g.nodes).filter((b) => b.parentId === az.id).map((b) => b.data.label);
    expect(azs.map((az) => members(az).length)).toEqual([2, 2, 2]);
    expect(members(azs[0])).toEqual(['broker-1 :9092', 'broker-4 :9092']);
    expect(members(azs[1])).toEqual(['broker-2 :9092', 'broker-5 :9092']);
    expect(members(azs[2])).toEqual(['broker-3 :9092', 'broker-6 :9092']);
  });
  it('uneven spread: 7 brokers over 3 AZs = 3/2/2', () => {
    const g = gen({ brokers: 7, azs: 3 });
    const azs = g.nodes.filter((n) => n.type === 'group' && /^AZ/.test(n.data.label));
    expect(azs.map((az) => brokers(g.nodes).filter((b) => b.parentId === az.id).length)).toEqual([3, 2, 2]);
  });
  it('nesting depth stays within 3 levels (cluster > AZ > broker)', () => {
    const g = gen({ brokers: 6, azs: 3 });
    for (const n of g.nodes) expect(ancestorsOf(g.nodes, n.id).length).toBeLessThanOrEqual(2);
  });
});

describe('generate: optional components live outside the cluster box and are connected with labelled edges', () => {
  const outside = (nodes: DiagramNode[]) => nodes.filter((n) => !n.parentId && n.id !== 'k');
  it('schema registry', () => {
    const g = gen({ schemaRegistry: true });
    const sr = leaves(g.nodes).find((n) => /Schema Registry/.test(n.data.label))!;
    expect(inCluster(g.nodes, sr.id)).toBe(false);
    expect(g.edges.some((e) => e.target.startsWith('k-broker') && e.source === sr.id && e.label === '_schemas topic')).toBe(true);
  });
  it('kafka connect: a cluster of N workers', () => {
    const g = gen({ connect: true, connectWorkers: 3 });
    const connect = g.nodes.find((n) => n.type === 'cluster' && n.id !== 'k')!;
    expect(connect.data.label).toMatch(/Connect/);
    expect(g.nodes.filter((n) => n.parentId === connect.id && n.type === 'icon')).toHaveLength(3);
    expect(g.edges.some((e) => e.label === 'produce/consume')).toBe(true);
  });
  it('ksqlDB, REST proxy, UI, monitoring', () => {
    const g = gen({ ksqldb: true, restProxy: true, ui: true, monitoring: true });
    const labels = leaves(g.nodes).map((n) => n.data.label);
    for (const l of [/ksqlDB/, /REST Proxy/, /Kafka UI/, /JMX exporter/, /Prometheus/]) expect(labels.some((x) => l.test(x)), String(l)).toBe(true);
    expect(g.edges.some((e) => e.label === 'scrape')).toBe(true);
    for (const n of outside(g.nodes)) expect(inCluster(g.nodes, n.id)).toBe(false);
  });
  it('MirrorMaker 2 adds a second cluster (DC2) with a "replicate topics" edge', () => {
    const g = gen({ mirrorMaker: true });
    const clusters = g.nodes.filter((n) => n.type === 'cluster');
    expect(clusters.map((c) => c.data.label)).toEqual(expect.arrayContaining([expect.stringMatching(/DC2/)]));
    expect(leaves(g.nodes).some((n) => /MirrorMaker 2/.test(n.data.label))).toBe(true);
    expect(g.edges.some((e) => e.label === 'replicate topics')).toBe(true);
  });
  it('no optional components by default', () => {
    expect(outside(gen().nodes)).toHaveLength(0);
  });
  it('everything is internally consistent: unique ids, parents first, edge endpoints exist', () => {
    const g = gen({ brokers: 6, azs: 3, schemaRegistry: true, connect: true, ksqldb: true, restProxy: true, mirrorMaker: true, ui: true, monitoring: true });
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sortParentsFirst(g.nodes).map((n) => n.id)).toEqual(ids);
    for (const e of g.edges) {
      expect(ids).toContain(e.source);
      expect(ids).toContain(e.target);
    }
    expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length);
  });
});

describe('summarize and validate', () => {
  it('summarize', () => {
    expect(kafkaProfile.summarize(P({ brokers: 6, azs: 3 }))).toBe('KRaft · 3 controllers · 6 brokers · 3 AZ · RF3 / minISR2');
    expect(kafkaProfile.summarize(P({ mode: 'zookeeper', zookeepers: 5, rf: 2, minIsr: 1 }))).toBe('ZooKeeper · 5 ZK · 3 brokers · 1 AZ · RF2 / minISR1');
    expect(kafkaProfile.summarize(P({ controllerMode: 'combined', brokers: 5 }))).toBe('KRaft · 3 combined controllers · 5 brokers · 1 AZ · RF3 / minISR2');
  });
  it('healthy default has no warnings', () => {
    expect(kafkaProfile.validate(P())).toEqual([]);
  });
  it('rf > brokers', () => expect(kafkaProfile.validate(P({ brokers: 2, rf: 3, minIsr: 2 })).some((w) => /replication factor.*exceeds.*brokers/i.test(w))).toBe(true));
  it('minISR >= rf', () => {
    expect(kafkaProfile.validate(P({ rf: 3, minIsr: 3 })).some((w) => /min\.insync\.replicas/.test(w) && /write/i.test(w))).toBe(true);
    expect(kafkaProfile.validate(P({ rf: 3, minIsr: 2 })).some((w) => /min\.insync\.replicas/.test(w))).toBe(false);
  });
  it('even controller / ZooKeeper counts (quorum) cannot happen via the schema but are warned if present', () => {
    expect(kafkaProfile.validate(P({ controllers: 4 as never })).some((w) => /even/i.test(w))).toBe(true);
    expect(kafkaProfile.validate(P({ mode: 'zookeeper', zookeepers: 4 as never })).some((w) => /even/i.test(w))).toBe(true);
    expect(kafkaProfile.validate(P({ controllers: 5 })).some((w) => /even/i.test(w))).toBe(false);
  });
  it('racks > 1 but rf < racks', () => {
    expect(kafkaProfile.validate(P({ brokers: 6, azs: 3, rf: 2, minIsr: 1 })).some((w) => /rack|AZ/i.test(w) && /replication factor/i.test(w))).toBe(true);
    expect(kafkaProfile.validate(P({ brokers: 6, azs: 3, rf: 3 })).some((w) => /rack/i.test(w))).toBe(false);
  });
  it('single broker, ZooKeeper deprecation', () => {
    expect(kafkaProfile.validate(P({ brokers: 1, rf: 1, minIsr: 1 })).some((w) => /single broker/i.test(w))).toBe(true);
    expect(kafkaProfile.validate(P({ mode: 'zookeeper' })).some((w) => /deprecated/i.test(w) && /4/.test(w))).toBe(true);
  });
  it('warnings are stored on the generated cluster header', () => {
    expect(gen({ brokers: 2, rf: 3 }).nodes[0].data.warnings!.length).toBeGreaterThan(0);
    expect(gen().nodes[0].data.warnings).toEqual([]);
  });
});

describe('partition assignment (deterministic, rack-aware)', () => {
  const bs = (n: number, azs: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i + 1}`, az: i % azs }));
  it('leaders rotate round-robin over brokers and are deterministic', () => {
    const a = assignPartitions({ name: 't', partitions: 6, rf: 3 }, bs(3, 1));
    expect(a.map((p) => p.leader)).toEqual(['b1', 'b2', 'b3', 'b1', 'b2', 'b3']);
    expect(assignPartitions({ name: 't', partitions: 6, rf: 3 }, bs(3, 1))).toEqual(a);
  });
  it('P0 leader on broker-1 with replicas on 2 and 3', () => {
    const [p0] = assignPartitions({ name: 'orders', partitions: 3, rf: 3 }, bs(3, 1));
    expect(p0).toMatchObject({ partition: 0, leader: 'b1', replicas: ['b1', 'b2', 'b3'], isr: ['b1', 'b2', 'b3'] });
  });
  it('rack aware: no two replicas share an AZ when enough AZs exist', () => {
    for (const [n, azs, rf] of [[6, 3, 3], [9, 3, 3], [6, 3, 2], [4, 2, 2]] as const) {
      const bk = bs(n, azs);
      const az = new Map(bk.map((b) => [b.id, b.az]));
      for (const p of assignPartitions({ name: 't', partitions: 12, rf }, bk)) {
        const used = p.replicas.map((r) => az.get(r));
        expect(new Set(used).size, `${n}/${azs}/${rf} p${p.partition}`).toBe(rf);
        expect(new Set(p.replicas).size).toBe(rf);
      }
    }
  });
  it('when AZs < rf it still places rf distinct brokers', () => {
    const bk = bs(6, 2);
    for (const p of assignPartitions({ name: 't', partitions: 6, rf: 3 }, bk)) expect(new Set(p.replicas).size).toBe(3);
  });
  it('rf is capped by the broker count', () => {
    const [p] = assignPartitions({ name: 't', partitions: 1, rf: 5 }, bs(2, 1));
    expect(p.replicas).toHaveLength(2);
  });
  it('showPartitions puts a per-broker strip with leader markers (and is off by default)', () => {
    expect(brokers(gen().nodes).every((b) => !b.data.partitions)).toBe(true);
    const g = gen({ showPartitions: true, topics: [{ name: 'orders', partitions: 3, rf: 3 }] });
    const b1 = brokers(g.nodes)[0];
    expect(b1.data.partitions).toEqual([
      { topic: 'orders', partition: 0, leader: true },
      { topic: 'orders', partition: 1, leader: false },
      { topic: 'orders', partition: 2, leader: false },
    ]);
    // total replica placements = partitions * rf
    const total = brokers(g.nodes).reduce((s, b) => s + (b.data.partitions?.length ?? 0), 0);
    expect(total).toBe(9);
    expect(brokers(g.nodes).reduce((s, b) => s + (b.data.partitions ?? []).filter((p) => p.leader).length, 0)).toBe(3);
  });
});

describe('params persistence and regeneration', () => {
  it('params are stored on the cluster node and survive JSON and .sdd round trips', () => {
    const g = gen({ brokers: 6, azs: 3, topics: [{ name: 'orders', partitions: 6, rf: 3 }] });
    expect(g.nodes[0].data.params).toMatchObject({ brokers: 6, azs: 3 });
    const j = parseDiagram(serializeDiagram({ version: 1, nodes: g.nodes, edges: g.edges }));
    expect(j.ok && j.diagram.nodes[0].data.params).toEqual(g.nodes[0].data.params);
    const p = createProject('k');
    p.pages[0].nodes = g.nodes;
    p.pages[0].edges = g.edges;
    const back = readSdd(buildSdd(p)).project.pages[0];
    expect(back.nodes[0].data.params).toEqual(g.nodes[0].data.params);
    expect(back.nodes.map((n) => n.id)).toEqual(g.nodes.map((n) => n.id));
  });
  it('instantiate places the cluster at a position and offsets outside nodes too', () => {
    const g = instantiate(kafkaProfile, P({ schemaRegistry: true }), 'k', { x: 500, y: 300 });
    expect(g.nodes[0].position).toEqual({ x: 500, y: 300 });
    const sr = g.nodes.find((n) => /Schema Registry/.test(n.data.label))!;
    expect(sr.position.x).toBeGreaterThan(500);
    expect(g.nodes.find((n) => n.id === 'k-broker-1')!.position).not.toEqual({ x: 500, y: 300 }); // children stay relative
  });
  it('regenerate keeps user-moved positions where ids persist and re-lays-out the rest', () => {
    const first = instantiate(kafkaProfile, P({ brokers: 3 }), 'k', { x: 0, y: 0 });
    // user drags broker-2 somewhere else
    const moved = first.nodes.map((n) => (n.id === 'k-broker-2' ? { ...n, position: { x: 777, y: 555 } } : n));
    const out = regenerateCluster(moved, first.edges, 'k', kafkaProfile, P({ brokers: 6 }));
    const ids = out.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['k-broker-4', 'k-broker-5', 'k-broker-6']));
    expect(out.nodes.find((n) => n.id === 'k-broker-2')!.position).toEqual({ x: 777, y: 555 }); // preserved
    const b1New = kafkaProfile.generate(P({ brokers: 6 }), 'k').nodes.find((n) => n.id === 'k-broker-1')!;
    expect(out.nodes.find((n) => n.id === 'k-broker-1')!.position).toEqual(b1New.position); // untouched node follows the new layout
    expect(out.nodes[0].data.params).toMatchObject({ brokers: 6 });
  });
  it('regenerate removes generated nodes that no longer exist but keeps user-added nodes and edges', () => {
    const first = instantiate(kafkaProfile, P({ brokers: 6 }), 'k', { x: 0, y: 0 });
    const mine: DiagramNode = { id: 'mine', type: 'icon', parentId: 'k', position: { x: 10, y: 10 }, data: { label: 'my note', iconId: 'service' } };
    const myEdge = { id: 'my-e', source: 'mine', target: 'k-broker-1' };
    const out = regenerateCluster([...first.nodes, mine], [...first.edges, myEdge], 'k', kafkaProfile, P({ brokers: 3 }));
    const ids = out.nodes.map((n) => n.id);
    expect(ids).not.toContain('k-broker-6');
    expect(ids).toContain('mine');
    expect(out.edges.some((e) => e.id === 'my-e')).toBe(true);
    expect(out.edges.every((e) => ids.includes(e.source) && ids.includes(e.target))).toBe(true);
  });
  it('regenerate keeps collapsed state and lock', () => {
    const first = instantiate(kafkaProfile, P(), 'k', { x: 0, y: 0 });
    const collapsed = first.nodes.map((n) => (n.id === 'k' ? { ...n, data: { ...n.data, collapsed: true } } : n));
    const out = regenerateCluster(collapsed, first.edges, 'k', kafkaProfile, P({ brokers: 4 }));
    expect(out.nodes.find((n) => n.id === 'k')!.data.collapsed).toBe(true);
  });
});
