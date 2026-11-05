import { ClusterBuilder } from '../builder';
import { ringLayout, ringRadius } from '../layout';
import { NODE_H, NODE_W, HEADER_H, odd, PAD, plural } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface QuorumParams extends Record<string, unknown> {
  tech: 'etcd' | 'zookeeper' | 'consul';
  nodes: number;
  clients: number;
}
const fields: FieldSpec[] = [
  { key: 'tech', type: 'select', label: 'Technology', default: 'etcd', options: [{ value: 'etcd', label: 'etcd' }, { value: 'zookeeper', label: 'ZooKeeper' }, { value: 'consul', label: 'Consul servers' }] },
  { key: 'nodes', type: 'select', label: 'Quorum size', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 7, label: '7' }] },
  { key: 'clients', type: 'number', label: 'Client agents', min: 0, max: 4, default: 0 },
];
const { schema, defaults } = defineParams<QuorumParams>(fields);
const INFO = { etcd: { label: 'etcd cluster', port: 2379, icon: 'etcd', accent: '#419eda' }, zookeeper: { label: 'ZooKeeper ensemble', port: 2181, icon: 'zookeeper', accent: '#d97706' }, consul: { label: 'Consul cluster', port: 8500, icon: 'consul', accent: '#ca2171' } };

const summarize = (p: QuorumParams) => `${p.tech === 'zookeeper' ? 'ZooKeeper' : p.tech === 'etcd' ? 'etcd' : 'Consul'} · ${p.nodes} nodes · quorum ${Math.floor(p.nodes / 2) + 1}${p.clients ? ` · ${plural(p.clients, 'client')}` : ''}`;
function validate(p: QuorumParams): string[] {
  const w: string[] = [];
  if (!odd(p.nodes)) w.push(`Even number of nodes (${p.nodes}): no more fault tolerant than ${p.nodes - 1}; use an odd number.`);
  if (p.nodes < 3) w.push('Fewer than 3 nodes: a single failure loses quorum.');
  if (p.nodes > 7) w.push('More than 7 nodes slows consensus without adding much resilience.');
  return w;
}
function generate(p: QuorumParams, prefix: string) {
  const info = INFO[p.tech];
  const radius = ringRadius(p.nodes, 140);
  const dia = Math.ceil(radius * 2 + NODE_W + 60);
  const size = { width: dia + PAD * 2 + (p.clients ? 160 : 0), height: HEADER_H + PAD + Math.ceil(radius * 2 + NODE_H + 40) + PAD };
  const b = new ClusterBuilder(prefix, { label: info.label, subtitle: summarize(p), iconId: info.icon, accent: info.accent, profileId: 'quorum', params: p, warnings: validate(p), topology: 'quorum' });
  b.begin(size);
  const c = ringLayout(p.nodes, radius, { x: PAD + dia / 2, y: HEADER_H + PAD + radius + NODE_H / 2 + 10 });
  c.forEach((pt, i) => {
    b.member('', `n${i + 1}`, `${p.tech === 'consul' ? 'consul' : p.tech}-${i + 1} :${info.port}`, { x: pt.x - NODE_W / 2, y: pt.y - NODE_H / 2 }, { iconId: info.icon, role: i === 0 ? 'leader' : 'follower' });
    if (i > 0) b.edge('n1', `n${i + 1}`, { data: { kind: 'heartbeat' }, sourceHandle: 'bottom', targetHandle: 'top' });
  });
  for (let i = 0; i < p.clients; i++) {
    b.member('', `client-${i + 1}`, `agent-${i + 1}`, { x: PAD + dia + 10, y: HEADER_H + PAD + i * (NODE_H + 12) }, { iconId: 'service' });
    b.edge(`client-${i + 1}`, 'n1', { label: 'gRPC', sourceHandle: 'left', targetHandle: 'right' });
  }
  return b.done(size);
}
export const quorumProfile: ClusterProfile<QuorumParams> = { id: 'quorum', tech: 'etcd / ZooKeeper / Consul', label: 'etcd / ZooKeeper / Consul', iconId: 'etcd', accent: '#419eda', roles: ['leader', 'follower'], topologies: ['quorum', 'ring'], fields, schema, defaults, generate, validate, summarize };
