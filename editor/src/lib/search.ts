import type { SearchIndexData } from '../data/search-index.generated';

export interface SearchEntry {
  id: string;
  label: string;
  aliases: string[];
  tags: string[];
  keywords?: string[];
}
export interface ParsedQuery {
  /** plain words: every one must match (AND) */
  terms: string[];
  /** `#tag` tokens and selected chips: every one must be present exactly */
  tags: string[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');
const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);

/** "aws database" -> terms [aws, database]; "#monitoring grafana" -> tags [monitoring], terms [grafana]. */
export function parseQuery(query: string, chips: string[] = []): ParsedQuery {
  const terms: string[] = [];
  const tags = chips.map((c) => c.toLowerCase());
  for (const raw of query.trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith('#')) {
      const t = raw.slice(1).toLowerCase();
      if (t) tags.push(t);
    } else terms.push(norm(raw));
  }
  return { terms: terms.filter(Boolean), tags: [...new Set(tags)] };
}

function scoreTerm(e: SearchEntry, q: string, context: string[]): number {
  let best = 0;
  for (const f of [e.label, e.id, ...e.aliases]) {
    const n = norm(f);
    if (n === q) best = Math.max(best, 100);
    else if (n.startsWith(q)) best = Math.max(best, 80);
    else if (words(f).some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (q.length > 2 && n.includes(q)) best = Math.max(best, 30);
  }
  if (best) return best;
  for (const k of e.keywords ?? []) {
    const n = norm(k);
    if (n === q || n.startsWith(q) || (q.length > 2 && n.includes(q))) return 25;
  }
  for (const t of e.tags) {
    const n = norm(t);
    if (n === q) return 22; // a tag name returns EVERY item carrying it
    if (q.length > 2 && n.startsWith(q)) return 12;
  }
  for (const c of context) {
    const n = norm(c);
    if (n === q || n.startsWith(q) || (q.length > 2 && n.includes(q))) return 15;
  }
  return 0;
}

/** 0 = no match. Name matches outrank tag matches; all terms and all tag filters must match. */
export function scoreEntry(e: SearchEntry, pq: ParsedQuery, context: string[] = []): number {
  for (const t of pq.tags) if (!e.tags.includes(t)) return 0;
  if (!pq.terms.length) return pq.tags.length ? 50 : 1;
  let total = 0;
  for (const q of pq.terms) {
    const s = scoreTerm(e, q, context);
    if (!s) return 0;
    total += s;
  }
  return total;
}

export interface SearchHit {
  id: string;
  score: number;
}

/** Search the prebuilt index (names + aliases + tags only; no SVG packs are touched). */
export function searchIndex(index: SearchIndexData, query: string, chips: string[] = [], limit = Infinity): SearchHit[] {
  const pq = parseQuery(query, chips);
  if (!pq.terms.length && !pq.tags.length) return [];
  // narrow by the rarest tag filter first
  let candidates: number[] | null = null;
  for (const t of pq.tags) {
    const list = index.tagIndex[t] ?? [];
    if (!candidates || list.length < candidates.length) candidates = list;
  }
  const idxs = candidates ?? index.ids.map((_, i) => i);
  const hits: SearchHit[] = [];
  for (const i of idxs) {
    const s = scoreEntry({ id: index.ids[i], label: index.names[i], aliases: index.aliases[i], tags: index.tags[i] }, pq);
    if (s > 0) hits.push({ id: index.ids[i], score: s });
  }
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return hits.slice(0, limit);
}

/** Tags by popularity (for chips); `preferred` ones that exist come first, in the given order. */
export function topTags(index: SearchIndexData, preferred: string[] = [], n = 10): { tag: string; count: number }[] {
  const counts = Object.entries(index.tagIndex).map(([tag, l]) => ({ tag, count: l.length }));
  const pref = preferred.map((t) => counts.find((c) => c.tag === t)).filter((x): x is { tag: string; count: number } => !!x);
  const rest = counts.filter((c) => !preferred.includes(c.tag)).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
  return [...pref, ...rest].slice(0, n);
}
