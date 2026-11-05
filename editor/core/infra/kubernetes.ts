import { iconForImage } from './icons';
import { finalizeModel } from './finalize';
import { InfraError, type InfraEdgeRaw, type InfraFile, type InfraModel, type InfraRes } from './types';
import { imageBase, urlHosts } from './util';
import { yamlDocuments } from './yamlish';

type Obj = Record<string, any>;
const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Pod']);
const ICONS: Record<string, string> = {
  Deployment: 'k8s-deployment', StatefulSet: 'k8s-statefulset', DaemonSet: 'k8s-daemonset', ReplicaSet: 'k8s-replicaset', Job: 'k8s-job', CronJob: 'k8s-cronjob', Pod: 'k8s-pod',
  Service: 'k8s-service', Ingress: 'k8s-ingress', ConfigMap: 'k8s-configmap', Secret: 'k8s-secret', PersistentVolumeClaim: 'k8s-persistent-volume-claim', PersistentVolume: 'k8s-persistent-volume',
  HorizontalPodAutoscaler: 'k8s-horizontal-pod-autoscaler', NetworkPolicy: 'k8s-network-policy', StorageClass: 'k8s-storage-class',
};
/** kinds that are not drawn: access control and scheduling details */
const IGNORED = new Set(['Namespace', 'ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding', 'ResourceQuota', 'LimitRange', 'PodDisruptionBudget', 'PriorityClass', 'Lease', 'Event', 'CustomResourceDefinition', 'StorageClass', 'NetworkPolicy', 'ValidatingWebhookConfiguration', 'MutatingWebhookConfiguration']);

const podSpecOf = (o: Obj): Obj | undefined => (o.kind === 'Pod' ? o.spec : o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template?.spec : o.spec?.template?.spec);
const podLabelsOf = (o: Obj): Record<string, string> => (o.kind === 'Pod' ? o.metadata?.labels : o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template?.metadata?.labels : o.spec?.template?.metadata?.labels) ?? {};

function flatten(docs: unknown[]): Obj[] {
  const out: Obj[] = [];
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Obj;
    if (Array.isArray(o.items) && /List$/.test(String(o.kind ?? ''))) out.push(...flatten(o.items));
    else if (typeof o.kind === 'string' && o.metadata?.name !== undefined) out.push(o);
    else if (typeof o.kind === 'string' && o.metadata === undefined && !/List$/.test(o.kind)) out.push(o);
  }
  return out;
}

export function isKubernetes(docs: unknown[]): boolean {
  return flatten(docs).some((o) => typeof o.apiVersion === 'string' && typeof o.kind === 'string') || docs.some((d) => !!d && typeof d === 'object' && typeof (d as Obj).apiVersion === 'string' && typeof (d as Obj).kind === 'string');
}

export function parseKubernetes(files: InfraFile[]): InfraModel {
  const warnings: string[] = [];
  const objs: Obj[] = [];
  for (const f of files) objs.push(...flatten(yamlDocuments(f.text, f.name)));
  if (!objs.length) throw new InfraError('No Kubernetes objects found (expected documents with apiVersion and kind)');

  const nsOf = (o: Obj) => String(o.metadata?.namespace ?? 'default');
  const keyOf = (o: Obj) => `${o.kind}/${nsOf(o)}/${o.metadata?.name ?? '?'}`;
  const resources: InfraRes[] = [];
  const edges: InfraEdgeRaw[] = [];
  const known = new Map<string, Obj>();
  const ignored = new Map<string, number>();
  const unknown = new Set<string>();
  const namespaces = new Set<string>();

  for (const o of objs) {
    if (IGNORED.has(o.kind)) { ignored.set(o.kind, (ignored.get(o.kind) ?? 0) + 1); continue; }
    if (!ICONS[o.kind] && !WORKLOADS.has(o.kind)) unknown.add(o.kind);
    const key = keyOf(o);
    if (known.has(key)) { warnings.push(`${key} appears twice; the first one is used`); continue; }
    known.set(key, o);
  }
  for (const [key, o] of known) {
    const ns = nsOf(o);
    namespaces.add(ns);
    const spec = podSpecOf(o);
    const images: string[] = (spec?.containers ?? []).map((c: Obj) => String(c.image ?? '')).filter(Boolean);
    const productIcon = WORKLOADS.has(o.kind) ? images.map(iconForImage).find(Boolean) : undefined;
    const replicas = o.spec?.replicas;
    const port = o.kind === 'Service' ? (o.spec?.ports ?? []).map((p: Obj) => p.port).filter(Boolean).slice(0, 3).join(', ') : '';
    const subtitle = `${o.kind}${replicas && WORKLOADS.has(o.kind) ? ` ×${replicas}` : ''}${port ? ` :${port}` : ''}`;
    resources.push({
      id: key, type: o.kind, kind: o.kind, name: String(o.metadata?.name), subtitle,
      icons: [...(productIcon ? [productIcon] : []), ICONS[o.kind] ?? 'k8s-custom-resource-definition'],
      groupOf: `ns/${ns}`,
    });
  }
  for (const ns of namespaces) resources.push({ id: `ns/${ns}`, type: 'Namespace', kind: 'Namespace', name: ns, group: true, groupKind: 'namespace' });

  const find = (kind: string, ns: string, name: unknown) => (name !== undefined ? known.get(`${kind}/${ns}/${name}`) && `${kind}/${ns}/${name}` : undefined);
  const services = [...known.entries()].filter(([, o]) => o.kind === 'Service');
  const hostToService = (host: string, ns: string): string | undefined => {
    const h = host.toLowerCase();
    let name = h;
    let hns = ns;
    const m = /^([a-z0-9-]+)\.([a-z0-9-]+)\.svc(?:\.cluster\.local)?$/.exec(h) ?? /^([a-z0-9-]+)\.svc(?:\.cluster\.local)?$/.exec(h);
    if (m) { name = m[1]; if (m[2]) hns = m[2]; }
    else if (h.includes('.')) {
      const p = h.split('.');
      if (p.length === 2 && known.has(`Service/${p[1]}/${p[0]}`)) { name = p[0]; hns = p[1]; } else return undefined;
    }
    return find('Service', hns, name);
  };

  for (const [key, o] of known) {
    const ns = nsOf(o);
    if (o.kind === 'Service') {
      const sel: Record<string, string> = o.spec?.selector ?? {};
      if (!Object.keys(sel).length) continue;
      const ports = (o.spec?.ports ?? [])[0];
      const label = ports ? `:${ports.port}${ports.targetPort !== undefined && String(ports.targetPort) !== String(ports.port) ? `→${ports.targetPort}` : ''}` : undefined;
      for (const [wkey, w] of known) {
        if (!WORKLOADS.has(w.kind) || nsOf(w) !== ns) continue;
        const labels = podLabelsOf(w);
        if (Object.entries(sel).every(([k, v]) => labels[k] === v)) edges.push({ from: key, to: wkey, label });
      }
    } else if (o.kind === 'Ingress') {
      const rules: Obj[] = o.spec?.rules ?? [];
      for (const r of rules)
        for (const p of r.http?.paths ?? []) {
          const name = p.backend?.service?.name ?? p.backend?.serviceName;
          const svc = find('Service', ns, name);
          if (svc) edges.push({ from: key, to: svc, label: `${r.host ?? '*'}${p.path ?? '/'}` });
        }
      const def = o.spec?.defaultBackend?.service?.name ?? o.spec?.backend?.serviceName;
      const dsvc = find('Service', ns, def);
      if (dsvc) edges.push({ from: key, to: dsvc, label: 'default' });
    } else if (o.kind === 'HorizontalPodAutoscaler') {
      const t = o.spec?.scaleTargetRef;
      const target = t ? find(String(t.kind), ns, t.name) : undefined;
      if (target) edges.push({ from: key, to: target, label: `${o.spec?.minReplicas ?? 1}–${o.spec?.maxReplicas ?? '?'}` });
    } else if (WORKLOADS.has(o.kind)) {
      const spec = podSpecOf(o) ?? {};
      for (const v of spec.volumes ?? []) {
        const cm = find('ConfigMap', ns, v.configMap?.name);
        if (cm) edges.push({ from: key, to: cm, label: 'volume' });
        const sc = find('Secret', ns, v.secret?.secretName);
        if (sc) edges.push({ from: key, to: sc, label: 'volume' });
        const pvc = find('PersistentVolumeClaim', ns, v.persistentVolumeClaim?.claimName);
        if (pvc) edges.push({ from: key, to: pvc, label: 'mount' });
      }
      for (const c of [...(spec.containers ?? []), ...(spec.initContainers ?? [])] as Obj[]) {
        for (const e of c.envFrom ?? []) {
          const cm = find('ConfigMap', ns, e.configMapRef?.name);
          if (cm) edges.push({ from: key, to: cm, label: 'envFrom' });
          const sc = find('Secret', ns, e.secretRef?.name);
          if (sc) edges.push({ from: key, to: sc, label: 'envFrom' });
        }
        for (const e of c.env ?? []) {
          const cm = find('ConfigMap', ns, e.valueFrom?.configMapKeyRef?.name);
          if (cm) edges.push({ from: key, to: cm, label: `env ${e.name}` });
          const sc = find('Secret', ns, e.valueFrom?.secretKeyRef?.name);
          if (sc) edges.push({ from: key, to: sc, label: `env ${e.name}` });
          if (typeof e.value === 'string')
            for (const host of urlHosts(e.value)) {
              const svc = hostToService(host, ns);
              if (svc) edges.push({ from: key, to: svc, label: `env ${e.name}` });
            }
        }
        for (const a of [...(c.args ?? []), ...(c.command ?? [])] as unknown[])
          if (typeof a === 'string') for (const host of urlHosts(a)) { const svc = hostToService(host, ns); if (svc) edges.push({ from: key, to: svc, label: 'arg' }); }
        void imageBase;
      }
    }
  }
  void services;
  if (unknown.size) warnings.push(`Unknown kinds shown as generic nodes: ${[...unknown].sort().join(', ')}`);
  if (ignored.size) warnings.push(`Not drawn: ${[...ignored.entries()].map(([k, n]) => `${n}× ${k}`).join(', ')}`);
  return finalizeModel({ format: 'kubernetes', resources, edges, warnings });
}
