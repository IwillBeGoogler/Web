// Shared generator for provider icon packs (AWS, GCP, Azure, Kubernetes, other clouds, CNCF).
// A build script collects items { id?, label, sub:{id,label}, svg, aliases?, tags?, kind?, preset? } and calls writeProvider().
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeSvg, isUnsafe, scopeIds } from './sanitize.mjs';
import { auditSvgBody } from '../src/lib/svgAudit.ts';

export const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const normLabel = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** category / keyword rules -> extra tags (shared by all providers) */
const KEYWORD_TAGS = [
  [/sql|dynamo|aurora|\brds\b|redshift|neptune|documentdb|elasticache|memorydb|keyspaces|timestream|spanner|bigtable|firestore|cosmos|datastore|memorystore|alloydb|database|cassandra|mongodb|redis/i, ['database']],
  [/lambda|fargate|cloud functions|cloud run|app runner|functions|serverless|app engine/i, ['serverless', 'compute']],
  [/\bs3\b|storage|blob|glacier|\befs\b|\bebs\b|fsx|filestore|bucket|disk|backup/i, ['storage']],
  [/sqs|sns|kinesis|\bmsk\b|eventbridge|pub\/?sub|service bus|event hub|event grid|mq\b|queue|stream|kafka/i, ['messaging']],
  [/cloudwatch|monitor|trace|x-ray|logging|observab|insights|prometheus|grafana/i, ['monitoring']],
  [/kubernetes|\beks\b|\bgke\b|\baks\b|k8s|container|\becs\b|\becr\b|docker/i, ['container']],
  [/iam|cognito|kms|secrets|guard|shield|waf|firewall|security|identity|certificate|vault|defender|sentinel/i, ['security']],
  [/vpc|route ?53|cloudfront|load balanc|api gateway|cdn|direct connect|transit|nat|gateway|vpn|dns|network|front door|traffic manager/i, ['network']],
  [/sagemaker|bedrock|rekognition|comprehend|vertex|machine learning|\bai\b|openai|cognitive|translate|textract|polly|lex\b/i, ['ml', 'ai']],
  [/codepipeline|codebuild|codecommit|codedeploy|cloud build|devops|pipelines|artifact|repos/i, ['ci-cd']],
  [/cloudformation|terraform|cdk|deployment manager|\barm\b|bicep|resource manager/i, ['iac']],
  [/athena|glue|emr|quicksight|bigquery|dataflow|dataproc|synapse|data factory|analytics|databricks|lake formation/i, ['analytics']],
  [/\bec2\b|compute engine|virtual machine|\bvm\b|instance|batch|lightsail|compute/i, ['compute']],
];

export function inferTags(label, extra = []) {
  const t = new Set(extra);
  for (const [re, tags] of KEYWORD_TAGS) if (re.test(label)) for (const x of tags) t.add(x);
  return [...t];
}

/**
 * @param {string} root project root
 * @param {{ provider: string, providerLabel: string, tags?: string[], items: any[], subOrder?: string[], legacyLabels?: Map<string,string> }} cfg
 *   legacyLabels: normalised label -> existing catalog id; matching items reuse that id (and the old id's icon is overridden).
 */
export function writeProvider(root, cfg) {
  const { provider, providerLabel, items, legacyLabels = new Map() } = cfg;
  const dir = join(root, 'src/data/icons/cloud');
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.startsWith(`${provider}-`) && f.endsWith('.pack.ts')) writeFileSync(join(dir, f), 'export default {};\n'); // reset stale (no rm)

  const usedIds = new Set();
  const subs = new Map(); // subId -> { label, ids }
  const defs = [];
  const packIcons = new Map(); // packName -> { key: icon }
  const sizes = new Map();
  const refs = {};
  const overrides = {};
  const problems = [];
  for (const it of items) {
    const legacyHit = legacyLabels.get(normLabel(it.label));
    if (cfg.keepLegacyIcons && legacyHit && !usedIds.has(legacyHit)) {
      // the catalog already shows this project with a real logo: list it in this section, keep its icon
      usedIds.add(legacyHit);
      const tags0 = [...new Set([provider, ...(cfg.tags ?? []), ...(it.tags ?? [])])];
      defs.push({ id: legacyHit, iconId: legacyHit, label: it.label, aliases: it.aliases ?? [], tags: tags0, sub: it.sub.id, kind: 'icon' });
      const s0 = subs.get(it.sub.id) ?? { id: it.sub.id, label: it.sub.label, ids: [] };
      s0.ids.push(legacyHit);
      subs.set(it.sub.id, s0);
      continue;
    }
    if (it.reuseIconId) {
      // extra item that reuses an existing icon (no svg of its own)
      if (usedIds.has(it.id)) continue;
      usedIds.add(it.id);
      const tagsR = [...new Set([provider, ...(cfg.tags ?? []), ...(it.tags ?? [])])];
      defs.push({ id: it.id, iconId: it.reuseIconId, label: it.label, aliases: it.aliases ?? [], tags: tagsR, sub: it.sub.id, kind: 'icon' });
      const sR = subs.get(it.sub.id) ?? { id: it.sub.id, label: it.sub.label, ids: [] };
      sR.ids.push(it.id);
      subs.set(it.sub.id, sR);
      continue;
    }
    let svg;
    try {
      svg = sanitizeSvg(it.svg);
    } catch (e) {
      problems.push(`${it.label}: ${e.message}`);
      continue;
    }
    if (isUnsafe(svg.body)) {
      problems.push(`${it.label}: unsafe markup`);
      continue;
    }
    const audit = auditSvgBody(svg.body, svg.viewBox);
    if (!audit.ok) {
      problems.push(`${it.label}: ${audit.problems.join('; ')}`);
      continue;
    }
    const sl = slug(it.label);
    let id = it.id ?? (sl.startsWith(`${provider}-`) ? sl : `${provider}-${sl}`);
    const legacy = legacyLabels.get(normLabel(it.label));
    const iconKey = usedIds.has(id) ? `${id}-${usedIds.size}` : id; // pack key must be unique
    const itemId = legacy && !usedIds.has(legacy) ? legacy : iconKey;
    if (usedIds.has(itemId)) continue;
    usedIds.add(itemId);
    usedIds.add(id);
    const packName = `${provider}-${it.sub.id}`;
    const body = scopeIds(svg.body, `i-${iconKey}`);
    let part = sizes.get(packName) ?? { n: 1, size: 0 };
    const bytes = body.length + 60;
    if (part.size + bytes > 240_000 && part.size > 0) part = { n: part.n + 1, size: 0 };
    part.size += bytes;
    sizes.set(packName, part);
    const pack = part.n > 1 ? `${packName}-${part.n}` : packName;
    (packIcons.get(pack) ?? packIcons.set(pack, {}).get(pack))[iconKey] = { viewBox: svg.viewBox, body };
    refs[iconKey] = `${pack}/${iconKey}`;
    if (itemId !== iconKey) overrides[itemId] = `${pack}/${iconKey}`;
    const tags = [...new Set([provider, ...(cfg.tags ?? []), ...(it.tags ?? []), ...inferTags(`${it.label} ${(it.aliases ?? []).join(' ')}`, [])])];
    defs.push({ id: itemId, iconId: itemId === iconKey ? iconKey : itemId, label: it.label, aliases: it.aliases ?? [], tags, sub: it.sub.id, kind: it.kind ?? 'icon', ...(it.preset ? { preset: it.preset } : {}), ...(it.subtitle ? { subtitle: it.subtitle } : {}) });
    const s = subs.get(it.sub.id) ?? { id: it.sub.id, label: it.sub.label, ids: [] };
    s.ids.push(itemId);
    subs.set(it.sub.id, s);
  }
  for (const [pack, icons] of packIcons) {
    writeFileSync(join(dir, `${pack}.pack.ts`), `// GENERATED by scripts/build-${provider}-icons - do not edit.\nimport type { BrandIcon } from '../types';\nconst icons: Record<string, BrandIcon> = ${JSON.stringify(icons)};\nexport default icons;\n`);
  }
  const order = cfg.subOrder ?? [...subs.keys()].sort();
  const section = { id: provider, label: providerLabel, subs: order.filter((k) => subs.has(k)).map((k) => subs.get(k)) };
  const packNames = [...packIcons.keys()];
  writeFileSync(
    join(dir, `${cfg.file ?? provider}.generated.ts`),
    `// GENERATED by scripts/build-${provider}-icons - do not edit.
import type { BrandIcon } from '../types';
export interface CloudDef { id: string; iconId: string; label: string; aliases: string[]; tags: string[]; sub: string; kind: 'icon' | 'group'; subtitle?: string; preset?: { width: number; height: number; data: Record<string, unknown> } }
export const REFS: Record<string, string> = ${JSON.stringify(refs)};
export const LOADERS: Record<string, () => Promise<{ default: Record<string, BrandIcon> }>> = {
${packNames.map((p) => `  ${JSON.stringify(p)}: () => import('./${p}.pack'),`).join('\n')}
};
/** legacy catalog ids whose icon is replaced by the official one */
export const OVERRIDES: Record<string, string> = ${JSON.stringify(overrides)};
export const DEFS: CloudDef[] = ${JSON.stringify(defs)};
export const SECTION = ${JSON.stringify(section)};
`,
  );
  return { count: defs.length, packs: packNames.length, problems, overrides: Object.keys(overrides).length };
}
