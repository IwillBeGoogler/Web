import { buildCloudModel, classify, norm, type CloudRes, type CloudRule } from './aws';
import { parseHcl, type HclBlock } from './hcl';
import { InfraError, type InfraFile, type InfraModel } from './types';

const SUBTITLE_ATTRS = ['instance_type', 'instance_class', 'machine_type', 'node_type', 'runtime', 'engine', 'load_balancer_type', 'size'];
const unquote = (s: string | undefined): string | undefined => (s && /^"[^"$]*"$/.test(s) ? s.slice(1, -1) : undefined);

/** `aws_vpc.main` / `module.net` names mentioned in an expression (references to `data.` sources are ignored) */
export function referencedIds(expr: string, known: Set<string>): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/(?<![\w.])(?<!data\.)([a-z][a-z0-9]*_[a-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    const id = `${m[1]}.${m[2]}`;
    if (known.has(id)) out.push(id);
  }
  for (const m of expr.matchAll(/(?<![\w.])module\.([A-Za-z_][A-Za-z0-9_-]*)/g)) if (known.has(`module.${m[1]}`)) out.push(`module.${m[1]}`);
  return [...new Set(out)];
}

const port = (b: HclBlock): string => {
  const from = b.attrs.from_port?.trim();
  const to = b.attrs.to_port?.trim();
  return from && to && from !== to ? `${from}-${to}` : from ?? to ?? '';
};

export function parseTerraform(files: InfraFile[]): InfraModel {
  const warnings: string[] = [];
  const blocks: HclBlock[] = [];
  for (const f of files) {
    try {
      blocks.push(...parseHcl(f.text).blocks);
    } catch (e) {
      throw new InfraError(`${f.name}: ${(e as Error).message}`);
    }
  }
  const decl = blocks.filter((b) => (b.type === 'resource' && b.labels.length === 2) || (b.type === 'module' && b.labels.length === 1));
  const idOf = (b: HclBlock) => (b.type === 'module' ? `module.${b.labels[0]}` : `${b.labels[0]}.${b.labels[1]}`);
  const known = new Set(decl.map(idOf));
  const items: CloudRes[] = [];
  const rules: CloudRule[] = [];
  const seen = new Set<string>();

  for (const b of decl) {
    const id = idOf(b);
    if (seen.has(id)) { warnings.push(`${id} is declared twice; the first one is used`); continue; }
    seen.add(id);
    const type = b.type === 'module' ? 'module' : b.labels[0];
    const name = b.type === 'module' ? b.labels[0] : b.labels[1];
    const refs: Record<string, string[]> = {};
    const add = (attr: string, ids: string[]) => {
      if (!ids.length) return;
      const k = norm(attr);
      refs[k] = [...new Set([...(refs[k] ?? []), ...ids])];
    };
    const sgRules: { sources: string[]; port: string }[] = [];
    const walk = (blk: HclBlock, top: boolean) => {
      for (const [attr, expr] of Object.entries(blk.attrs)) {
        if (top && attr === 'depends_on') continue;
        add(attr, referencedIds(expr, known).filter((x) => x !== id));
      }
      for (const nb of blk.blocks) {
        if (classify(type) === 'sg' && (nb.type === 'ingress')) {
          sgRules.push({ sources: referencedIds(nb.attrs.security_groups ?? '', known), port: port(nb) });
          continue;
        }
        if (classify(type) === 'sg' && nb.type === 'egress') continue;
        walk(nb, false);
      }
    };
    walk(b, true);
    const explicit = referencedIds(b.attrs.depends_on ?? '', known);
    let subtitle: string | undefined;
    for (const a of SUBTITLE_ATTRS) { subtitle = unquote(b.attrs[a]); if (subtitle) break; }
    items.push({ id, type, name, refs, explicit, subtitle, mapPublic: /^true$/i.test(b.attrs.map_public_ip_on_launch ?? ''), rules: sgRules });
    if (classify(type) === 'sg_rule' && /ingress/i.test(unquote(b.attrs.type) ?? 'ingress')) {
      const target = referencedIds(b.attrs.security_group_id ?? '', known);
      const src = referencedIds(b.attrs.source_security_group_id ?? b.attrs.referenced_security_group_id ?? '', known);
      for (const t of target) rules.push({ target: t, sources: src, port: port(b) });
    }
  }
  for (const it of items) if (classify(it.type) === 'sg') for (const r of it.rules ?? []) rules.push({ target: it.id, sources: r.sources, port: r.port });
  if (!items.length) warnings.push('No resources found in the Terraform files');
  return buildCloudModel('terraform', items, rules, warnings);
}
