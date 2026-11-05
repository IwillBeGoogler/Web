import { ClusterBuilder } from '../builder';
import { tieredLayout } from '../layout';
import { CELL_H, CELL_W, HEADER_H, NODE_W, odd, PAD, plural } from './shared';
import { defineParams, type ClusterProfile, type FieldSpec } from './types';

export interface EsParams extends Record<string, unknown> {
  engine: 'elasticsearch' | 'opensearch';
  masters: number;
  hot: number;
  warm: number;
  cold: number;
  ingest: number;
  coordinating: number;
  dashboards: boolean;
}
const fields: FieldSpec[] = [
  { key: 'engine', type: 'select', label: 'Engine', default: 'elasticsearch', options: [{ value: 'elasticsearch', label: 'Elasticsearch' }, { value: 'opensearch', label: 'OpenSearch' }] },
  { key: 'masters', type: 'number', label: 'Master-eligible nodes', min: 1, max: 7, default: 3 },
  { key: 'hot', type: 'number', label: 'Data (hot)', min: 0, max: 9, default: 3 },
  { key: 'warm', type: 'number', label: 'Data (warm)', min: 0, max: 6, default: 0 },
  { key: 'cold', type: 'number', label: 'Data (cold)', min: 0, max: 6, default: 0 },
  { key: 'ingest', type: 'number', label: 'Ingest nodes', min: 0, max: 4, default: 0 },
  { key: 'coordinating', type: 'number', label: 'Coordinating nodes', min: 0, max: 4, default: 0 },
  { key: 'dashboards', type: 'boolean', label: 'Kibana / OpenSearch Dashboards', default: false },
];
const { schema, defaults } = defineParams<EsParams>(fields);
const name = (p: EsParams) => (p.engine === 'opensearch' ? 'OpenSearch' : 'Elasticsearch');
const dataN = (p: EsParams) => p.hot + p.warm + p.cold;

const summarize = (p: EsParams) => [name(p), plural(p.masters, 'master'), plural(dataN(p), 'data node'), p.warm || p.cold ? `hot/${p.warm ? 'warm' : ''}${p.cold ? '/cold' : ''}` : null, p.ingest ? plural(p.ingest, 'ingest') : null, p.coordinating ? `${p.coordinating} coordinating` : null].filter(Boolean).join(' · ');
function validate(p: EsParams): string[] {
  const w: string[] = [];
  if (!odd(p.masters)) w.push(`Even number of master-eligible nodes (${p.masters}): use an odd number to avoid split-brain.`);
  if (p.masters < 3) w.push('Fewer than 3 master-eligible nodes: no fault tolerance for cluster state.');
  if (dataN(p) === 0) w.push('No data nodes: nothing can store shards.');
  if (p.hot === 0 && dataN(p) > 0) w.push('Warm/cold tiers without a hot tier: new data has nowhere to be written.');
  if (dataN(p) === 1) w.push('A single data node cannot hold replica shards (yellow cluster).');
  return w;
}
function generate(p: EsParams, prefix: string) {
  const rows: { key: string; count: number; label: string; role: string; sub?: string }[] = [
    { key: 'master', count: p.masters, label: 'master', role: 'master' },
    ...(p.coordinating ? [{ key: 'coord', count: p.coordinating, label: 'coordinating', role: 'coordinator' }] : []),
    ...(p.ingest ? [{ key: 'ingest', count: p.ingest, label: 'ingest', role: 'ingest' }] : []),
    ...(p.hot ? [{ key: 'hot', count: p.hot, label: 'data-hot', role: 'data', sub: 'hot' }] : []),
    ...(p.warm ? [{ key: 'warm', count: p.warm, label: 'data-warm', role: 'data', sub: 'warm' }] : []),
    ...(p.cold ? [{ key: 'cold', count: p.cold, label: 'data-cold', role: 'data', sub: 'cold' }] : []),
  ];
  const tiers = tieredLayout(rows.map((r) => r.count), CELL_W, CELL_H, 0);
  const innerW = Math.max(...rows.map((r) => r.count)) * CELL_W;
  const size = { width: innerW + PAD * 2, height: HEADER_H + PAD + rows.length * CELL_H + PAD };
  const icon = p.engine === 'opensearch' ? 'opensearch' : 'elasticsearch';
  const b = new ClusterBuilder(prefix, { label: `${name(p)} cluster`, subtitle: summarize(p), iconId: icon, accent: '#fed10a', profileId: 'elasticsearch', params: p, warnings: validate(p), topology: 'quorum' });
  b.begin(size);
  rows.forEach((r, ri) => {
    for (let i = 0; i < r.count; i++) {
      b.member('', `${r.key}-${i + 1}`, `${r.label}-${i + 1} :9200`, { x: PAD + tiers[ri][i].x + (CELL_W - NODE_W) / 2, y: HEADER_H + PAD + ri * CELL_H }, { iconId: icon, role: r.role, ...(r.sub ? { subtitle: r.sub } : {}) });
      if (r.key === 'master' && i > 0) b.edge(`master-${i}`, `master-${i + 1}`, { data: { kind: 'heartbeat' } });
    }
  });
  const dataKeys = rows.filter((r) => ['hot', 'warm', 'cold'].includes(r.key)).map((r) => r.key);
  if (dataKeys.length > 1) for (let i = 1; i < dataKeys.length; i++) b.edge(`${dataKeys[i - 1]}-1`, `${dataKeys[i]}-1`, { label: 'ILM rollover', sourceHandle: 'bottom', targetHandle: 'top', data: { kind: 'replication', replMode: 'async' } });
  if (p.dashboards) b.member(null, 'kibana', p.engine === 'opensearch' ? 'OpenSearch Dashboards :5601' : 'Kibana :5601', { x: size.width + 130, y: HEADER_H }, { iconId: p.engine === 'opensearch' ? 'opensearch-dashboards' : 'kibana' }).edge('kibana', 'master-1', { label: 'queries', sourceHandle: 'left', targetHandle: 'right' });
  return b.done(size);
}
export const elasticsearchProfile: ClusterProfile<EsParams> = { id: 'elasticsearch', tech: 'Elasticsearch', label: 'Elasticsearch / OpenSearch', iconId: 'elasticsearch', accent: '#fed10a', roles: ['master', 'data', 'ingest', 'coordinator'], topologies: ['quorum'], fields, schema, defaults, generate, validate, summarize };
