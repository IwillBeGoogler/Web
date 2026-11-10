import { describe, expect, it } from 'vitest';
import { parseKubernetes } from '@core/infra/kubernetes';

const parse = (...docs: object[]) => parseKubernetes([{ name: 'k.yaml', text: docs.map((d) => JSON.stringify(d)).join('\n---\n') }]);
const labelsOf = (m: ReturnType<typeof parse>) => m.edges.map((e) => `${e.from}>${e.to}${e.label ? `:${e.label}` : ''}`);
const meta = (name: string, namespace?: string) => ({ name, ...(namespace ? { namespace } : {}) });
const dep = (name: string, spec: object = {}, labels?: object) => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: meta(name), spec: { template: { ...(labels ? { metadata: { labels } } : {}), spec }, ...{} } });

describe('selectors and pod labels', () => {
  it('services select pods, cron job templates and deployments by their pod-template labels; unlabelled workloads never match', () => {
    const m = parse(
      { apiVersion: 'v1', kind: 'Service', metadata: meta('svc'), spec: { selector: { app: 'web' }, ports: [{ port: 80, targetPort: 8080 }] } },
      { apiVersion: 'v1', kind: 'Service', metadata: meta('plain'), spec: { selector: { app: 'web' }, ports: [{ port: 80 }] } },
      { apiVersion: 'v1', kind: 'Service', metadata: meta('noports'), spec: { selector: { app: 'web' } } },
      { apiVersion: 'v1', kind: 'Service', metadata: meta('noselector'), spec: {} },
      { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'p', labels: { app: 'web' } }, spec: { containers: [{ name: 'c', image: 'nginx' }] } },
      { apiVersion: 'v1', kind: 'Pod', metadata: meta('bare'), spec: {} },
      { apiVersion: 'batch/v1', kind: 'CronJob', metadata: meta('cron'), spec: { jobTemplate: { spec: { template: { metadata: { labels: { app: 'web' } }, spec: { containers: [] } } } } } },
      { apiVersion: 'batch/v1', kind: 'CronJob', metadata: meta('nolabels'), spec: {} },
      dep('d1', {}, { app: 'web' }),
      dep('d2'),
    );
    const edges = labelsOf(m);
    expect(edges).toContain('Service/default/svc>Pod/default/p::80→8080');
    expect(edges).toContain('Service/default/plain>Pod/default/p::80');
    expect(edges).toContain('Service/default/noports>Deployment/default/d1');
    expect(edges.filter((e) => e.startsWith('Service/default/svc>')).map((e) => e.split('>')[1].split(':')[0]).sort()).toEqual(['CronJob/default/cron', 'Deployment/default/d1', 'Pod/default/p']);
    expect(edges.some((e) => e.includes('d2') || e.includes('bare') || e.includes('nolabels'))).toBe(false);
    expect(edges.some((e) => e.startsWith('Service/default/noselector'))).toBe(false);
  });
});

describe('ingress and autoscaler edges', () => {
  const svc = (n: string) => ({ apiVersion: 'v1', kind: 'Service', metadata: meta(n), spec: {} });
  const ingress = (name: string, spec: object) => ({ apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: meta(name), spec });
  const from = (name: string, spec: object) => labelsOf(parse(svc('a'), svc('b'), svc('c'), ingress(name, spec))).filter((e) => e.startsWith(`Ingress/default/${name}>`));
  it('routes by host and path, the legacy serviceName form, default backends and missing targets', () => {
    expect(from('i1', { rules: [{ host: 'h.io', http: { paths: [{ path: '/x', backend: { service: { name: 'a' } } }] } }] })).toEqual(['Ingress/default/i1>Service/default/a:h.io/x']);
    expect(from('i2', { rules: [{ http: { paths: [{ backend: { serviceName: 'b' } }] } }] })).toEqual(['Ingress/default/i2>Service/default/b:*/']);
    expect(from('i3', { rules: [{ http: { paths: [{ backend: { service: { name: 'missing' } } }] } }, {}] })).toEqual([]);
    expect(from('i4', { defaultBackend: { service: { name: 'a' } } })).toEqual(['Ingress/default/i4>Service/default/a:default']);
    expect(from('i5', { backend: { serviceName: 'c' } })).toEqual(['Ingress/default/i5>Service/default/c:default']);
    expect(from('i6', {})).toEqual([]);
    expect(from('i7', { defaultBackend: {} })).toEqual([]);
  });
  it('autoscalers point at their target with the replica range', () => {
    const hpa = (name: string, spec: object) => ({ apiVersion: 'autoscaling/v2', kind: 'HorizontalPodAutoscaler', metadata: meta(name), spec });
    const target = { kind: 'Deployment', name: 'app' };
    const m = parse(dep('app'), hpa('h1', { scaleTargetRef: target }), hpa('h2', { scaleTargetRef: target, minReplicas: 2, maxReplicas: 8 }), hpa('h3', {}), hpa('h4', { scaleTargetRef: { kind: 'Deployment', name: 'ghost' } }));
    const edges = labelsOf(m);
    expect(edges).toContain('HorizontalPodAutoscaler/default/h1>Deployment/default/app:1–?');
    expect(edges).toContain('HorizontalPodAutoscaler/default/h2>Deployment/default/app:2–8');
    expect(edges.some((e) => e.includes('h3') || e.includes('h4'))).toBe(false);
  });
});

describe('workload references', () => {
  const cm = { apiVersion: 'v1', kind: 'ConfigMap', metadata: meta('cm') };
  const sec = { apiVersion: 'v1', kind: 'Secret', metadata: meta('sec') };
  const pvc = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: meta('data') };
  const api = { apiVersion: 'v1', kind: 'Service', metadata: meta('api', 'prod'), spec: {} };
  const local = { apiVersion: 'v1', kind: 'Service', metadata: meta('local'), spec: {} };
  const from = (pod: object, ...extra: object[]) => labelsOf(parse(cm, sec, pvc, api, local, ...extra, dep('w', pod))).filter((e) => e.startsWith('Deployment/default/w>'));
  const ctr = (c: object) => ({ containers: [{ name: 'c', image: 'redis:7', ...c }] });
  it('volumes, envFrom and env refs', () => {
    expect(from({ volumes: [{ configMap: { name: 'cm' } }, { emptyDir: {} }] })).toEqual(['Deployment/default/w>ConfigMap/default/cm:volume']);
    expect(from({ volumes: [{ secret: { secretName: 'sec' } }] })).toEqual(['Deployment/default/w>Secret/default/sec:volume']);
    expect(from({ volumes: [{ persistentVolumeClaim: { claimName: 'data' } }] })).toEqual(['Deployment/default/w>PersistentVolumeClaim/default/data:mount']);
    expect(from(ctr({ envFrom: [{ configMapRef: { name: 'cm' } }, {}] }))).toEqual(['Deployment/default/w>ConfigMap/default/cm:envFrom']);
    expect(from(ctr({ envFrom: [{ secretRef: { name: 'sec' } }] }))).toEqual(['Deployment/default/w>Secret/default/sec:envFrom']);
    expect(from(ctr({ env: [{ name: 'A', valueFrom: { configMapKeyRef: { name: 'cm' } } }] }))).toEqual(['Deployment/default/w>ConfigMap/default/cm:env A']);
    expect(from(ctr({ env: [{ name: 'B', valueFrom: { secretKeyRef: { name: 'sec' } } }] }))).toEqual(['Deployment/default/w>Secret/default/sec:env B']);
  });
  it('hosts in env values, args and commands resolve to services (also from init containers)', () => {
    expect(from(ctr({ env: [{ name: 'C', value: 'http://api.prod.svc.cluster.local' }] }))).toEqual(['Deployment/default/w>Service/prod/api:env C']);
    expect(from(ctr({ env: [{ name: 'D', value: 'http://api.svc' }] }))).toEqual([]); // api.svc lives in default, where there is no api
    expect(from(ctr({ env: [{ name: 'D', value: 'http://local.svc' }] }))).toEqual(['Deployment/default/w>Service/default/local:env D']);
    expect(from(ctr({ env: [{ name: 'E', value: 'http://local.prod:1' }] }))).toEqual([]);
    expect(from(ctr({ env: [{ name: 'E', value: 'http://api.prod:1' }] }))).toEqual(['Deployment/default/w>Service/prod/api:env E']);
    expect(from(ctr({ env: [{ name: 'F', value: 'http://nope.example.com' }, { name: 'G', value: 5 }, { name: 'H' }] }))).toEqual([]);
    expect(from({ initContainers: [{ name: 'i', image: 'busybox', command: ['sh', 'http://local:80', 7] }] })).toEqual(['Deployment/default/w>Service/default/local:arg']);
    expect(from({ initContainers: [{ name: 'i', image: 'busybox', args: ['--url=http://api.prod.svc:80', null] }] })).toEqual(['Deployment/default/w>Service/prod/api:arg']);
    expect(from({ initContainers: [{ name: 'i', image: 'busybox', args: [null, 'http://nope.example.com'] }] })).toEqual([]);
    expect(from({ containers: [{ name: 'no-image' }], initContainers: [{ name: 'i' }] })).toEqual([]);
  });
  it('workloads without a pod spec, containers or volumes still parse; items without a kind are dropped', () => {
    const m = parse(
      { apiVersion: 'batch/v1', kind: 'Job', metadata: meta('j'), spec: {} },
      dep('only-init', { initContainers: [{ name: 'i', image: 'busybox' }] }),
      dep('nocontainers', { volumes: [] }),
      { items: [{ apiVersion: 'v1', kind: 'ConfigMap', metadata: meta('inner') }] },
      { apiVersion: 'v1', kind: 'List', items: [{ apiVersion: 'v1', kind: 'ConfigMap', metadata: meta('listed') }] },
      { apiVersion: 'v1', kind: 'Widget', metadata: meta('w') },
    );
    const ids = m.resources.map((r) => r.id);
    expect(ids).toContain('Job/default/j');
    expect(ids).toContain('ConfigMap/default/listed');
    expect(ids).not.toContain('ConfigMap/default/inner');
    expect(m.warnings.join('\n')).toMatch(/Unknown kinds .*Widget/);
  });
});
