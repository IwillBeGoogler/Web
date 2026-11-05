import type { Diagram, DiagramEdge, DiagramNode } from '../types';
import { styleEdge } from '../lib/graph';

const TEAL = '#0f7b6c';

export interface Template {
  id: string;
  name: string;
  /** search tags (the template picker and the command palette match them) */
  tags?: string[];
  build: () => Diagram;
}

export function monitoringStack(): Diagram {
  const nodes: DiagramNode[] = [];
  const group = (id: string, label: string, x: number, y: number, w: number, h: number) =>
    nodes.push({ id, type: 'group', position: { x, y }, width: w, height: h, style: { width: w, height: h }, data: { label } });
  const icon = (id: string, label: string, iconId: string, x: number, y: number, subtitle?: string, parentId?: string) =>
    nodes.push({
      id, type: 'icon', position: { x, y }, ...(parentId ? { parentId } : {}),
      data: { label, iconId, ...(subtitle ? { subtitle } : {}) },
    });

  nodes.push({ id: 'title', type: 'text', position: { x: 460, y: -80 }, data: { label: 'Grafana observability stack', fontSize: 24, bold: true } });

  group('g-infra', 'Infrastructure', 0, 0, 260, 500);
  icon('exporters', 'Exporters', 'exporter', 70, 60, undefined, 'g-infra');
  icon('databases', 'Databases', 'postgresql', 70, 205, undefined, 'g-infra');
  icon('docker-logs', 'Docker logs', 'docker', 70, 350, undefined, 'g-infra');

  group('g-apps', 'Your apps', 0, 560, 300, 400);
  icon('go', 'Go', 'go', 20, 60, undefined, 'g-apps');
  icon('java', 'Java', 'java', 160, 60, undefined, 'g-apps');
  icon('python', 'Python', 'python', 20, 180, undefined, 'g-apps');
  icon('php', 'PHP', 'php', 160, 180, undefined, 'g-apps');
  icon('rust', 'Rust', 'rust', 20, 290, undefined, 'g-apps');
  icon('otel-sdk', 'OTel SDK', 'opentelemetry', 160, 290, undefined, 'g-apps');

  icon('prometheus', 'Prometheus', 'prometheus', 480, 40, ':9090');
  icon('alloy', 'Grafana Alloy', 'alloy', 480, 360, ':12345');
  icon('vm', 'VictoriaMetrics', 'victoriametrics', 840, 40, ':8428');
  icon('tempo', 'Tempo', 'tempo', 840, 240, ':3200');
  icon('vlogs', 'VictoriaLogs', 'victorialogs', 840, 440, ':9428');
  icon('pyroscope', 'Pyroscope', 'pyroscope', 840, 680, ':4040');

  group('g-alerting', 'Alerting', 1180, 0, 440, 200);
  icon('vmalert', 'vmalert', 'vmalert', 20, 60, ':8880', 'g-alerting');
  icon('alertmanager', 'Alertmanager', 'alertmanager', 160, 60, ':9093', 'g-alerting');
  icon('telegram', 'Telegram', 'telegram', 300, 60, undefined, 'g-alerting');

  icon('grafana', 'Grafana', 'grafana', 1180, 420, ':3002');
  icon('proxy', 'grafana-proxy', 'reverse-proxy', 1400, 420, ':3000');
  icon('users', 'Users', 'user', 1620, 420);

  const edges: DiagramEdge[] = [];
  const edge = (
    id: string, source: string, sh: string, target: string, th: string,
    label?: string, opts: { dashed?: boolean; color?: string } = {},
  ) =>
    edges.push(styleEdge({
      id, source, target, sourceHandle: sh, targetHandle: th,
      ...(label ? { label } : {}),
      data: { ...(opts.dashed ? { dashed: true } : {}), ...(opts.color ? { color: opts.color } : {}) },
    }));

  edge('e1', 'exporters', 'right', 'prometheus', 'left', 'Metrics');
  edge('e2', 'go', 'right', 'prometheus', 'bottom', '/metrics');
  edge('e3', 'docker-logs', 'right', 'alloy', 'left', 'Logs');
  edge('e4', 'otel-sdk', 'right', 'alloy', 'bottom', 'OTLP traces · logs');
  edge('e5', 'vmalert', 'right', 'alertmanager', 'left', 'Alerts');
  edge('e6', 'prometheus', 'right', 'vm', 'left', 'remote_write');
  edge('e7', 'tempo', 'top', 'vm', 'bottom', 'span metrics', { dashed: true });
  edge('e8', 'alloy', 'right', 'tempo', 'left', 'Traces');
  edge('e9', 'alloy', 'right', 'vlogs', 'left', 'Logs');
  edge('e10', 'alloy', 'bottom', 'pyroscope', 'left', 'profiles (pull)');
  edge('e11', 'python', 'right', 'pyroscope', 'bottom', 'profiles (SDK push)', { dashed: true, color: TEAL });
  edge('e12', 'grafana', 'left', 'vlogs', 'right', 'LogsQL');
  edge('e13', 'alertmanager', 'right', 'telegram', 'left', 'notify');
  edge('e14', 'grafana', 'top', 'vm', 'right', 'Query');
  edge('e15', 'prometheus', 'top', 'alertmanager', 'top', "dead man's switch", { dashed: true });
  edge('e16', 'users', 'left', 'proxy', 'right');
  edge('e17', 'proxy', 'left', 'grafana', 'right');

  return { version: 1, nodes, edges };
}

export const TEMPLATES: Template[] = [
  { id: 'monitoring-stack', name: 'Monitoring stack', build: monitoringStack },
];
