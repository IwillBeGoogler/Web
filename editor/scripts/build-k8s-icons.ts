// node scripts/build-k8s-icons.ts [cache-dir]   Official Kubernetes community icons (github.com/kubernetes/community/icons).
// Downloads the unlabeled SVGs into cache-dir (if missing), then generates the K8s pack.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = process.argv[2] ?? join(root, 'node_modules/.cache/k8s-icons');
mkdirSync(cache, { recursive: true });
const RAW = 'https://raw.githubusercontent.com/kubernetes/community/master/icons/svg';

type K = { file: string; path: string; label: string; aliases: string[]; sub: string; tags?: string[] };
const R = (file: string, label: string, aliases: string[], sub = 'workloads', tags: string[] = []): K => ({ file, path: `resources/unlabeled/${file}.svg`, label, aliases, sub, tags });
const LIST: K[] = [
  R('pod', 'Pod', ['pods']), R('deploy', 'Deployment', ['deployment', 'deploy']), R('rs', 'ReplicaSet', ['replicaset', 'rs']), R('sts', 'StatefulSet', ['statefulset', 'sts']),
  R('ds', 'DaemonSet', ['daemonset', 'ds']), R('job', 'Job', ['batch job']), R('cronjob', 'CronJob', ['cron']), R('hpa', 'Horizontal Pod Autoscaler', ['hpa', 'autoscaler']),
  R('svc', 'Service', ['svc', 'clusterip', 'loadbalancer', 'nodeport'], 'networking'), R('ing', 'Ingress', ['ing', 'ingress controller'], 'networking'), R('ep', 'Endpoints', ['ep', 'endpointslice'], 'networking'), R('netpol', 'Network Policy', ['netpol', 'networkpolicy'], 'networking', ['security']),
  R('cm', 'ConfigMap', ['cm', 'config'], 'config'), R('secret', 'Secret', ['secrets'], 'config', ['security']), R('ns', 'Namespace', ['ns'], 'config'), R('quota', 'Resource Quota', ['quota', 'resourcequota'], 'config'), R('limits', 'Limit Range', ['limits', 'limitrange'], 'config'), R('crd', 'Custom Resource Definition', ['crd', 'custom resource', 'operator'], 'config'),
  R('pv', 'Persistent Volume', ['pv'], 'storage', ['storage']), R('pvc', 'Persistent Volume Claim', ['pvc'], 'storage', ['storage']), R('sc', 'Storage Class', ['sc', 'storageclass'], 'storage', ['storage']), R('vol', 'Volume', ['volume'], 'storage', ['storage']),
  R('sa', 'Service Account', ['sa', 'serviceaccount'], 'rbac', ['security', 'identity']), R('role', 'Role', ['role'], 'rbac', ['security']), R('rb', 'Role Binding', ['rb', 'rolebinding'], 'rbac', ['security']), R('c-role', 'Cluster Role', ['clusterrole', 'c-role'], 'rbac', ['security']), R('crb', 'Cluster Role Binding', ['crb', 'clusterrolebinding'], 'rbac', ['security']), R('psp', 'Pod Security Policy', ['psp', 'podsecuritypolicy'], 'rbac', ['security']), R('user', 'User', ['k8s user'], 'rbac', ['identity']), R('group', 'Group', ['k8s group'], 'rbac', ['identity']),
  { file: 'api', path: 'control_plane_components/labeled/api.svg', label: 'kube-apiserver', aliases: ['api server', 'apiserver'], sub: 'control-plane' },
  { file: 'c-m', path: 'control_plane_components/labeled/c-m.svg', label: 'kube-controller-manager', aliases: ['controller manager'], sub: 'control-plane' },
  { file: 'c-c-m', path: 'control_plane_components/labeled/c-c-m.svg', label: 'cloud-controller-manager', aliases: ['ccm'], sub: 'control-plane' },
  { file: 'sched', path: 'control_plane_components/labeled/sched.svg', label: 'kube-scheduler', aliases: ['scheduler'], sub: 'control-plane' },
  { file: 'kubelet', path: 'control_plane_components/labeled/kubelet.svg', label: 'kubelet', aliases: ['node agent'], sub: 'control-plane' },
  { file: 'k-proxy', path: 'control_plane_components/labeled/k-proxy.svg', label: 'kube-proxy', aliases: ['proxy'], sub: 'control-plane' },
  { file: 'control-plane', path: 'infrastructure_components/unlabeled/control-plane.svg', label: 'Control plane', aliases: ['master', 'control plane node'], sub: 'control-plane' },
  { file: 'etcd', path: 'infrastructure_components/unlabeled/etcd.svg', label: 'etcd (Kubernetes)', aliases: ['etcd', 'cluster store'], sub: 'control-plane', tags: ['cncf', 'database'] },
  { file: 'node', path: 'infrastructure_components/unlabeled/node.svg', label: 'Node', aliases: ['worker node', 'k8s node'], sub: 'control-plane' },
];
const SUBS: Record<string, string> = { groups: 'Groups & containers', workloads: 'Workloads', networking: 'Networking', config: 'Config & namespaces', storage: 'Storage', rbac: 'Access control', 'control-plane': 'Control plane & nodes' };

/** Inkscape output carries editor metadata: strip it (and its namespaced attributes) before sanitising. */
const clean = (svg: string) =>
  svg
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/<sodipodi:[^>]*\/>/gi, '')
    .replace(/<sodipodi:[\s\S]*?<\/sodipodi:[^>]*>/gi, '')
    .replace(/\s(?:inkscape|sodipodi):[\w-]+="[^"]*"/gi, '')
    .replace(/\sxmlns:(?:dc|cc|rdf|sodipodi|inkscape)="[^"]*"/gi, '');

async function get(k: K): Promise<string> {
  const f = join(cache, `${k.file}-${k.path.includes('labeled/') && !k.path.includes('unlabeled') ? 'l' : 'u'}.svg`);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const res = await fetch(`${RAW}/${k.path}`);
  if (!res.ok) throw new Error(`${k.path}: HTTP ${res.status}`);
  const t = await res.text();
  writeFileSync(f, t);
  return t;
}

const items: any[] = [];
for (const k of LIST) items.push({ label: k.label, sub: { id: k.sub, label: SUBS[k.sub] }, svg: clean(await get(k)), aliases: k.aliases, tags: ['k8s', 'container', 'cncf', ...(k.tags ?? [])] });
const ns = LIST.find((k) => k.file === 'ns')!;
for (const [id, label, dashed] of [['k8s-group-namespace', 'Namespace', true], ['k8s-group-cluster', 'Kubernetes cluster', false], ['k8s-group-node', 'Node (group)', true]] as const)
  items.push({ id, label, sub: { id: 'groups', label: SUBS.groups }, svg: clean(await get(ns)), kind: 'group', aliases: ['group', 'boundary'], tags: ['k8s', 'group', 'boundary'], preset: { width: 420, height: 280, data: { label, stroke: '#326CE5', strokeStyle: dashed ? 'dashed' : 'solid', strokeWidth: 1.5, fill: '#326CE5', fillOpacity: 4, border: true } } });
const legacy = new Map<string, string>(CATALOG_DEFS.filter((d) => d.tags.includes('k8s')).map((d) => [normLabel(d.label), d.id]));
const r = writeProvider(root, { provider: 'k8s', providerLabel: 'Kubernetes', tags: ['kubernetes', 'cncf', 'open-source'], items, legacyLabels: legacy, subOrder: ['groups', 'workloads', 'networking', 'config', 'storage', 'rbac', 'control-plane'] });
console.log(`k8s: ${r.count} items in ${r.packs} packs`);
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
