import { ClusterBuilder, HEADER_H, NODE_H, NODE_W, PAD } from '../builder';
import { gridLayout, gridSize } from '../layout';
import { defineParams, type ClusterProfile, type FieldSpec, type Generated, type Topic } from './types';

export interface KafkaParams extends Record<string, unknown> {
  mode: 'kraft' | 'zookeeper';
  brokers: number;
  controllerMode: 'dedicated' | 'combined';
  controllers: number;
  zookeepers: number;
  azs: number;
  rf: number;
  minIsr: number;
  schemaRegistry: boolean;
  connect: boolean;
  connectWorkers: number;
  ksqldb: boolean;
  restProxy: boolean;
  mirrorMaker: boolean;
  ui: boolean;
  monitoring: boolean;
  topics: Topic[];
  showPartitions: boolean;
}

const isKraft = (p: Record<string, unknown>) => p.mode !== 'zookeeper';
const fields: FieldSpec[] = [
  { key: 'mode', type: 'select', label: 'Metadata mode', default: 'kraft', options: [{ value: 'kraft', label: 'KRaft' }, { value: 'zookeeper', label: 'ZooKeeper (deprecated)' }] },
  { key: 'brokers', type: 'number', label: 'Brokers', min: 1, max: 12, default: 3 },
  { key: 'controllerMode', type: 'select', label: 'Controllers', default: 'dedicated', options: [{ value: 'dedicated', label: 'Dedicated' }, { value: 'combined', label: 'Combined with brokers' }], showIf: isKraft },
  { key: 'controllers', type: 'select', label: 'Controller quorum size', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }], showIf: isKraft },
  { key: 'zookeepers', type: 'select', label: 'ZooKeeper ensemble size', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }], showIf: (p) => !isKraft(p) },
  { key: 'azs', type: 'number', label: 'Racks / AZs', min: 1, max: 3, default: 1 },
  { key: 'rf', type: 'number', label: 'Replication factor', min: 1, max: 12, default: 3 },
  { key: 'minIsr', type: 'number', label: 'min.insync.replicas', min: 1, max: 12, default: 2 },
  { key: 'schemaRegistry', type: 'boolean', label: 'Schema Registry', default: false },
  { key: 'connect', type: 'boolean', label: 'Kafka Connect', default: false },
  { key: 'connectWorkers', type: 'number', label: 'Connect workers', min: 1, max: 8, default: 2, showIf: (p) => !!p.connect },
  { key: 'ksqldb', type: 'boolean', label: 'ksqlDB', default: false },
  { key: 'restProxy', type: 'boolean', label: 'REST Proxy', default: false },
  { key: 'mirrorMaker', type: 'boolean', label: 'MirrorMaker 2 (second DC)', default: false },
  { key: 'ui', type: 'boolean', label: 'Kafka UI / AKHQ', default: false },
  { key: 'monitoring', type: 'boolean', label: 'Monitoring (JMX exporter + Prometheus)', default: false },
  { key: 'topics', type: 'topics', label: 'Topics', default: [{ name: 'orders', partitions: 3, rf: 3 }] },
  { key: 'showPartitions', type: 'boolean', label: 'Show partitions', default: false },
];
const { schema, defaults } = defineParams<KafkaParams>(fields);

export interface PartitionAssignment {
  partition: number;
  leader: string;
  replicas: string[];
  isr: string[];
}

/** Deterministic round-robin leaders; replicas follow the ring preferring distinct AZs (rack-aware). */
export function assignPartitions(topic: Topic, brokers: { id: string; az: number }[]): PartitionAssignment[] {
  const n = brokers.length;
  const rf = Math.min(topic.rf, n);
  return Array.from({ length: topic.partitions }, (_, p) => {
    const order = Array.from({ length: n }, (_, i) => brokers[(p + i) % n]);
    const chosen = [order[0]];
    const used = new Set([order[0].az]);
    for (const b of order.slice(1)) if (chosen.length < rf && !used.has(b.az)) (chosen.push(b), used.add(b.az));
    for (const b of order.slice(1)) if (chosen.length < rf && !chosen.includes(b)) chosen.push(b);
    const ids = chosen.map((b) => b.id);
    return { partition: p, leader: ids[0], replicas: ids, isr: [...ids] };
  });
}

const CELL_W = NODE_W + 24;
const GROUP_PAD = 18;
const GROUP_HEAD = 34;

function summarize(p: KafkaParams): string {
  const meta = p.mode === 'zookeeper' ? `${p.zookeepers} ZK` : p.controllerMode === 'combined' ? `${Math.min(p.controllers, p.brokers)} combined controllers` : `${p.controllers} controllers`;
  return `${p.mode === 'zookeeper' ? 'ZooKeeper' : 'KRaft'} · ${meta} · ${p.brokers} brokers · ${p.azs} AZ · RF${p.rf} / minISR${p.minIsr}`;
}

function validate(p: KafkaParams): string[] {
  const w: string[] = [];
  if (p.rf > p.brokers) w.push(`Replication factor (${p.rf}) exceeds the number of brokers (${p.brokers}): topics with this factor cannot be created.`);
  if (p.minIsr >= p.rf) w.push(`min.insync.replicas (${p.minIsr}) >= replication factor (${p.rf}): one broker failure blocks writes with acks=all (no write availability).`);
  const quorum = p.mode === 'zookeeper' ? p.zookeepers : p.controllerMode === 'dedicated' ? p.controllers : 0;
  if (quorum && quorum % 2 === 0) w.push(`Even number of ${p.mode === 'zookeeper' ? 'ZooKeeper nodes' : 'controllers'} (${quorum}): tolerates no more failures than ${quorum - 1}; use an odd number for quorum.`);
  if (p.azs > 1 && p.rf < p.azs) w.push(`Rack awareness: replication factor (${p.rf}) is lower than the number of AZs (${p.azs}); some AZs hold no replica of a partition.`);
  if (p.brokers === 1) w.push('Single broker: no fault tolerance, not suitable for production.');
  if (p.mode === 'zookeeper') w.push('ZooKeeper mode is deprecated and removed in Kafka 4.x; plan a migration to KRaft.');
  if (p.mode === 'kraft' && p.controllerMode === 'combined' && p.brokers < 3) w.push('Combined controller mode with fewer than 3 nodes has no quorum fault tolerance.');
  return w;
}

function brokerMeta(p: KafkaParams) {
  return Array.from({ length: p.brokers }, (_, i) => ({ id: `broker-${i + 1}`, az: i % p.azs }));
}

function generate(p: KafkaParams, prefix: string): Generated {
  const warnings = validate(p);
  const strip = p.showPartitions ? 34 : 0;
  const cellH = NODE_H + 26 + strip;
  const b = new ClusterBuilder(prefix, {
    label: `Kafka cluster (${p.mode === 'zookeeper' ? 'ZooKeeper' : 'KRaft'} · ${p.brokers} broker${p.brokers === 1 ? '' : 's'})`,
    subtitle: summarize(p),
    iconId: 'kafka', accent: '#4b5563', profileId: 'kafka', params: p, warnings, topology: 'quorum',
  });

  // ----- layout the sections inside the cluster box -----
  const quorumN = p.mode === 'zookeeper' ? p.zookeepers : p.controllerMode === 'dedicated' ? p.controllers : 0;
  const quorumW = quorumN ? quorumN * CELL_W + GROUP_PAD * 2 - 24 + 24 : 0;
  const quorumH = quorumN ? GROUP_HEAD + NODE_H + GROUP_PAD + 8 : 0;
  let y = HEADER_H + PAD;
  const sections: { w: number; h: number }[] = [];
  const members: { key: string; label: string; az: number; data: Record<string, unknown> }[] = [];
  const meta = brokerMeta(p);
  const partsByBroker = new Map<string, { topic: string; partition: number; leader: boolean }[]>();
  if (p.showPartitions)
    for (const t of p.topics) for (const a of assignPartitions(t, meta)) for (const r of a.replicas) {
      const l = partsByBroker.get(r) ?? [];
      l.push({ topic: t.name, partition: a.partition, leader: a.leader === r });
      partsByBroker.set(r, l);
    }
  for (const m of meta) {
    const idx = Number(m.id.split('-')[1]);
    const ctrl = p.mode === 'kraft' && p.controllerMode === 'combined' && idx <= Math.min(p.controllers, p.brokers);
    members.push({
      key: m.id, label: `${m.id} :9092`, az: m.az,
      data: { iconId: 'kafka', role: ctrl ? 'broker+controller' : 'broker', ...(partsByBroker.get(m.id)?.length ? { partitions: partsByBroker.get(m.id) } : {}) },
    });
  }

  const quorumAt = { x: PAD, y };
  if (quorumN) {
    sections.push({ w: quorumW, h: quorumH });
    y += quorumH + PAD;
  }
  const brokerOrigin = { x: PAD, y };
  const out: { w: number; h: number } = { w: 0, h: 0 };
  const azGroups: { j: number; keys: string[]; at: { x: number; y: number }; size: { width: number; height: number } }[] = [];
  const placed = new Map<string, { parent: string; at: { x: number; y: number } }>();
  if (p.azs === 1) {
    const cols = Math.min(members.length, 4);
    const pos = gridLayout(members.length, cols, CELL_W, cellH, brokerOrigin);
    members.forEach((m, i) => placed.set(m.key, { parent: '', at: { x: pos[i].x + (CELL_W - NODE_W) / 2, y: pos[i].y } }));
    const gs = gridSize(members.length, cols, CELL_W, cellH);
    out.w = gs.width;
    out.h = gs.height;
  } else {
    let x = brokerOrigin.x;
    let tallest = 0;
    for (let j = 0; j < p.azs; j++) {
      const inAz = members.filter((m) => m.az === j);
      const cols = Math.min(inAz.length, 2);
      const gs = gridSize(inAz.length, cols, CELL_W, cellH);
      const size = { width: gs.width + GROUP_PAD * 2 - 24 + 24, height: GROUP_HEAD + gs.height + GROUP_PAD };
      azGroups.push({ j, keys: inAz.map((m) => m.key), at: { x, y: brokerOrigin.y }, size });
      const pos = gridLayout(inAz.length, cols, CELL_W, cellH, { x: GROUP_PAD, y: GROUP_HEAD });
      inAz.forEach((m, i) => placed.set(m.key, { parent: `az-${j + 1}`, at: { x: pos[i].x + (CELL_W - NODE_W) / 2, y: pos[i].y } }));
      x += size.width + PAD;
      tallest = Math.max(tallest, size.height);
    }
    out.w = x - PAD - brokerOrigin.x;
    out.h = tallest;
  }
  sections.push({ w: out.w, h: out.h });
  const innerW = Math.max(...sections.map((s) => s.w));
  const size = { width: innerW + PAD * 2, height: brokerOrigin.y + out.h + PAD };

  b.begin(size);
  // quorum / ensemble subgroup + members
  if (quorumN) {
    const isZk = p.mode === 'zookeeper';
    const gk = isZk ? 'zkens' : 'quorum';
    b.group('', gk, isZk ? `ZooKeeper ensemble (${quorumN})` : `Controller quorum (${quorumN})`, quorumAt, { width: quorumW, height: quorumH }, { stroke: '#4b5563' });
    for (let i = 0; i < quorumN; i++) {
      const key = `${isZk ? 'zk' : 'ctrl'}-${i + 1}`;
      b.member(gk, key, `${key} :${isZk ? 2181 : 9093}`, { x: GROUP_PAD - 12 + i * CELL_W + (CELL_W - NODE_W) / 2 + 6, y: GROUP_HEAD }, { iconId: isZk ? 'zookeeper' : 'kafka', role: i === 0 ? 'leader' : 'follower' });
      if (i > 0) b.edge(`${isZk ? 'zk' : 'ctrl'}-${i}`, key, { data: { kind: 'heartbeat' } });
    }
  }
  for (const g of azGroups) b.group('', `az-${g.j + 1}`, `AZ ${g.j + 1}`, g.at, g.size, { stroke: '#4b5563' });
  for (const m of members) {
    const pl = placed.get(m.key)!;
    b.member(pl.parent === '' ? '' : pl.parent, m.key, m.label, pl.at, m.data as { iconId: string });
  }
  // metadata edges: quorum leader -> first broker of each AZ
  if (quorumN) {
    const lead = p.mode === 'zookeeper' ? 'zk-1' : 'ctrl-1';
    const firsts = p.azs === 1 ? [members[0]] : azGroups.map((g) => members.find((m) => m.key === g.keys[0])).filter(Boolean) as typeof members;
    for (const m of firsts) b.edge(lead, m.key, { label: 'metadata', sourceHandle: 'bottom', targetHandle: 'top', data: { color: '#8a93a3' } });
  }

  // ----- optional components outside the cluster box -----
  let ey = 0;
  const ex = size.width + 140;
  const ext = (key: string, label: string, iconId: string, to: string, edgeLabel: string, both = false, sub?: string) => {
    b.member(null, key, label, { x: ex, y: ey }, { iconId, ...(sub ? { subtitle: sub } : {}) });
    b.edge(key, to, { label: edgeLabel, sourceHandle: 'left', targetHandle: 'right', data: both ? { arrows: 'both' } : {} });
    ey += NODE_H + 40;
  };
  if (p.schemaRegistry) ext('sr', 'Schema Registry :8081', 'schema-registry', 'broker-1', '_schemas topic');
  if (p.ksqldb) ext('ksql', 'ksqlDB :8088', 'kafka', 'broker-1', 'queries', true);
  if (p.restProxy) ext('rest', 'REST Proxy :8082', 'rest', 'broker-1', 'HTTP ↔ Kafka');
  if (p.ui) ext('ui', 'Kafka UI :8080', 'kafka-ui', 'broker-1', 'admin');
  if (p.connect) {
    const cols = Math.min(p.connectWorkers, 2);
    const gs = gridSize(p.connectWorkers, cols, CELL_W, NODE_H + 20);
    const w = gs.width + PAD * 2;
    const h = HEADER_H + gs.height + PAD;
    b.nodes.push({
      id: b.id('connect'), type: 'cluster', position: { x: ex, y: ey }, width: w, height: h, style: { width: w, height: h },
      data: { label: `Kafka Connect cluster (${p.connectWorkers} worker${p.connectWorkers === 1 ? '' : 's'})`, iconId: 'kafka-connect', accent: '#4b5563', genPos: { x: ex, y: ey } },
    });
    const pos = gridLayout(p.connectWorkers, cols, CELL_W, NODE_H + 20, { x: PAD, y: HEADER_H });
    pos.forEach((q, i) => b.member('connect', `connect-w${i + 1}`, `connect-${i + 1} :8083`, { x: q.x + (CELL_W - NODE_W) / 2, y: q.y }, { iconId: 'kafka-connect', role: 'worker' }));
    b.edge('connect-w1', 'broker-1', { label: 'produce/consume', sourceHandle: 'left', targetHandle: 'right', data: { arrows: 'both' } });
    ey += h + 40;
  }
  if (p.monitoring) {
    b.member(null, 'jmx', 'JMX exporter :9404', { x: ex, y: ey }, { iconId: 'exporter' });
    b.member(null, 'prom', 'Prometheus :9090', { x: ex + 180, y: ey }, { iconId: 'prometheus' });
    b.edge('jmx', 'broker-1', { label: 'JMX', sourceHandle: 'left', targetHandle: 'right' });
    b.edge('prom', 'jmx', { label: 'scrape', sourceHandle: 'left', targetHandle: 'right' });
    ey += NODE_H + 40;
  }
  if (p.mirrorMaker) {
    const dcN = Math.min(3, p.brokers);
    const gs = gridSize(dcN, 3, CELL_W, NODE_H + 20);
    const w = gs.width + PAD * 2;
    const h = HEADER_H + gs.height + PAD;
    const my = size.height + 90;
    b.member(null, 'mm2', 'MirrorMaker 2', { x: size.width / 2 - NODE_W / 2, y: my }, { iconId: 'kafka' });
    const dx = size.width + 140;
    b.nodes.push({
      id: b.id('dc2'), type: 'cluster', position: { x: dx, y: my - 20 }, width: w, height: h, style: { width: w, height: h },
      data: { label: `Kafka cluster (DC2 · ${dcN} brokers)`, iconId: 'kafka', accent: '#4b5563', genPos: { x: dx, y: my - 20 } },
    });
    gridLayout(dcN, 3, CELL_W, NODE_H + 20, { x: PAD, y: HEADER_H }).forEach((q, i) => b.member('dc2', `dc2-broker-${i + 1}`, `broker-${i + 1} :9092`, { x: q.x + (CELL_W - NODE_W) / 2, y: q.y }, { iconId: 'kafka', role: 'broker' }));
    b.edge('', 'mm2', { label: 'consume', sourceHandle: 'bottom', targetHandle: 'top' });
    b.edge('mm2', 'dc2', { label: 'replicate topics', sourceHandle: 'right', targetHandle: 'left' });
  }
  return b.done(size);
}

export const kafkaProfile: ClusterProfile<KafkaParams> = {
  id: 'kafka',
  tech: 'Kafka',
  label: 'Apache Kafka cluster',
  iconId: 'kafka',
  accent: '#4b5563',
  roles: ['broker', 'controller', 'broker+controller', 'leader', 'follower', 'worker'],
  topologies: ['quorum', 'multi-primary'],
  fields,
  schema,
  defaults,
  generate,
  validate,
  summarize,
};
