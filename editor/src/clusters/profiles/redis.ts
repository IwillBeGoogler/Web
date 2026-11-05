import { ClusterBuilder } from '../builder';
import { tieredLayout } from '../layout';
import { CELL_H, CELL_W, HEADER_H, NODE_H, NODE_W, odd, PAD, plural } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface RedisParams extends Record<string, unknown> {
  mode: 'sentinel' | 'cluster';
  replicas: number;
  sentinels: number;
  masters: number;
  replicasPerMaster: number;
}
const fields: FieldSpec[] = [
  { key: 'mode', type: 'select', label: 'Mode', default: 'sentinel', options: [{ value: 'sentinel', label: 'Sentinel (HA)' }, { value: 'cluster', label: 'Redis Cluster (sharded)' }] },
  { key: 'replicas', type: 'number', label: 'Replicas', min: 0, max: 5, default: 2, showIf: (p) => p.mode === 'sentinel' },
  { key: 'sentinels', type: 'number', label: 'Sentinels', min: 1, max: 7, default: 3, showIf: (p) => p.mode === 'sentinel' },
  { key: 'masters', type: 'number', label: 'Masters', min: 3, max: 8, default: 3, showIf: (p) => p.mode === 'cluster' },
  { key: 'replicasPerMaster', type: 'number', label: 'Replicas per master', min: 0, max: 3, default: 1, showIf: (p) => p.mode === 'cluster' },
];
const { schema, defaults } = defineParams<RedisParams>(fields);

export const HASH_SLOTS = 16384;
/** Even hash-slot split like redis-cli --cluster create: 3 masters -> 0-5460, 5461-10922, 10923-16383. */
export function slotRanges(masters: number): { from: number; to: number }[] {
  const bound = (i: number) => (i >= masters ? HASH_SLOTS : Math.round((i * HASH_SLOTS) / masters));
  return Array.from({ length: masters }, (_, i) => ({ from: bound(i), to: bound(i + 1) - 1 }));
}

const summarize = (p: RedisParams) =>
  p.mode === 'sentinel' ? `Sentinel · 1 master + ${plural(p.replicas, 'replica')} · ${plural(p.sentinels, 'sentinel')}` : `Cluster · ${p.masters} masters x ${1 + p.replicasPerMaster} · ${HASH_SLOTS} slots`;
function validate(p: RedisParams): string[] {
  const w: string[] = [];
  if (p.mode === 'sentinel') {
    if (p.sentinels < 3) w.push('Fewer than 3 sentinels: no reliable quorum for failover.');
    if (p.sentinels > 1 && !odd(p.sentinels)) w.push(`Even number of sentinels (${p.sentinels}): use an odd number so a majority exists.`);
    if (p.replicas === 0) w.push('No replicas: sentinels have nothing to promote.');
  } else {
    if (p.replicasPerMaster === 0) w.push('Cluster without replicas: losing a master loses its hash slots (no failover).');
    if (p.masters < 3) w.push('Redis Cluster needs at least 3 masters.');
  }
  return w;
}
function generate(p: RedisParams, prefix: string) {
  const b = new ClusterBuilder(prefix, { label: p.mode === 'cluster' ? 'Redis Cluster' : 'Redis Sentinel', subtitle: summarize(p), iconId: 'redis', accent: '#d82c20', profileId: 'redis', params: p, warnings: validate(p), topology: p.mode === 'cluster' ? 'sharded' : 'single-primary' });
  if (p.mode === 'sentinel') {
    const tiers = tieredLayout([p.sentinels, 1 + p.replicas], CELL_W, CELL_H + 10, 10);
    const innerW = Math.max(p.sentinels, 1 + p.replicas) * CELL_W;
    const size = { width: innerW + PAD * 2, height: HEADER_H + PAD + 2 * (CELL_H + 10) + PAD };
    b.begin(size);
    tiers[0].forEach((t, i) => b.member('', `sentinel-${i + 1}`, `sentinel-${i + 1} :26379`, { x: PAD + t.x + (CELL_W - NODE_W) / 2, y: HEADER_H + PAD + t.y }, { iconId: 'redis', role: 'sentinel' }));
    tiers[1].forEach((t, i) => {
      b.member('', i === 0 ? 'master' : `replica-${i}`, i === 0 ? 'master :6379' : `replica-${i} :6379`, { x: PAD + t.x + (CELL_W - NODE_W) / 2, y: HEADER_H + PAD + t.y }, { iconId: 'redis', role: i === 0 ? 'master' : 'replica' });
      if (i > 0) b.edge('master', `replica-${i}`, { label: 'async', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
    });
    for (let i = 0; i < p.sentinels; i++) if (i > 0) b.edge(`sentinel-${i}`, `sentinel-${i + 1}`, { data: { kind: 'heartbeat' } });
    b.edge('sentinel-1', 'master', { label: 'monitor', sourceHandle: 'bottom', targetHandle: 'top', data: { color: '#8a93a3' } });
    return b.done(size);
  }
  const ranges = slotRanges(p.masters);
  const tiers = tieredLayout([p.masters, ...Array.from({ length: p.replicasPerMaster }, () => p.masters)], CELL_W, CELL_H + 10, 0);
  const size = { width: p.masters * CELL_W + PAD * 2, height: HEADER_H + PAD + (1 + p.replicasPerMaster) * (CELL_H + 10) + PAD };
  b.begin(size);
  ranges.forEach((r, i) => b.member('', `master-${i + 1}`, `master-${i + 1}`, { x: PAD + tiers[0][i].x + (CELL_W - NODE_W) / 2, y: HEADER_H + PAD }, { iconId: 'redis', role: 'master', subtitle: `slots ${r.from}-${r.to}` }));
  for (let rr = 0; rr < p.replicasPerMaster; rr++)
    for (let i = 0; i < p.masters; i++) {
      const key = `replica-${i + 1}-${rr + 1}`;
      b.member('', key, `replica-${i + 1}${p.replicasPerMaster > 1 ? `.${rr + 1}` : ''}`, { x: PAD + tiers[rr + 1][i].x + (CELL_W - NODE_W) / 2, y: HEADER_H + PAD + (rr + 1) * (CELL_H + 10) }, { iconId: 'redis', role: 'replica' });
      b.edge(`master-${i + 1}`, key, { sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
    }
  for (let i = 1; i < p.masters; i++) b.edge(`master-${i}`, `master-${i + 1}`, { label: i === 1 ? 'gossip :16379' : undefined, data: { kind: 'heartbeat' } });
  void NODE_H;
  return b.done(size);
}
export const redisProfile: ClusterProfile<RedisParams> = { id: 'redis', tech: 'Redis', label: 'Redis (Sentinel / Cluster)', iconId: 'redis', accent: '#d82c20', roles: ['master', 'replica', 'sentinel'], topologies: ['single-primary', 'sharded'], fields, schema, defaults, generate, validate, summarize };
