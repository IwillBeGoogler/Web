import { ClusterBuilder } from '../builder';
import { boxFor, CELL_H, CELL_W, GROUP_HEAD, HEADER_H, NODE_H, odd, PAD, plural, rowX } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface PgParams extends Record<string, unknown> {
  replicas: number;
  ha: 'patroni' | 'manual';
  etcdNodes: number;
  replication: 'sync' | 'async';
  pooler: 'none' | 'pgbouncer';
  haproxy: boolean;
  citus: boolean;
  workers: number;
}
const fields: FieldSpec[] = [
  { key: 'replicas', type: 'number', label: 'Replicas', min: 0, max: 5, default: 2 },
  { key: 'ha', type: 'select', label: 'High availability', default: 'patroni', options: [{ value: 'patroni', label: 'Patroni + etcd' }, { value: 'manual', label: 'Manual failover' }] },
  { key: 'etcdNodes', type: 'select', label: 'etcd nodes', default: 3, options: [{ value: 3, label: '3' }, { value: 5, label: '5' }], showIf: (p) => p.ha === 'patroni' },
  { key: 'replication', type: 'select', label: 'Streaming replication', default: 'async', options: [{ value: 'async', label: 'Asynchronous' }, { value: 'sync', label: 'Synchronous' }] },
  { key: 'pooler', type: 'select', label: 'Connection pooler', default: 'pgbouncer', options: [{ value: 'none', label: 'None' }, { value: 'pgbouncer', label: 'PgBouncer' }] },
  { key: 'haproxy', type: 'boolean', label: 'HAProxy load balancer', default: true },
  { key: 'citus', type: 'boolean', label: 'Citus sharding', default: false },
  { key: 'workers', type: 'number', label: 'Citus workers', min: 2, max: 8, default: 2, showIf: (p) => !!p.citus },
];
const { schema, defaults } = defineParams<PgParams>(fields);

const summarize = (p: PgParams) =>
  [p.citus ? `Citus · ${plural(p.workers, 'worker')}` : p.ha === 'patroni' ? 'Patroni' : 'Streaming replication', `1 primary + ${plural(p.replicas, 'replica')}`, p.replicas ? p.replication : null, p.pooler === 'pgbouncer' ? 'PgBouncer' : null, p.haproxy ? 'HAProxy' : null].filter(Boolean).join(' · ');

function validate(p: PgParams): string[] {
  const w: string[] = [];
  if (p.replicas === 0) w.push('No replicas: a primary failure means downtime and data loss risk.');
  if (p.replication === 'sync' && p.replicas === 0) w.push('Synchronous replication needs at least one replica, otherwise writes block.');
  if (p.replication === 'sync' && p.replicas === 1) w.push('Synchronous replication with a single replica: losing it blocks writes unless synchronous_commit is relaxed.');
  if (p.ha === 'patroni' && !odd(p.etcdNodes)) w.push(`Even number of etcd nodes (${p.etcdNodes}): use an odd number for quorum.`);
  if (p.ha === 'manual' && p.replicas > 0) w.push('Manual failover: promotion is not automatic; consider Patroni.');
  if (p.haproxy && p.ha === 'manual') w.push('HAProxy needs a health endpoint that identifies the primary (Patroni REST API) to route writes safely.');
  return w;
}

function generate(p: PgParams, prefix: string) {
  const dbN = 1 + p.replicas;
  const dbBox = boxFor(Math.min(dbN, 4), Math.ceil(dbN / 4));
  const etcdN = p.ha === 'patroni' ? p.etcdNodes : 0;
  const etcdBox = etcdN ? boxFor(etcdN, 1) : { width: 0, height: 0 };
  const citusN = p.citus ? 1 + p.workers : 0;
  const citusBox = citusN ? boxFor(Math.min(citusN, 4), Math.ceil(citusN / 4)) : { width: 0, height: 0 };
  const innerW = Math.max(dbBox.width, etcdBox.width, citusBox.width);
  let y = HEADER_H + PAD;
  const size = { width: innerW + PAD * 2, height: HEADER_H + PAD + dbBox.height + (etcdN ? etcdBox.height + PAD : 0) + (citusN ? citusBox.height + PAD : 0) + PAD };
  const b = new ClusterBuilder(prefix, { label: `PostgreSQL cluster`, subtitle: summarize(p), iconId: 'postgresql', accent: '#336791', profileId: 'postgresql', params: p, warnings: validate(p), topology: 'single-primary' });
  b.begin(size);
  b.group('', 'db', 'PostgreSQL nodes', { x: PAD, y }, dbBox, { stroke: '#336791' });
  for (let i = 0; i < dbN; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    b.member('db', `pg-${i + 1}`, `pg-${i + 1} :5432`, { x: rowX(col, Math.min(dbN, 4), dbBox.width), y: GROUP_HEAD + row * CELL_H }, { iconId: 'postgresql', role: i === 0 ? 'primary' : 'replica' });
    if (i > 0) b.edge('pg-1', `pg-${i + 1}`, { sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: p.replication } });
  }
  y += dbBox.height + PAD;
  if (etcdN) {
    b.group('', 'etcd', `etcd (${etcdN})`, { x: PAD, y }, etcdBox, { stroke: '#419eda' });
    for (let i = 0; i < etcdN; i++) {
      b.member('etcd', `etcd-${i + 1}`, `etcd-${i + 1} :2379`, { x: rowX(i, etcdN, etcdBox.width), y: GROUP_HEAD }, { iconId: 'etcd', role: i === 0 ? 'leader' : 'follower' });
      if (i > 0) b.edge(`etcd-${i}`, `etcd-${i + 1}`, { data: { kind: 'heartbeat' } });
    }
    b.edge('etcd-1', 'pg-1', { sourceHandle: 'top', targetHandle: 'bottom', data: { color: '#8a93a3' } });
    y += etcdBox.height + PAD;
  }
  if (citusN) {
    b.group('', 'citus', `Citus (1 coordinator + ${p.workers} workers)`, { x: PAD, y }, citusBox, { stroke: '#2f6fdb' });
    for (let i = 0; i < citusN; i++) {
      b.member('citus', i === 0 ? 'citus-coord' : `citus-w${i}`, i === 0 ? 'coordinator' : `worker-${i}`, { x: rowX(i % 4, Math.min(citusN, 4), citusBox.width), y: GROUP_HEAD + Math.floor(i / 4) * CELL_H }, { iconId: 'postgresql', role: i === 0 ? 'coordinator' : 'shard' });
      if (i > 0) b.edge('citus-coord', `citus-w${i}`, { label: 'shards', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'sharding' } });
    }
  }
  const ex = size.width + 130;
  let ey = HEADER_H;
  if (p.haproxy) {
    b.member(null, 'haproxy', 'HAProxy', { x: ex, y: ey }, { iconId: 'haproxy' });
    b.edge('haproxy', 'pg-1', { label: 'rw :5000', sourceHandle: 'left', targetHandle: 'right' });
    if (p.replicas) b.edge('haproxy', 'pg-2', { label: 'ro :5001', sourceHandle: 'left', targetHandle: 'right', data: { dashed: true } });
    ey += NODE_H + 40;
  }
  if (p.pooler === 'pgbouncer') {
    b.member(null, 'pgbouncer', 'PgBouncer :6432', { x: ex, y: ey }, { iconId: 'pgbouncer' });
    b.edge('pgbouncer', p.haproxy ? 'haproxy' : 'pg-1', { sourceHandle: p.haproxy ? 'top' : 'left', targetHandle: p.haproxy ? 'bottom' : 'right' });
  }
  void CELL_W;
  return b.done(size);
}

export const postgresqlProfile: ClusterProfile<PgParams> = {
  id: 'postgresql', tech: 'PostgreSQL', label: 'PostgreSQL (Patroni)', iconId: 'postgresql', accent: '#336791',
  roles: ['primary', 'replica', 'standby', 'coordinator', 'shard', 'leader', 'follower'], topologies: ['single-primary', 'sharded'],
  fields, schema, defaults, generate, validate, summarize,
};
