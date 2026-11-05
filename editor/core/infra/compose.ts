import { iconForImage } from './icons';
import { finalizeModel } from './finalize';
import { InfraError, type InfraEdgeRaw, type InfraFile, type InfraModel, type InfraRes } from './types';
import { urlHosts } from './util';
import { yamlDocuments } from './yamlish';

type Obj = Record<string, any>;

export function isCompose(doc: unknown): boolean {
  return !!doc && typeof doc === 'object' && !Array.isArray(doc) && typeof (doc as Obj).services === 'object' && (doc as Obj).services !== null && !('apiVersion' in (doc as Obj));
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.keys(v) : v ? [String(v)] : []);

export function parseCompose(files: InfraFile[]): InfraModel {
  const docs: Obj[] = [];
  for (const f of files) for (const d of yamlDocuments(f.text, f.name)) if (isCompose(d)) docs.push(d as Obj);
  if (!docs.length) throw new InfraError('No docker-compose services found (expected a top-level "services:")');
  const warnings: string[] = [];
  // later files override earlier ones, like `docker compose -f a -f b`
  const services: Obj = {};
  const networks = new Set<string>();
  const volumes = new Set<string>();
  for (const d of docs) {
    for (const [n, s] of Object.entries(d.services as Obj)) services[n] = { ...(services[n] ?? {}), ...(s as Obj) };
    for (const n of Object.keys(d.networks ?? {})) networks.add(n);
    for (const n of Object.keys(d.volumes ?? {})) volumes.add(n);
  }
  const resources: InfraRes[] = [];
  const edges: InfraEdgeRaw[] = [];
  const usedNets = new Set<string>();
  const names = new Set(Object.keys(services));
  for (const [name, s] of Object.entries(services) as [string, Obj][]) {
    const nets = asList(s.networks).filter((n) => n !== 'default');
    const net = nets[0];
    if (net) usedNets.add(net);
    const ports = (s.ports ?? []).map((p: unknown) => {
      if (typeof p === 'object' && p) return String((p as Obj).published ?? (p as Obj).target);
      const parts = String(p).replace(/\/\w+$/, '').split(':');
      return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    });
    const image = typeof s.image === 'string' ? s.image : undefined;
    const detail = image ?? (s.build ? `build ${typeof s.build === 'string' ? s.build : (s.build as Obj).context ?? '.'}` : '');
    const subtitle = [detail, ports.length ? ports.map((p: string) => `:${p}`).join(' ') : ''].filter(Boolean).join(' · ');
    resources.push({ id: `svc/${name}`, type: 'compose-service', kind: 'service', name, subtitle: subtitle || undefined, icons: [iconForImage(image)].filter((x): x is string => !!x), groupOf: net ? `net/${net}` : undefined });
  }
  for (const n of usedNets) resources.push({ id: `net/${n}`, type: 'compose-network', kind: 'network', name: n, group: true, groupKind: 'network' });
  const volUsed = new Set<string>();
  for (const [name, s] of Object.entries(services) as [string, Obj][]) {
    const from = `svc/${name}`;
    for (const dep of asList(s.depends_on)) if (names.has(dep)) edges.push({ from, to: `svc/${dep}`, label: 'depends on' });
    for (const l of asList(s.links)) { const t = l.split(':')[0]; if (names.has(t)) edges.push({ from, to: `svc/${t}`, label: 'link' }); }
    const env: [string, string][] = Array.isArray(s.environment)
      ? (s.environment as unknown[]).map((e) => { const [k, ...v] = String(e).split('='); return [k, v.join('=')] as [string, string]; })
      : Object.entries(s.environment ?? {}).map(([k, v]) => [k, String(v ?? '')] as [string, string]);
    for (const [k, v] of env) for (const host of urlHosts(v)) if (names.has(host)) edges.push({ from, to: `svc/${host}`, label: `env ${k}` });
    for (const v of s.volumes ?? []) {
      const src = typeof v === 'object' && v ? String((v as Obj).source ?? '') : String(v).split(':')[0];
      if (src && volumes.has(src) && !/^[./~]/.test(src)) { volUsed.add(src); edges.push({ from, to: `vol/${src}`, label: 'mount' }); }
    }
  }
  for (const v of volUsed) resources.push({ id: `vol/${v}`, type: 'compose-volume', kind: 'volume', name: v, subtitle: 'volume' });
  void networks;
  return finalizeModel({ format: 'compose', resources, edges, warnings });
}
