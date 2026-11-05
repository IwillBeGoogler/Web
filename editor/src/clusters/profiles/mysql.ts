import { ClusterBuilder } from '../builder';
import { boxFor, CELL_H, GROUP_HEAD, HEADER_H, NODE_H, NODE_W, odd, PAD, plural, rowX } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface MySqlParams extends Record<string, unknown> {
  topology: 'innodb-cluster' | 'group-replication' | 'galera';
  nodes: number;
  router: boolean;
  proxysql: boolean;
}
const fields: FieldSpec[] = [
  { key: 'topology', type: 'select', label: 'Topology', default: 'innodb-cluster', options: [{ value: 'innodb-cluster', label: 'InnoDB Cluster (single-primary)' }, { value: 'group-replication', label: 'Group Replication (multi-primary)' }, { value: 'galera', label: 'Galera (multi-primary)' }] },
  { key: 'nodes', type: 'number', label: 'Nodes', min: 1, max: 9, default: 3 },
  { key: 'router', type: 'boolean', label: 'MySQL Router', default: true },
  { key: 'proxysql', type: 'boolean', label: 'ProxySQL', default: false },
];
const { schema, defaults } = defineParams<MySqlParams>(fields);
const NAMES = { 'innodb-cluster': 'InnoDB Cluster', 'group-replication': 'Group Replication', galera: 'Galera' };
const multi = (p: MySqlParams) => p.topology !== 'innodb-cluster';

const summarize = (p: MySqlParams) => [NAMES[p.topology], plural(p.nodes, 'node'), multi(p) ? 'multi-primary' : 'single-primary', p.router ? 'Router' : null, p.proxysql ? 'ProxySQL' : null].filter(Boolean).join(' · ');
function validate(p: MySqlParams): string[] {
  const w: string[] = [];
  if (p.nodes < 3) w.push(`${p.nodes} node${p.nodes === 1 ? '' : 's'}: Group Replication / Galera need at least 3 nodes to tolerate a failure.`);
  if (p.nodes > 1 && !odd(p.nodes)) w.push(`Even number of nodes (${p.nodes}): a network split can leave no majority; use an odd number.`);
  if (p.nodes > 9) w.push('Group Replication supports at most 9 members.');
  if (p.topology === 'galera' && p.nodes === 2) w.push('Galera with 2 nodes needs a garbd arbitrator.');
  if (p.router && p.proxysql) w.push('MySQL Router and ProxySQL are both enabled: usually only one routing layer is needed.');
  return w;
}
function generate(p: MySqlParams, prefix: string) {
  const cols = Math.min(p.nodes, 3);
  const box = boxFor(cols, Math.ceil(p.nodes / 3));
  const size = { width: box.width + PAD * 2, height: HEADER_H + PAD + box.height + PAD };
  const b = new ClusterBuilder(prefix, { label: `MySQL ${NAMES[p.topology]}`, subtitle: summarize(p), iconId: 'mysql', accent: '#00758f', profileId: 'mysql', params: p, warnings: validate(p), topology: multi(p) ? 'multi-primary' : 'single-primary' });
  b.begin(size);
  b.group('', 'nodes', `${NAMES[p.topology]} members`, { x: PAD, y: HEADER_H + PAD }, box, { stroke: '#00758f' });
  for (let i = 0; i < p.nodes; i++) {
    b.member('nodes', `mysql-${i + 1}`, `mysql-${i + 1} :3306`, { x: rowX(i % 3, cols, box.width), y: GROUP_HEAD + Math.floor(i / 3) * CELL_H }, { iconId: 'mysql', role: multi(p) ? 'primary' : i === 0 ? 'primary' : 'replica' });
    if (i > 0) {
      if (multi(p)) b.edge(`mysql-${i}`, `mysql-${i + 1}`, { label: p.topology === 'galera' ? 'wsrep' : 'GCS', data: { kind: 'heartbeat', arrows: 'both' } });
      else b.edge('mysql-1', `mysql-${i + 1}`, { label: 'async', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
    }
  }
  const ex = size.width + 130;
  let ey = HEADER_H;
  if (p.router) {
    b.member(null, 'router', 'MySQL Router :6446', { x: ex, y: ey }, { iconId: 'mysql' });
    b.edge('router', 'mysql-1', { label: 'rw', sourceHandle: 'left', targetHandle: 'right' });
    ey += NODE_H + 40;
  }
  if (p.proxysql) b.member(null, 'proxysql', 'ProxySQL :6033', { x: ex, y: ey }, { iconId: 'reverse-proxy' }).edge('proxysql', 'mysql-1', { sourceHandle: 'left', targetHandle: 'right' });
  void NODE_W;
  return b.done(size);
}
export const mysqlProfile: ClusterProfile<MySqlParams> = { id: 'mysql', tech: 'MySQL', label: 'MySQL (InnoDB Cluster / Galera)', iconId: 'mysql', accent: '#00758f', roles: ['primary', 'replica'], topologies: ['single-primary', 'multi-primary'], fields, schema, defaults, generate, validate, summarize };
