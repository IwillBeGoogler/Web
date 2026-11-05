import { ClusterBuilder } from '../builder';
import { ringLayout, ringRadius } from '../layout';
import { GROUP_HEAD, HEADER_H, NODE_H, NODE_W, PAD, plural } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface CassandraParams extends Record<string, unknown> {
  tech: 'cassandra' | 'scylla';
  dcs: number;
  nodesPerDc: number;
  rfPerDc: number;
}
const fields: FieldSpec[] = [
  { key: 'tech', type: 'select', label: 'Database', default: 'cassandra', options: [{ value: 'cassandra', label: 'Apache Cassandra' }, { value: 'scylla', label: 'ScyllaDB' }] },
  { key: 'dcs', type: 'number', label: 'Datacenters', min: 1, max: 3, default: 1 },
  { key: 'nodesPerDc', type: 'number', label: 'Nodes per datacenter', min: 3, max: 12, default: 6 },
  { key: 'rfPerDc', type: 'number', label: 'Replication factor per DC', min: 1, max: 5, default: 3 },
];
const { schema, defaults } = defineParams<CassandraParams>(fields);

/** Approximate murmur3 token position (-2^63 .. 2^63) of node i of n, e.g. "-9.22e18". */
export const tokenFor = (i: number, n: number): string => {
  const v = -(2 ** 63) + (i * 2 ** 64) / n;
  const e = v === 0 ? '0' : v.toExponential(2).replace('e+', 'e');
  return e;
};
const name = (p: CassandraParams) => (p.tech === 'scylla' ? 'ScyllaDB' : 'Cassandra');
const summarize = (p: CassandraParams) => `${name(p)} · ${plural(p.dcs, 'DC')} x ${p.nodesPerDc} nodes · RF ${Array.from({ length: p.dcs }, () => p.rfPerDc).map((r, i) => `dc${i + 1}:${r}`).join(', ')}`;
function validate(p: CassandraParams): string[] {
  const w: string[] = [];
  if (p.rfPerDc > p.nodesPerDc) w.push(`Replication factor (${p.rfPerDc}) exceeds the nodes per datacenter (${p.nodesPerDc}).`);
  if (p.rfPerDc < 3) w.push(`RF ${p.rfPerDc} per DC: QUORUM reads/writes cannot tolerate a node loss; RF 3 is the usual minimum.`);
  if (p.dcs === 1) w.push('Single datacenter: no protection against a site outage.');
  if (p.nodesPerDc < 3) w.push('Fewer than 3 nodes per datacenter.');
  return w;
}
function generate(p: CassandraParams, prefix: string) {
  const icon = p.tech === 'scylla' ? 'scylladb' : 'cassandra';
  const radius = ringRadius(p.nodesPerDc, 150);
  const box = Math.ceil(radius * 2 + NODE_W + 60);
  const boxH = Math.ceil(radius * 2 + NODE_H + 40) + GROUP_HEAD;
  const size = { width: p.dcs * box + (p.dcs + 1) * PAD, height: HEADER_H + PAD + boxH + PAD };
  const b = new ClusterBuilder(prefix, { label: `${name(p)} ring`, subtitle: summarize(p), iconId: icon, accent: '#1287b1', profileId: 'cassandra', params: p, warnings: validate(p), topology: 'ring' });
  b.begin(size);
  for (let d = 0; d < p.dcs; d++) {
    const gx = PAD + d * (box + PAD);
    b.group('', `dc${d + 1}`, `dc${d + 1} (RF ${p.rfPerDc})`, { x: gx, y: HEADER_H + PAD }, { width: box, height: boxH }, { stroke: '#1287b1' });
    const centers = ringLayout(p.nodesPerDc, radius, { x: box / 2, y: GROUP_HEAD + radius + NODE_H / 2 + 10 });
    centers.forEach((c, i) => {
      b.member(`dc${d + 1}`, `dc${d + 1}-n${i + 1}`, `node-${i + 1}`, { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2 }, { iconId: icon, role: 'data', subtitle: `token ${tokenFor(i, p.nodesPerDc)}` });
      if (i > 0) b.edge(`dc${d + 1}-n${i}`, `dc${d + 1}-n${i + 1}`, { sourceHandle: 'right', targetHandle: 'left', data: { kind: 'heartbeat' } });
    });
    if (p.nodesPerDc > 2) b.edge(`dc${d + 1}-n${p.nodesPerDc}`, `dc${d + 1}-n1`, { sourceHandle: 'right', targetHandle: 'left', data: { kind: 'heartbeat' } });
  }
  for (let d = 1; d < p.dcs; d++) b.edge(`dc${d}-n1`, `dc${d + 1}-n1`, { label: 'cross-DC replication', sourceHandle: 'top', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
  return b.done(size);
}
export const cassandraProfile: ClusterProfile<CassandraParams> = { id: 'cassandra', tech: 'Cassandra', label: 'Cassandra / ScyllaDB ring', iconId: 'cassandra', accent: '#1287b1', roles: ['data'], topologies: ['ring'], fields, schema, defaults, generate, validate, summarize };
