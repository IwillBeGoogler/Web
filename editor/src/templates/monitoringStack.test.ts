import { describe, expect, it } from 'vitest';
import { monitoringStack, TEMPLATES } from './monitoringStack';
import { parseDiagram, serializeDiagram } from '../lib/serialization';

describe('monitoring stack template', () => {
  const t = monitoringStack();
  it('has expected counts', () => {
    expect(t.nodes).toHaveLength(25);
    expect(t.nodes.filter((n) => n.type === 'group')).toHaveLength(3);
    expect(t.edges).toHaveLength(17);
  });
  it('has port subtitles', () => {
    const sub = (l: string) => t.nodes.find((n) => n.data.label === l)?.data.subtitle;
    expect(sub('Prometheus')).toBe(':9090');
    expect(sub('Grafana Alloy')).toBe(':12345');
    expect(sub('Grafana')).toBe(':3002');
    expect(sub('grafana-proxy')).toBe(':3000');
  });
  it('has expected edge labels and dashed teal push', () => {
    const labels = t.edges.map((e) => e.label);
    for (const l of ['Metrics', '/metrics', 'OTLP traces · logs', 'Alerts', 'remote_write', 'span metrics', 'Traces', 'profiles (pull)', 'LogsQL', 'notify', 'Query', "dead man's switch"])
      expect(labels).toContain(l);
    const push = t.edges.find((e) => e.label === 'profiles (SDK push)')!;
    expect(push.data).toMatchObject({ dashed: true, color: '#0f7b6c' });
  });
  it('is valid and nests children in groups', () => {
    expect(parseDiagram(serializeDiagram(t)).ok).toBe(true);
    const infra = t.nodes.find((n) => n.data.label === 'Infrastructure')!;
    expect(t.nodes.filter((n) => n.parentId === infra.id)).toHaveLength(3);
  });
  it('registered in TEMPLATES', () => {
    expect(TEMPLATES.map((x) => x.id)).toContain('monitoring-stack');
  });
});
