import { buildCloudModel, classify, norm, type CloudRes, type CloudRule } from './aws';
import { InfraError, type InfraModel, type InfraRes } from './types';

interface JResource { address: string; type: string; name: string; values?: Record<string, unknown>; depends_on?: string[] }
interface JModule { address?: string; resources?: JResource[]; child_modules?: JModule[] }
interface JConfigModule { resources?: { address: string; expressions?: Record<string, unknown>; depends_on?: string[] }[]; module_calls?: Record<string, { expressions?: Record<string, unknown>; module?: JConfigModule }> }

const SUBTITLE_ATTRS = ['instance_type', 'instance_class', 'machine_type', 'node_type', 'runtime', 'engine', 'load_balancer_type', 'size'];

/** Terraform's JSON output of `terraform show -json` (a plan or a state) */
export function isTerraformJson(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false;
  const j = o as Record<string, unknown>;
  return typeof j.format_version === 'string' && (!!j.planned_values || !!j.values || !!j.configuration || !!j.prior_state || !!j.resource_changes);
}

function collect(m: JModule | undefined, out: JResource[]): void {
  for (const r of m?.resources ?? []) out.push(r);
  for (const c of m?.child_modules ?? []) collect(c, out);
}
/** every `references` array inside an expression tree, mapped to `type.name` (relative to `prefix`) */
function refsOf(expr: unknown, prefix: string, known: Set<string>, out: string[] = []): string[] {
  if (Array.isArray(expr)) for (const e of expr) refsOf(e, prefix, known, out);
  else if (expr && typeof expr === 'object') {
    for (const [k, v] of Object.entries(expr)) {
      if (k === 'references' && Array.isArray(v)) {
        for (const ref of v as string[]) {
          const m = /^((?:module\.[\w-]+\.)*)([a-z][a-z0-9]*_[a-z0-9_]+\.[\w-]+)/.exec(ref) ?? /^(module\.[\w-]+)$/.exec(ref);
          if (!m) continue;
          const id = ref.startsWith('module.') && !m[2] ? m[1] : `${prefix}${m[1] ?? ''}${m[2]}`;
          if (known.has(id)) out.push(id);
        }
      } else refsOf(v, prefix, known, out);
    }
  }
  return out;
}

export function parseTerraformJson(o: unknown): InfraModel {
  const j = o as { planned_values?: { root_module?: JModule }; values?: { root_module?: JModule }; prior_state?: { values?: { root_module?: JModule } }; configuration?: { root_module?: JConfigModule } };
  const root = j.planned_values?.root_module ?? j.values?.root_module ?? j.prior_state?.values?.root_module;
  if (!root) throw new InfraError('This Terraform JSON has no planned_values or values (was it produced by `terraform show -json`?)');
  const res: JResource[] = [];
  collect(root, res);
  const warnings: string[] = [];
  const known = new Set(res.map((r) => r.address));
  const modules = new Map<string, InfraRes>();
  const moduleOf = (address: string): string | undefined => {
    const m = /^((?:module\.[\w-]+(?:\[[^\]]*\])?\.)+)/.exec(address);
    if (!m) return undefined;
    const path = m[1].replace(/\.$/, '').replace(/\[[^\]]*\]/g, '');
    const parts = path.split('.').filter((_, i) => i % 2 === 1);
    let parent: string | undefined;
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).map((p) => `module.${p}`).join('.');
      if (!modules.has(id)) modules.set(id, { id, type: 'module', kind: '', name: parts[i], group: true, groupKind: 'module', groupOf: parent });
      parent = id;
    }
    return parent;
  };

  // configuration references (plans) keyed by resource address
  const cfn = new Map<string, { expressions?: Record<string, unknown>; depends_on?: string[] }>();
  const walkCfg = (m: JConfigModule | undefined, prefix: string) => {
    for (const r of m?.resources ?? []) cfn.set(prefix + r.address, r);
    for (const [name, call] of Object.entries(m?.module_calls ?? {})) walkCfg(call.module, `${prefix}module.${name}.`);
  };
  walkCfg(j.configuration?.root_module, '');

  // state values: identifiers (id / arn) of every resource
  const idIndex = new Map<string, string>();
  for (const r of res) for (const k of ['id', 'arn']) {
    const v = r.values?.[k];
    if (typeof v === 'string' && v.length >= 3) idIndex.set(v, r.address);
  }

  const items: CloudRes[] = [];
  const rules: CloudRule[] = [];
  for (const r of res) {
    const refs: Record<string, string[]> = {};
    const add = (attr: string, ids: string[]) => {
      const k = norm(attr);
      const set = new Set([...(refs[k] ?? []), ...ids.filter((x) => x !== r.address)]);
      if (set.size) refs[k] = [...set];
    };
    const prefix = /^((?:module\.[\w-]+\.)*)/.exec(r.address)?.[1] ?? '';
    const c = cfn.get(r.address);
    for (const [attr, expr] of Object.entries(c?.expressions ?? {})) add(attr, refsOf(expr, prefix, known));
    // value matching: an attribute whose value is another resource's id or arn
    const sgRules: { sources: string[]; port: string }[] = [];
    const scan = (v: unknown, attr: string, depth: number) => {
      if (depth > 6) return;
      if (typeof v === 'string') { const hit = idIndex.get(v); if (hit && hit !== r.address && attr !== 'id' && attr !== 'arn') add(attr, [hit]); }
      else if (Array.isArray(v)) v.forEach((x) => scan(x, attr, depth + 1));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, k, depth + 1);
    };
    for (const [attr, v] of Object.entries(r.values ?? {})) {
      if (classify(r.type) === 'sg' && attr === 'ingress' && Array.isArray(v)) {
        for (const rule of v as Record<string, unknown>[]) {
          const from = rule.from_port, to = rule.to_port;
          sgRules.push({ sources: ((rule.security_groups as string[] | undefined) ?? []).map((s) => idIndex.get(s)).filter((x): x is string => !!x), port: from === to || to === undefined ? String(from ?? '') : `${from}-${to}` });
        }
        continue;
      }
      scan(v, attr, 0);
    }
    const explicit = [...(r.depends_on ?? []), ...(c?.depends_on ?? [])].map((d) => prefix + d).filter((d) => known.has(d));
    let subtitle: string | undefined;
    for (const a of SUBTITLE_ATTRS) { const v = r.values?.[a]; if (typeof v === 'string' && v) { subtitle = v; break; } }
    items.push({ id: r.address, type: r.type, name: r.name, refs, explicit, subtitle, mapPublic: r.values?.map_public_ip_on_launch === true, rules: sgRules, module: moduleOf(r.address) });
  }
  for (const it of items) if (classify(it.type) === 'sg') for (const x of it.rules ?? []) rules.push({ target: it.id, sources: x.sources, port: x.port });
  if (!items.length) warnings.push('No resources found in the Terraform JSON');
  return buildCloudModel('terraform-json', items, rules, warnings, [...modules.values()]);
}
