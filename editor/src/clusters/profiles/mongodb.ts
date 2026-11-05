import { ClusterBuilder } from '../builder';
import { shardMatrix } from '../layout';
import { boxFor, CELL_H, CELL_W, GROUP_HEAD, GROUP_PAD, HEADER_H, NODE_H, NODE_W, odd, PAD, plural, rowX } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface MongoParams extends Record<string, unknown> {
  mode: 'replica-set' | 'sharded';
  members: number;
  arbiter: boolean;
  shards: number;
  shardMembers: number;
  mongos: number;
  configMembers: number;
}
const fields: FieldSpec[] = [
  { key: 'mode', type: 'select', label: 'Deployment', default: 'replica-set', options: [{ value: 'replica-set', label: 'Replica set' }, { value: 'sharded', label: 'Sharded cluster' }] },
  { key: 'members', type: 'number', label: 'Data-bearing members', min: 1, max: 7, default: 3, showIf: (p) => p.mode === 'replica-set' },
  { key: 'arbiter', type: 'boolean', label: 'Arbiter instead of the last secondary (P-S-A)', default: false, showIf: (p) => p.mode === 'replica-set' },
  { key: 'shards', type: 'number', label: 'Shards', min: 2, max: 6, default: 2, showIf: (p) => p.mode === 'sharded' },
  { key: 'shardMembers', type: 'number', label: 'Members per shard replica set', min: 1, max: 5, default: 3, showIf: (p) => p.mode === 'sharded' },
  { key: 'mongos', type: 'number', label: 'mongos routers', min: 1, max: 4, default: 2, showIf: (p) => p.mode === 'sharded' },
  { key: 'configMembers', type: 'number', label: 'Config server replica set', min: 1, max: 5, default: 3, showIf: (p) => p.mode === 'sharded' },
];
const { schema, defaults } = defineParams<MongoParams>(fields);
const dataMembers = (p: MongoParams) => (p.arbiter ? Math.max(1, p.members - 1) : p.members);
const voting = (p: MongoParams) => (p.mode === 'replica-set' ? dataMembers(p) + (p.arbiter ? 1 : 0) : p.shardMembers);

const summarize = (p: MongoParams) =>
  p.mode === 'replica-set'
    ? `Replica set · ${p.arbiter ? `P-S-A · ${plural(dataMembers(p), 'data member')} + arbiter` : `${plural(p.members, 'member')}`}`
    : `Sharded · ${plural(p.shards, 'shard')} x ${p.shardMembers} · ${p.configMembers} config · ${p.mongos} mongos`;
function validate(p: MongoParams): string[] {
  const w: string[] = [];
  const v = voting(p);
  if (v > 1 && !odd(v)) w.push(`Even number of voting members (${v}): add an arbiter or another member for a clean majority.`);
  if (p.mode === 'replica-set' && p.members < 3 && !p.arbiter) w.push('Fewer than 3 members: no automatic failover with majority writes.');
  if (p.arbiter) w.push('Arbiter in a P-S-A set: majority write concern stalls when a data member is down; avoid for critical data.');
  if (p.mode === 'sharded') {
    if (p.configMembers < 3) w.push('Config server replica set should have 3 members in production.');
    if (p.shardMembers < 3) w.push('Each shard should be a 3-member replica set in production.');
    if (p.mongos < 2) w.push('A single mongos is a single point of failure for client routing.');
  }
  return w;
}
function generate(p: MongoParams, prefix: string) {
  const b = new ClusterBuilder(prefix, { label: p.mode === 'replica-set' ? 'MongoDB replica set' : 'MongoDB sharded cluster', subtitle: summarize(p), iconId: 'mongodb', accent: '#13aa52', profileId: 'mongodb', params: p, warnings: validate(p), topology: p.mode === 'sharded' ? 'sharded' : 'single-primary' });
  if (p.mode === 'replica-set') {
    const n = p.members;
    const cols = Math.min(n, 4);
    const box = boxFor(cols, Math.ceil(n / 4));
    const size = { width: box.width + PAD * 2, height: HEADER_H + PAD + box.height + PAD };
    b.begin(size);
    b.group('', 'rs', 'rs0', { x: PAD, y: HEADER_H + PAD }, box, { stroke: '#13aa52' });
    for (let i = 0; i < n; i++) {
      const arb = p.arbiter && i === n - 1;
      b.member('rs', `mongo-${i + 1}`, `${arb ? 'arbiter' : 'mongod'}-${i + 1} :27017`, { x: rowX(i % 4, cols, box.width), y: GROUP_HEAD + Math.floor(i / 4) * CELL_H }, { iconId: 'mongodb', role: arb ? 'arbiter' : i === 0 ? 'primary' : 'replica' });
      // same-row neighbours get side ports / a fan-out underneath (see ClusterBuilder.done)
      if (i > 0) b.edge('mongo-1', `mongo-${i + 1}`, { sourceHandle: 'bottom', targetHandle: 'top', data: arb ? { kind: 'heartbeat' } : { kind: 'replication', replMode: 'async' } });
    }
    return b.done(size);
  }
  // sharded: mongos on top, config RS, then shard matrix (shards = columns, replicas = rows)
  const matrix = shardMatrix(p.shards, p.shardMembers, CELL_W, CELL_H);
  const shardW = CELL_W + GROUP_PAD * 2;
  const shardH = GROUP_HEAD + p.shardMembers * CELL_H + GROUP_PAD - 20;
  const cfgBox = boxFor(Math.min(p.configMembers, 5), 1);
  const topW = Math.max(p.mongos * CELL_W, cfgBox.width);
  const innerW = Math.max(p.shards * (shardW + 14), topW);
  const mongosY = HEADER_H + PAD;
  const cfgY = mongosY + NODE_H + PAD + 10;
  const shardY = cfgY + cfgBox.height + PAD;
  const size = { width: innerW + PAD * 2, height: shardY + shardH + PAD };
  b.begin(size);
  for (let i = 0; i < p.mongos; i++) b.member('', `mongos-${i + 1}`, `mongos-${i + 1} :27017`, { x: PAD + (innerW - p.mongos * CELL_W) / 2 + i * CELL_W + (CELL_W - NODE_W) / 2, y: mongosY }, { iconId: 'mongodb', role: 'coordinator' });
  b.group('', 'cfg', `Config servers (${p.configMembers})`, { x: PAD + (innerW - cfgBox.width) / 2, y: cfgY }, cfgBox, { stroke: '#8a93a3' });
  for (let i = 0; i < p.configMembers; i++) b.member('cfg', `cfg-${i + 1}`, `cfg-${i + 1}`, { x: rowX(i, p.configMembers, cfgBox.width), y: GROUP_HEAD }, { iconId: 'mongodb', role: i === 0 ? 'primary' : 'replica' });
  for (let s = 0; s < p.shards; s++) {
    const gx = PAD + s * (shardW + 14);
    b.group('', `shard-${s + 1}`, `Shard ${s + 1}`, { x: gx, y: shardY }, { width: shardW, height: shardH }, { stroke: '#13aa52' });
    for (let r = 0; r < p.shardMembers; r++) {
      const m = matrix[s * p.shardMembers + r];
      b.member(`shard-${s + 1}`, `s${s + 1}-m${r + 1}`, `shard${s + 1}-${r + 1}`, { x: GROUP_PAD + (CELL_W - NODE_W) / 2 - (m.x - s * CELL_W), y: GROUP_HEAD + m.y }, { iconId: 'mongodb', role: r === 0 ? 'primary' : 'replica' });
      if (r > 0) b.edge(`s${s + 1}-m1`, `s${s + 1}-m${r + 1}`, { sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
    }
    b.edge('mongos-1', `s${s + 1}-m1`, { label: 'route', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'sharding' } });
  }
  b.edge('mongos-1', 'cfg-1', { label: 'metadata', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'sharding' } });
  return b.done(size);
}
export const mongodbProfile: ClusterProfile<MongoParams> = { id: 'mongodb', tech: 'MongoDB', label: 'MongoDB (replica set / sharded)', iconId: 'mongodb', accent: '#13aa52', roles: ['primary', 'replica', 'arbiter', 'coordinator'], topologies: ['single-primary', 'sharded'], fields, schema, defaults, generate, validate, summarize };
