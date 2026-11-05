import type { Diagram, DiagramEdge, DiagramNode, PortSide } from '../types';
import { styleEdge } from '../lib/graph';
import { repeatGroup } from '../lib/repeat';
import { findPreset, presetPatch } from '../lib/edgePresets';
import type { Template } from './monitoringStack';

const METRICS = '#d9480f';
const LOGS = '#1971c2';
const OTLP = '#0c8599';
const MUTED = '#6b7280';
const J = 10;
void 0; // junction size

/**
 * "awesome-grafana (medium)". Every junction sits at an exact coordinate and every edge is pinned to a side, so the
 * buses are clean straight runs: cards -> one vertical -> Vector, collectors -> one horizontal -> Vector, then three
 * trunks (metrics / traces / logs) across all servers with ONE vertical drop each into the monitoring VM.
 */
export function monitoringMedium(): Diagram {
  let seq = 0;
  const gen = (p: string) => `${p}${++seq}`;
  let nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  const text = (id: string, label: string, x: number, y: number, data: Partial<DiagramNode['data']>, w = 760, h = 40, parentId?: string) =>
    nodes.push({ id, type: 'text', position: { x, y }, width: w, height: h, ...(parentId ? { parentId } : {}), data: { label, ...data } });
  const icon = (id: string, label: string, iconId: string, x: number, y: number, extra: Partial<DiagramNode['data']> = {}, parentId?: string) =>
    nodes.push({ id, type: 'icon', position: { x, y }, ...(parentId ? { parentId } : {}), data: { label, iconId, ...extra } });
  const card = (id: string, label: string, iconId: string, x: number, y: number, w: number, h: number, layout: 'vertical' | 'horizontal', tags: { text: string; color: string }[], extra: Partial<DiagramNode['data']> = {}, parentId?: string) =>
    nodes.push({ id, type: 'card', position: { x, y }, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}), data: { label, iconId, layout, tags, accent: tags[0]?.color ?? LOGS, ...extra } });
  /** junction whose CENTRE is at (cx, cy) */
  const junction = (id: string, cx: number, cy: number, parentId?: string, slot?: string) =>
    nodes.push({ id, type: 'junction', position: { x: cx - J / 2, y: cy - J / 2 }, width: J, height: J, ...(parentId ? { parentId } : {}), data: { label: '', ...(slot ? { slot } : {}) } });
  const group = (id: string, label: string, x: number, y: number, w: number, h: number, data: Partial<DiagramNode['data']> = {}, parentId?: string) =>
    nodes.push({ id, type: 'group', position: { x, y }, width: w, height: h, style: { width: w, height: h }, ...(parentId ? { parentId } : {}), data: { label, ...data } });

  text('title', 'awesome-grafana (medium) — metrics + logs + traces', 0, -130, { fontSize: 30, bold: true, textColor: '#1f2430' }, 1000);
  text('subtitle', 'Vector → VictoriaMetrics + VictoriaLogs · OTel SDK → OTel Collector → Tempo + Jaeger', 0, -80, { fontSize: 14, textColor: MUTED }, 900, 24);

  // ---- one server (relative coordinates), then repeated ----
  const tags = [{ text: 'metrics', color: METRICS }, { text: 'logs', color: LOGS }, { text: 'OTLP', color: OTLP }];
  const SERVER_W = 620;
  const SERVER_H = 540;
  group('s1', 'server-1', 0, 0, SERVER_W, SERVER_H, { variant: 'dashed', caption: 'App server · 4 vCPU · 8 GB RAM' });
  [40, 240, 440].forEach((x, i) => card(`s1-c${i + 1}`, 'Service', 'go', x, 36, 140, 138, 'vertical', tags, { slot: `c${i + 1}` }, 's1'));
  [110, 310, 510].forEach((cx, i) => junction(`s1-jt${i + 1}`, cx, 200, 's1', `jt${i + 1}`));
  // collectors in ONE row under the cards, with a gap in the middle for the cards' vertical
  icon('s1-ne', 'node_exporter', 'node-exporter', 20, 235, { subtitle: 'host', subtitleColor: METRICS, slot: 'ne' }, 's1');
  icon('s1-cadv', 'cAdvisor', 'cadvisor', 150, 235, { subtitle: 'containers', subtitleColor: METRICS, slot: 'cadv' }, 's1');
  icon('s1-jd', 'journald', 'journald', 350, 235, { subtitle: 'system', subtitleColor: LOGS, slot: 'jd' }, 's1');
  icon('s1-file', 'file', 'nginx', 480, 235, { subtitle: 'nginx · DB', subtitleColor: LOGS, slot: 'file' }, 's1');
  [80, 210, 410, 540].forEach((cx, i) => junction(`s1-jb${i + 1}`, cx, 372, 's1', `jb${i + 1}`));
  junction('s1-jc', 310, 372, 's1', 'jc');
  icon('s1-vec', 'Vector agent', 'vector', 250, 410, { slot: 'vec' }, 's1');

  nodes = repeatGroup(nodes, 's1', 3, gen);
  const servers = nodes.filter((n) => n.type === 'group' && n.data.variant === 'dashed');
  const names = ['server-1', 'server-2', 'server-10'];
  const X = [0, 700, 1700];
  servers.forEach((g, i) => {
    g.data = { ...g.data, label: names[i] };
    g.position = { x: X[i], y: 0 };
  });
  const ell = nodes.find((n) => n.data.shape === 'ellipsis')!;
  ell.position = { x: 1480, y: 250 };
  const rows: [string, string][][] = [
    [['api-gateway', 'go'], ['orders', 'java'], ['payments', 'go']],
    [['users', 'python'], ['inventory', 'rust'], ['notifications', 'php']],
    [['search', 'go'], ['billing', 'java'], ['worker', 'python']],
  ];
  servers.forEach((g, si) =>
    rows[si].forEach(([name, ic], ci) => {
      const c = nodes.find((n) => n.parentId === g.id && n.data.slot === `c${ci + 1}`)!;
      c.data = { ...c.data, label: name, iconId: ic };
      delete c.data.subtitle;
    }),
  );

  // ---- monitoring VM (children relative to the group) ----
  const VM_X = 40;
  const VM_Y = 800;
  const VM_H = 640;
  const vm = (rx: number, ry: number) => ({ x: VM_X + rx, y: VM_Y + ry });
  nodes.push({ id: 'vm', type: 'group', position: { x: VM_X, y: VM_Y }, width: 2000, height: VM_H, style: { width: 2000, height: VM_H }, data: { label: 'Monitoring VM', variant: 'dashed', caption: 'Monitoring VM · 16 GB RAM · SSD' } });
  icon('vmbackup', 'vmbackup', 'vmbackup', 60, 60, { subtitle: 'daily', subtitleColor: MUTED }, 'vm');
  icon('vm-db', 'VictoriaMetrics', 'victoriametrics', 260, 60, { subtitle: ':8428 · metrics', subtitleColor: METRICS }, 'vm');
  icon('vlogs', 'VictoriaLogs', 'victorialogs', 740, 60, { subtitle: ':9428 · logs', subtitleColor: LOGS }, 'vm');
  card('otel', 'OTel Collector', 'otel-collector', 1240, 50, 440, 110, 'horizontal', [{ text: 'spanmetrics → tail_sampling', color: OTLP }, { text: 'errors · slow 100% · rest 5–10%', color: MUTED }], {}, 'vm');
  icon('tempo', 'Tempo', 'tempo', 1400, 250, { subtitle: ':3200 · retention 14d', subtitleColor: OTLP }, 'vm');
  group('jaeger', 'Jaeger v2', 1600, 240, 360, 290, { variant: 'card', subtitle: ':16686 · UI', accent: OTLP, groupIcon: 'jaeger' }, 'vm');
  text('badger', 'Badger (embedded) · TTL 7d', 50, 70, { fontSize: 13, bold: true, textColor: '#1f2430' }, 260, 24, 'jaeger');
  nodes.push({ id: 'cyl1', type: 'shape', position: { x: 45, y: 120 }, width: 120, height: 120, parentId: 'jaeger', data: { label: '/badger/key\nindex', shape: 'cylinder' } });
  nodes.push({ id: 'cyl2', type: 'shape', position: { x: 195, y: 120 }, width: 120, height: 120, parentId: 'jaeger', data: { label: '/badger/data\nspans', shape: 'cylinder' } });
  icon('grafana', 'Grafana', 'grafana', 740, 460, { subtitle: ':3000', subtitleColor: METRICS }, 'vm');
  icon('s3', 'Backup / S3', 's3', VM_X + 60, VM_Y + VM_H + 60);
  icon('users', 'Users', 'users', 1290 - 60, VM_Y + VM_H + 60);

  // ---- trunk junctions (absolute): metrics on top, logs, traces; >= 40px apart ----
  type Sig = 'metrics' | 'logs' | 'traces';
  const SIGS: Sig[] = ['metrics', 'logs', 'traces'];
  const T: Record<Sig, number> = { metrics: 600, logs: 650, traces: 700 };
  const portX: Record<Sig, number> = { metrics: 298, logs: 310, traces: 322 }; // Vector's bottom ports, left to right
  const dropX: Record<Sig, number> = { metrics: VM_X + 320, logs: VM_X + 800, traces: VM_X + 1460 }; // centre x of the three targets
  const chain: Record<Sig, { id: string; x: number }[]> = { metrics: [], logs: [], traces: [] };
  servers.forEach((_, i) => {
    for (const s of SIGS) {
      const id = `jx-${s}-${i}`;
      junction(id, X[i] + portX[s], T[s]);
      chain[s].push({ id, x: X[i] + portX[s] });
    }
  });
  for (const s of SIGS) {
    junction(`jd-${s}`, dropX[s], T[s]);
    chain[s].push({ id: `jd-${s}`, x: dropX[s] });
    chain[s].sort((a, b) => a.x - b.x);
  }

  // ---- edges ----
  let eseq = 0;
  type Opts = { label?: string; preset?: string; pins?: [PortSide, PortSide]; waypoints?: { x: number; y: number }[]; arrow?: boolean };
  const edge = (source: string, target: string, o: Opts = {}) => {
    const p = o.preset ? findPreset(o.preset) : undefined;
    edges.push(
      styleEdge({
        id: `e${++eseq}`, source, target, ...(o.label ? { label: o.label } : {}),
        data: {
          ...(p ? presetPatch(p) : {}),
          ...(o.pins ? { pinSource: o.pins[0], pinTarget: o.pins[1] } : {}),
          ...(o.waypoints ? { manual: true, waypoints: o.waypoints } : {}),
          startMarker: 'none',
          endMarker: o.arrow ? 'arrow' : 'none',
        },
      }),
    );
  };
  const child = (g: DiagramNode, slot: string) => nodes.find((n) => n.parentId === g.id && n.data.slot === slot)!.id;

  servers.forEach((g, i) => {
    const at = (slot: string) => child(g, slot);
    const dark = { preset: 'control' };
    // cards -> horizontal line -> one vertical down (through the collectors' gap) -> Vector
    for (const k of [1, 2, 3]) edge(at(`c${k}`), at(`jt${k}`), { ...dark, pins: ['bottom', 'top'] });
    edge(at('jt1'), at('jt2'), { ...dark, pins: ['right', 'left'] });
    edge(at('jt3'), at('jt2'), { ...dark, pins: ['left', 'right'] });
    edge(at('jt2'), at('jc'), { ...dark, pins: ['bottom', 'top'] });
    // collectors in one row -> horizontal bus above Vector
    ['ne', 'cadv', 'jd', 'file'].forEach((slot, k) => edge(at(slot), at(`jb${k + 1}`), { ...dark, pins: ['bottom', 'top'] }));
    edge(at('jb1'), at('jb2'), { ...dark, pins: ['right', 'left'] });
    edge(at('jb2'), at('jc'), { ...dark, pins: ['right', 'left'] });
    edge(at('jb4'), at('jb3'), { ...dark, pins: ['left', 'right'] });
    edge(at('jb3'), at('jc'), { ...dark, pins: ['left', 'right'] });
    edge(at('jc'), at('vec'), { ...dark, pins: ['bottom', 'top'], arrow: true });
    // Vector -> one vertical per signal, down to that signal's trunk
    for (const s of SIGS) edge(at('vec'), `jx-${s}-${i}`, { preset: s, pins: ['bottom', 'top'], ...(s === 'traces' ? { label: 'OTLP' } : {}) });
  });
  // trunks across all servers, then ONE drop each into the monitoring VM
  for (const s of SIGS) chain[s].slice(1).forEach((b, k) => edge(chain[s][k].id, b.id, { preset: s, pins: ['right', 'left'] }));
  edge('jd-metrics', 'vm-db', { label: 'metrics · remote_write', preset: 'metrics', pins: ['bottom', 'top'], arrow: true });
  edge('jd-logs', 'vlogs', { label: 'logs · jsonline', preset: 'logs', pins: ['bottom', 'top'], arrow: true });
  edge('jd-traces', 'otel', { label: 'traces · OTLP :4317', preset: 'traces', pins: ['bottom', 'top'], arrow: true });

  // inside the VM
  edge('vm-db', 'vmbackup', { preset: 'control', pins: ['left', 'right'], arrow: true, label: undefined });
  edge('otel', 'vm-db', { label: 'span metrics (RED)', preset: 'metrics', pins: ['left', 'bottom'], arrow: true, waypoints: [vm(1200, 205), vm(340, 205)] });
  edge('otel', 'tempo', { preset: 'traces', pins: ['bottom', 'top'], arrow: true });
  edge('otel', 'jaeger', { preset: 'traces', pins: ['right', 'top'], arrow: true });
  edge('vmbackup', 's3', { label: 'daily', preset: 'backup', pins: ['bottom', 'top'], arrow: true });
  edge('vm-db', 'grafana', { label: 'PromQL', preset: 'metrics', pins: ['bottom', 'left'], arrow: true });
  edge('vlogs', 'grafana', { label: 'LogsQL', preset: 'logs', pins: ['bottom', 'top'], arrow: true });
  edge('tempo', 'grafana', { label: 'TraceQL', preset: 'traces', pins: ['bottom', 'right'], arrow: true });
  edge('users', 'grafana', { label: 'daily work', preset: 'control', pins: ['left', 'bottom'], arrow: true });
  edge('users', 'jaeger', { label: 'deep dive', preset: 'control', pins: ['right', 'bottom'], arrow: true });

  return { version: 1, nodes, edges };
}

export const TEMPLATES: Template[] = [{ id: 'monitoring-medium', name: 'Monitoring — medium (metrics + logs + traces)', build: monitoringMedium }];
