import { buildCloudModel, classify, norm, type CloudRes, type CloudRule } from './aws';
import { InfraError, type InfraFile, type InfraModel } from './types';
import { yamlDocuments } from './yamlish';

type Obj = Record<string, any>;
const SUBTITLE_PROPS = ['InstanceType', 'DBInstanceClass', 'CacheNodeType', 'Runtime', 'Engine', 'Type', 'Scheme'];

export function isCloudFormation(o: unknown): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const j = o as Obj;
  return typeof j.AWSTemplateFormatVersion === 'string' || (typeof j.Resources === 'object' && j.Resources !== null && Object.values(j.Resources as Obj).some((r) => r && typeof (r as Obj).Type === 'string' && /^(AWS|Custom|Alexa)::/.test((r as Obj).Type)));
}

/** logical ids mentioned by Ref / Fn::GetAtt / Fn::Sub inside a property value */
function collectRefs(v: unknown, known: Set<string>, out: Set<string>): void {
  if (Array.isArray(v)) { for (const x of v) collectRefs(x, known, out); return; }
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v as Obj)) {
    if (k === 'Ref' && typeof x === 'string') { if (known.has(x)) out.add(x); }
    else if (k === 'Fn::GetAtt') {
      const id = Array.isArray(x) ? String(x[0]) : String(x).split('.')[0];
      if (known.has(id)) out.add(id);
    } else if (k === 'Fn::Sub') {
      const text = Array.isArray(x) ? String(x[0]) : String(x);
      for (const m of text.matchAll(/\$\{([A-Za-z0-9]+)(?:\.[\w.]+)?\}/g)) if (known.has(m[1])) out.add(m[1]);
      if (Array.isArray(x)) collectRefs(x[1], known, out);
    } else collectRefs(x, known, out);
  }
}

export function parseCloudFormation(files: InfraFile[]): InfraModel {
  const templates: Obj[] = [];
  for (const f of files) {
    const t = f.name.toLowerCase().endsWith('.json') || f.text.trimStart().startsWith('{') ? (() => { try { return JSON.parse(f.text) as Obj; } catch (e) { throw new InfraError(`${f.name}: JSON syntax error: ${(e as Error).message}`); } })() : yamlDocuments(f.text, f.name)[0];
    if (isCloudFormation(t)) templates.push(t as Obj);
  }
  if (!templates.length) throw new InfraError('No CloudFormation template found (expected a top-level "Resources:")');
  const resources: Obj = {};
  for (const t of templates) Object.assign(resources, t.Resources ?? {});
  const known = new Set(Object.keys(resources));
  const items: CloudRes[] = [];
  const rules: CloudRule[] = [];
  const warnings: string[] = [];
  for (const [id, r] of Object.entries(resources) as [string, Obj][]) {
    if (!r || typeof r.Type !== 'string') { warnings.push(`${id} has no Type and was skipped`); continue; }
    const refs: Record<string, string[]> = {};
    const add = (attr: string, ids: string[]) => {
      const k = norm(attr);
      const set = new Set([...(refs[k] ?? []), ...ids.filter((x) => x !== id)]);
      if (set.size) refs[k] = [...set];
    };
    const kind = classify(r.Type);
    const walk = (v: unknown, attr: string, depth: number) => {
      if (depth > 8) return;
      if (Array.isArray(v)) { for (const x of v) walk(x, attr, depth + 1); return; }
      if (!v || typeof v !== 'object') return;
      const found = new Set<string>();
      for (const key of Object.keys(v as Obj)) if (/^(Ref|Fn::GetAtt|Fn::Sub)$/.test(key)) collectRefs(v, known, found);
      if (found.size) { add(attr, [...found]); return; }
      for (const [k, x] of Object.entries(v as Obj)) walk(x, k, depth + 1);
    };
    const sgRules: { sources: string[]; port: string }[] = [];
    for (const [prop, val] of Object.entries((r.Properties ?? {}) as Obj)) {
      if (kind === 'sg' && prop === 'SecurityGroupIngress' && Array.isArray(val)) {
        for (const rule of val as Obj[]) {
          const src = new Set<string>();
          collectRefs(rule.SourceSecurityGroupId, known, src);
          const from = rule.FromPort, to = rule.ToPort;
          sgRules.push({ sources: [...src], port: from === undefined ? '' : from === to || to === undefined ? String(from) : `${from}-${to}` });
        }
        continue;
      }
      walk(val, prop, 0);
    }
    const explicit = [...new Set((Array.isArray(r.DependsOn) ? r.DependsOn : r.DependsOn ? [r.DependsOn] : []).map(String))].filter((d) => known.has(d));
    let subtitle: string | undefined;
    for (const p of SUBTITLE_PROPS) { const v = r.Properties?.[p]; if (typeof v === 'string' && v) { subtitle = v; break; } }
    items.push({ id, type: r.Type, name: id, refs, explicit, subtitle, mapPublic: r.Properties?.MapPublicIpOnLaunch === true || r.Properties?.MapPublicIpOnLaunch === 'true', rules: sgRules });
    if (kind === 'sg_rule') {
      const t = new Set<string>(), s = new Set<string>();
      collectRefs(r.Properties?.GroupId, known, t);
      collectRefs(r.Properties?.SourceSecurityGroupId, known, s);
      for (const x of t) rules.push({ target: x, sources: [...s], port: String(r.Properties?.FromPort ?? '') });
    }
  }
  for (const it of items) if (classify(it.type) === 'sg') for (const x of it.rules ?? []) rules.push({ target: it.id, sources: x.sources, port: x.port });
  return buildCloudModel('cloudformation', items, rules, warnings);
}
