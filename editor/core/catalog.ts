import { CATALOG_ROWS, CLUSTER_ROWS } from './catalog.generated';

export interface CatalogHit {
  id: string;
  label: string;
  kind: 'icon' | 'group' | 'cluster';
  aliases: string[];
  tags: string[];
  /** cluster profile id (kind 'cluster') */
  profileId?: string;
  iconId?: string;
  topologies?: string[];
}

const ENTRIES: (CatalogHit & { hay: { id: string; label: string; aliases: string[]; tags: string[] } })[] = [
  ...CATALOG_ROWS.map(([id, label, aliases, tags, group]) => ({
    id, label, aliases, tags, kind: (group ? 'group' : 'icon') as 'icon' | 'group',
    hay: { id, label: label.toLowerCase(), aliases: aliases.map((a) => a.toLowerCase()), tags },
  })),
  ...CLUSTER_ROWS.map(([profileId, label, tech, iconId, topologies]) => {
    const aliases = [`${tech} cluster`, `${profileId} cluster`, `${tech} ha`, ...topologies];
    return { id: `cluster-${profileId}`, label, aliases, tags: ['cluster', 'ha', tech.toLowerCase()], kind: 'cluster' as const, profileId, iconId, topologies, hay: { id: profileId, label: label.toLowerCase(), aliases: aliases.map((a) => a.toLowerCase()), tags: ['cluster', 'ha', tech.toLowerCase()] } };
  }),
];
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_]+/g, ' ');
const slug = (s: string) => norm(s).replace(/ /g, '-');

function score(e: (typeof ENTRIES)[number], q: string, tokens: string[]): number {
  const { id, label, aliases, tags } = e.hay;
  const qs = slug(q);
  let best = 0;
  if (id === qs || e.id === qs) best = 100;
  else if (label === q) best = 95;
  else if (aliases.includes(q)) best = 80;
  else if (id.startsWith(qs)) best = 60;
  else if (label.startsWith(q)) best = 55;
  if (best) return best;
  // every token must hit the id, label, an alias or a tag
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    if (id.split('-').includes(t)) s = 30;
    else if (label.split(/\W+/).includes(t)) s = 28;
    else if (aliases.some((a) => a === t || a.split(/\W+/).includes(t))) s = 22;
    else if (id.includes(t) || label.includes(t)) s = 14;
    else if (aliases.some((a) => a.includes(t))) s = 10;
    else if (tags.includes(t)) s = 6;
    else return 0;
    total += s;
  }
  return total / Math.max(1, tokens.length);
}

const strip = ({ hay: _h, ...hit }: (typeof ENTRIES)[number]): CatalogHit => {
  void _h;
  return hit;
};

/** ranked catalog search (icons, groups, cluster profiles). Pure and deterministic. */
export function searchCatalog(query: string, opts: { limit?: number; kind?: CatalogHit['kind'] } = {}): CatalogHit[] {
  const q = norm(query);
  const limit = Math.max(1, Math.min(200, opts.limit ?? 20));
  if (!q) return ENTRIES.filter((e) => !opts.kind || e.kind === opts.kind).slice(0, limit).map(strip);
  const tokens = q.split(' ').filter(Boolean);
  const scored: { e: (typeof ENTRIES)[number]; s: number; i: number }[] = [];
  ENTRIES.forEach((e, i) => {
    if (opts.kind && e.kind !== opts.kind) return;
    const s = score(e, q, tokens);
    if (s > 0) scored.push({ e, s, i });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.slice(0, limit).map((x) => strip(x.e));
}

/** a catalog id (or a human name / alias) to its entry; undefined when nothing matches with confidence */
export function resolveIcon(ref: string): CatalogHit | undefined {
  const direct = BY_ID.get(ref) ?? BY_ID.get(slug(ref));
  if (direct) return strip(direct);
  const q = norm(ref);
  const hit = ENTRIES.find((e) => e.kind !== 'cluster' && (e.hay.label === q || e.hay.aliases.includes(q)));
  if (hit) return strip(hit);
  return undefined;
}

export const catalogIds = (): string[] => ENTRIES.filter((e) => e.kind !== 'cluster').map((e) => e.id);
export const catalogSize = (): number => ENTRIES.length;
