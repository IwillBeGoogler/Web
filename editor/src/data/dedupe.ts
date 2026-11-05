import type { CatalogItem, CatalogSection } from './catalog';
import { ID_ALIASES } from './idAliases';

/** Sections whose listing is a "view" of items that live elsewhere: they only keep items that have no other home. */
/** Provider packs own their products (official icon): they win over the generic category sections. */
const PROVIDER_SECTIONS = new Set(['aws', 'gcp', 'azure', 'k8s', 'platforms']);
const DEMOTED_SECTIONS = new Set(['cncf', 'apache']);
/** Subsections that group items by product family rather than by role: lowest priority among the base sections. */
const DEMOTED_SUBS = new Set(['grafana-stack', 'mesh']);
/** Explicit canonical home (sub id) where "first listing wins" would pick the wrong one. */
const HOME_SUB: Record<string, string> = {
  temporal: 'workflow', airflow: 'workflow', zookeeper: 'discovery', etcd: 'discovery', consul: 'net-software',
  kubeflow: 'ai', sonarqube: 'testing', slack: 'chatops', telegram: 'chatops', email: 'comms', 'argo-workflows': 'workflow',
  victoriametrics: 'tsdb', influxdb: 'tsdb', clickhouse: 'olap', elasticsearch: 'db-search', opensearch: 'db-search',
  cadvisor: 'exporters', exporter: 'exporters', alloy: 'exporters', telegraf: 'exporters',
};
/** "stack" subs lose to the role-based sub that lists the same item; tags carry the cross-listing */
const PROVIDER_PREFIX: [RegExp, string][] = [[/^aws-/, 'AWS'], [/^gcp-/, 'GCP'], [/^azure-/, 'Azure'], [/^k8s-/, 'K8s']];
/** hand-picked display labels (win over the automatic provider prefix) */
export const LABEL_OVERRIDES: Record<string, string> = {
  'azure-pubsub': 'Azure Pub/Sub', 'gcp-iot-edge': 'GCP IoT Edge', 'azure-iot-edge': 'Azure IoT Edge',
  'azure-resource-group': 'Resource group (icon)', 'azure-subnet': 'Subnet (icon)', 'k8s-namespace': 'Namespace (icon)',
};

const rank = (sec: CatalogSection, subId: string): number => (PROVIDER_SECTIONS.has(sec.id) ? -1 : DEMOTED_SECTIONS.has(sec.id) ? 2 : DEMOTED_SUBS.has(subId) ? 1 : 0);

/**
 * Every item lives in exactly ONE section / sub-section. Cross-listing is expressed by tags (the id of every section that listed
 * the item is added as a tag), so `#tag` search and chips still find it.
 */
export function dedupeSections(sections: CatalogSection[]): CatalogSection[] {
  const home = new Map<string, { si: number; sub: string; r: number }>();
  sections.forEach((sec, si) => {
    for (const sub of sec.subs) for (const it of sub.items) {
      if (ID_ALIASES[it.id]) continue;
      const forced = HOME_SUB[it.id];
      const r = forced ? (forced === sub.id ? -1 : 9) : rank(sec, sub.id);
      const cur = home.get(it.id);
      if (!cur || r < cur.r) home.set(it.id, { si, sub: sub.id, r });
    }
  });
  const extraTags = new Map<string, Set<string>>();
  const extraAliases = new Map<string, Set<string>>();
  for (const sec of sections) for (const sub of sec.subs) for (const it of sub.items) {
    const t = extraTags.get(it.id) ?? new Set<string>();
    if (sec.id !== 'generic' && sec.id !== 'helpers') t.add(sec.id);
    for (const tag of it.tags) t.add(tag);
    extraTags.set(it.id, t);
    const a = extraAliases.get(it.id) ?? new Set<string>();
    for (const al of it.aliases) a.add(al);
    extraAliases.set(it.id, a);
  }
  const placed = new Set<string>();
  const out: CatalogSection[] = [];
  sections.forEach((sec, si) => {
    const subs = sec.subs.map((sub) => ({
      ...sub,
      items: sub.items.flatMap((it): CatalogItem[] => {
        const h = home.get(it.id);
        if (!h || h.si !== si || h.sub !== sub.id || placed.has(it.id)) return [];
        placed.add(it.id);
        return [{ ...it, tags: [...extraTags.get(it.id)!], aliases: [...extraAliases.get(it.id)!] }];
      }),
    })).filter((sub) => sub.items.length > 0);
    if (subs.length) out.push({ ...sec, subs, count: subs.reduce((n, s) => n + s.items.length, 0) });
  });
  return out;
}

/** 'Cron job' and 'CronJob' read as the same name */
const norm = (l: string): string => l.toLowerCase().replace(/[\s_-]+/g, '');
const providerOf = (id: string): string | undefined => PROVIDER_PREFIX.find(([re]) => re.test(id))?.[1];

/** Unique display labels: explicit overrides, then provider prefix for labels shared across ids, then "(icon)" for group-vs-icon twins. */
export function disambiguateLabels(sections: CatalogSection[]): CatalogSection[] {
  const first = (id: string, it: CatalogItem): string => LABEL_OVERRIDES[id] ?? it.label;
  const byLabel = new Map<string, CatalogItem[]>();
  for (const sec of sections) for (const sub of sec.subs) for (const it of sub.items) {
    const k = norm(first(it.id, it));
    byLabel.set(k, [...(byLabel.get(k) ?? []), it]);
  }
  const label = new Map<string, string>();
  for (const items of byLabel.values()) {
    for (const it of items) label.set(it.id, first(it.id, it));
    if (items.length < 2) continue;
    for (const it of items) {
      const prov = providerOf(it.id);
      if (prov && !LABEL_OVERRIDES[it.id]) {
        const l = label.get(it.id)!;
        label.set(it.id, new RegExp(`^${prov}\\b`, 'i').test(l) ? l : `${prov} ${l}`);
      }
    }
  }
  // anything still colliding (no provider prefix to use): keep the first, suffix the rest with their kind
  // UML palette items are processed first so they keep their plain name ("Actor", "Enum", "Note"); the other twin gets the suffix
  const seen = new Map<string, string>();
  const all = sections.flatMap((sec) => sec.subs.flatMap((sub) => sub.items));
  for (const it of [...all.filter((i) => i.id.startsWith('uml-')), ...all.filter((i) => !i.id.startsWith('uml-'))]) {
    let l = label.get(it.id)!;
    const k = norm(l);
    if (seen.has(k) && seen.get(k) !== it.id) {
      l = `${l} (${it.id.startsWith('er-') ? 'ER' : it.kind === 'group' ? 'group' : 'icon'})`;
      label.set(it.id, l);
    }
    seen.set(norm(l), it.id);
  }
  return sections.map((sec) => ({ ...sec, subs: sec.subs.map((sub) => ({ ...sub, items: sub.items.map((it) => (label.get(it.id) === it.label ? it : { ...it, label: label.get(it.id)! })) })) }));
}
