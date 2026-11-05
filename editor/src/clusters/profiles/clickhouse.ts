import { ClusterBuilder } from '../builder';
import { CELL_H, CELL_W, GROUP_HEAD, GROUP_PAD, HEADER_H, NODE_W, odd, PAD, boxFor, rowX } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface ChParams extends Record<string, unknown> {
  shards: number;
  replicas: number;
  keeper: number;
}
const fields: FieldSpec[] = [
  { key: 'shards', type: 'number', label: 'Shards', min: 1, max: 6, default: 2 },
  { key: 'replicas', type: 'number', label: 'Replicas per shard', min: 1, max: 4, default: 2 },
  { key: 'keeper', type: 'select', label: 'ClickHouse Keeper nodes', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }] },
];
const { schema, defaults } = defineParams<ChParams>(fields);
const summarize = (p: ChParams) => `${p.shards} shards x ${p.replicas} replicas · ${p.keeper} Keeper`;
function validate(p: ChParams): string[] {
  const w: string[] = [];
  if (p.replicas === 1) w.push('Single replica per shard: losing a node loses that shard (no HA).');
  if (!odd(p.keeper)) w.push(`Even number of Keeper nodes (${p.keeper}): use an odd number for quorum.`);
  if (p.shards === 1 && p.replicas === 1) w.push('A single node: not a cluster.');
  return w;
}
function generate(p: ChParams, prefix: string) {
  const keeperBox = boxFor(p.keeper, 1);
  const shardW = CELL_W + GROUP_PAD * 2;
  const shardH = GROUP_HEAD + p.replicas * CELL_H + GROUP_PAD - 28;
  const innerW = Math.max(p.shards * (shardW + 14), keeperBox.width);
  const keeperY = HEADER_H + PAD;
  const shardY = keeperY + keeperBox.height + PAD;
  const size = { width: innerW + PAD * 2, height: shardY + shardH + PAD };
  const b = new ClusterBuilder(prefix, { label: 'ClickHouse cluster', subtitle: summarize(p), iconId: 'clickhouse', accent: '#fcd34d', profileId: 'clickhouse', params: p, warnings: validate(p), topology: 'sharded' });
  b.begin(size);
  b.group('', 'keeper', `ClickHouse Keeper (${p.keeper})`, { x: PAD + (innerW - keeperBox.width) / 2, y: keeperY }, keeperBox, { stroke: '#8a93a3' });
  for (let i = 0; i < p.keeper; i++) {
    b.member('keeper', `keeper-${i + 1}`, `keeper-${i + 1} :9181`, { x: rowX(i, p.keeper, keeperBox.width), y: GROUP_HEAD }, { iconId: 'clickhouse', role: i === 0 ? 'leader' : 'follower' });
    if (i > 0) b.edge(`keeper-${i}`, `keeper-${i + 1}`, { data: { kind: 'heartbeat' } });
  }
  for (let s = 0; s < p.shards; s++) {
    b.group('', `shard-${s + 1}`, `Shard ${s + 1}`, { x: PAD + s * (shardW + 14), y: shardY }, { width: shardW, height: shardH }, { stroke: '#fcd34d' });
    for (let r = 0; r < p.replicas; r++) {
      b.member(`shard-${s + 1}`, `s${s + 1}-r${r + 1}`, `ch-${s + 1}-${r + 1} :9000`, { x: GROUP_PAD + (CELL_W - NODE_W) / 2, y: GROUP_HEAD + r * CELL_H }, { iconId: 'clickhouse', role: r === 0 ? 'primary' : 'replica' });
      if (r > 0) b.edge(`s${s + 1}-r1`, `s${s + 1}-r${r + 1}`, { label: 'ReplicatedMergeTree', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
    }
    b.edge('keeper-1', `s${s + 1}-r1`, { sourceHandle: 'bottom', targetHandle: 'top', data: { color: '#8a93a3' } });
  }
  return b.done(size);
}
export const clickhouseProfile: ClusterProfile<ChParams> = { id: 'clickhouse', tech: 'ClickHouse', label: 'ClickHouse (shards x replicas)', iconId: 'clickhouse', accent: '#fcd34d', roles: ['primary', 'replica', 'leader', 'follower'], topologies: ['sharded'], fields, schema, defaults, generate, validate, summarize };
