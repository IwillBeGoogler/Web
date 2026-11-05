import { ClusterBuilder } from '../builder';
import { boxFor, GROUP_HEAD, HEADER_H, odd, PAD, plural, rowX } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface RabbitParams extends Record<string, unknown> {
  nodes: number;
  quorumQueues: boolean;
  management: boolean;
}
const fields: FieldSpec[] = [
  { key: 'nodes', type: 'number', label: 'Nodes', min: 1, max: 7, default: 3 },
  { key: 'quorumQueues', type: 'boolean', label: 'Quorum queues (Raft)', default: true },
  { key: 'management', type: 'boolean', label: 'Management UI', default: false },
];
const { schema, defaults } = defineParams<RabbitParams>(fields);
const summarize = (p: RabbitParams) => `${plural(p.nodes, 'node')} · ${p.quorumQueues ? 'quorum queues' : 'classic queues'}`;
function validate(p: RabbitParams): string[] {
  const w: string[] = [];
  if (p.nodes > 1 && !odd(p.nodes)) w.push(`Even number of nodes (${p.nodes}): quorum queues need a majority; use an odd number.`);
  if (p.nodes < 3) w.push('Fewer than 3 nodes: quorum queues cannot tolerate a node failure.');
  if (!p.quorumQueues && p.nodes > 1) w.push('Classic mirrored queues are deprecated; prefer quorum queues.');
  return w;
}
function generate(p: RabbitParams, prefix: string) {
  const box = boxFor(Math.min(p.nodes, 5), Math.ceil(p.nodes / 5));
  const size = { width: box.width + PAD * 2, height: HEADER_H + PAD + box.height + PAD };
  const b = new ClusterBuilder(prefix, { label: 'RabbitMQ cluster', subtitle: summarize(p), iconId: 'rabbitmq', accent: '#ff6600', profileId: 'rabbitmq', params: p, warnings: validate(p), topology: 'quorum' });
  b.begin(size);
  b.group('', 'nodes', p.quorumQueues ? 'Quorum queue replicas' : 'Nodes', { x: PAD, y: HEADER_H + PAD }, box, { stroke: '#ff6600' });
  for (let i = 0; i < p.nodes; i++) {
    b.member('nodes', `rmq-${i + 1}`, `rabbit@node-${i + 1} :5672`, { x: rowX(i % 5, Math.min(p.nodes, 5), box.width), y: GROUP_HEAD + Math.floor(i / 5) * 124 }, { iconId: 'rabbitmq', role: p.quorumQueues ? (i === 0 ? 'leader' : 'follower') : undefined });
    if (i > 0) b.edge(`rmq-${i}`, `rmq-${i + 1}`, { label: i === 1 ? 'Raft :25672' : undefined, data: { kind: 'heartbeat', arrows: 'both' } });
  }
  if (p.management) b.member(null, 'mgmt', 'Management UI :15672', { x: size.width + 130, y: HEADER_H }, { iconId: 'rabbitmq' }).edge('mgmt', 'rmq-1', { label: 'HTTP API', sourceHandle: 'left', targetHandle: 'right' });
  return b.done(size);
}
export const rabbitmqProfile: ClusterProfile<RabbitParams> = { id: 'rabbitmq', tech: 'RabbitMQ', label: 'RabbitMQ (quorum queues)', iconId: 'rabbitmq', accent: '#ff6600', roles: ['leader', 'follower'], topologies: ['quorum'], fields, schema, defaults, generate, validate, summarize };
