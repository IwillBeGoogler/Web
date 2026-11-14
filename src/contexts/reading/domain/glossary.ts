import { z } from "zod";
import type { GlossaryEntry } from "./post";

/** A site-wide term as the API returns it (`GET /api/glossary`). */
export const globalTermSchema = z.object({
  id: z.number(),
  term: z.string(),
  aliases: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((a) => a ?? []),
  definition: z.string(),
  lang: z.string().default(""),
});
export type GlobalTerm = z.infer<typeof globalTermSchema>;

/** One term the reader can see explained. `id` is "a:<index>" for the article's own terms and "g:<id>" for site-wide ones. */
export type Term = { id: string; term: string; aliases: string[]; definition: string };

/** Quote variants Uzbek Latin is typed with: o‘ o’ oʻ o' o` all spell the same letter. */
const APOSTROPHES = new Set(["'", "‘", "’", "ʻ", "ʼ", "`", "´", "′"]);

/**
 * Case- and apostrophe-insensitive form used for matching. Every character maps to one of the same length,
 * so an index in the folded text is the same index in the original.
 */
export function fold(s: string): string {
  return Array.from(s, (c) => {
    if (APOSTROPHES.has(c)) return "'";
    const l = c.toLowerCase();
    return l.length === c.length ? l : c;
  }).join("");
}

/** The article's terms win over site-wide ones: a site term is dropped when any of its names is used by the article. */
export function mergeTerms(article: readonly GlossaryEntry[], globals: readonly GlobalTerm[]): Term[] {
  const mine: Term[] = article
    .filter((e) => e.term.trim() && e.definition.trim())
    .map((e, i) => ({ id: `a:${i}`, term: e.term.trim(), aliases: e.aliases.map((a) => a.trim()).filter(Boolean), definition: e.definition }));
  const taken = new Set(mine.flatMap((t) => [t.term, ...t.aliases]).map(fold));
  const theirs: Term[] = [];
  for (const g of globals) {
    if (!g.term.trim() || !g.definition.trim()) continue;
    const names = [g.term.trim(), ...g.aliases.map((a) => a.trim()).filter(Boolean)];
    if (names.some((n) => taken.has(fold(n)))) {
      // keep the names the article does not use, so an alias still works on its own
      const rest = names.filter((n) => !taken.has(fold(n)));
      if (!rest[0]) continue;
      const [term = "", ...aliases] = rest;
      theirs.push({ id: `g:${g.id}`, term, aliases, definition: g.definition });
      for (const n of rest) taken.add(fold(n));
      continue;
    }
    for (const n of names) taken.add(fold(n));
    theirs.push({ id: `g:${g.id}`, term: names[0] ?? "", aliases: names.slice(1), definition: g.definition });
  }
  return [...mine, ...theirs];
}

const LETTER = String.raw`[\p{L}\p{N}]`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Matcher = {
  /** Regex over folded text; group 0 is the match. */
  re: RegExp;
  /** Folded name -> term. */
  byKey: Map<string, Term>;
};

/**
 * Builds one regex for all terms: longest name first, on word boundaries made of Unicode letters and digits.
 * An apostrophe after o or g belongs to the word (o‘zbek, g‘isht), so "go" does not match inside "go'sht".
 */
export function buildMatcher(terms: readonly Term[]): Matcher | null {
  const byKey = new Map<string, Term>();
  for (const t of terms) {
    for (const name of [t.term, ...t.aliases]) {
      const k = fold(name.trim());
      if (k && !byKey.has(k)) byKey.set(k, t);
    }
  }
  if (byKey.size === 0) return null;
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const alt = keys
    .map((k) => {
      const endsInOG = /[og]$/.test(k);
      const tail = endsInOG ? `(?!${LETTER})(?!'${LETTER})` : `(?!${LETTER})`;
      return `${escapeRe(k)}${tail}`;
    })
    .join("|");
  return { re: new RegExp(`(?<!${LETTER})(?<![og]')(?:${alt})`, "gu"), byKey };
}

export type Hit = { start: number; end: number; term: Term };

/** Non-overlapping matches in `text`, left to right, longest name first. */
export function findMatches(m: Matcher, text: string): Hit[] {
  const folded = fold(text);
  const hits: Hit[] = [];
  m.re.lastIndex = 0;
  for (let r = m.re.exec(folded); r; r = m.re.exec(folded)) {
    const term = m.byKey.get(r[0]);
    if (term) hits.push({ start: r.index, end: r.index + r[0].length, term });
    if (r[0].length === 0) m.re.lastIndex++;
  }
  return hits;
}

/** Elements whose text is never marked. */
export const SKIP_SELECTOR = "code, pre, a, h1, h2, h3, h4, h5, h6, kbd, samp, script, style, button, [data-live], [data-code], .glossary-term";

export const TERM_CLASS = "glossary-term";

/** Puts the wrapping back to plain text (before marking again, or when the article goes away). */
export function clearTerms(root: Element): void {
  for (const span of Array.from(root.querySelectorAll(`.${TERM_CLASS}`))) {
    span.replaceWith(document.createTextNode(span.textContent ?? ""));
  }
  root.normalize();
}

/**
 * Wraps the FIRST occurrence of each term in the article's text in `<span class="glossary-term">`.
 * Only text nodes are touched, and definitions are never written into the page: the tooltip reads them from `terms`.
 * Returns how many terms were marked.
 */
export function markTerms(root: Element, terms: readonly Term[], tipId: string): number {
  clearTerms(root);
  const matcher = buildMatcher(terms);
  if (!matcher) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (!text.data.trim() || text.parentElement?.closest(SKIP_SELECTOR)) continue;
    nodes.push(text);
  }
  const seen = new Set<string>();
  for (const node of nodes) {
    const fresh = findMatches(matcher, node.data).filter((h) => {
      if (seen.has(h.term.id)) return false;
      seen.add(h.term.id);
      return true;
    });
    if (fresh.length === 0) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const h of fresh) {
      if (h.start > at) frag.append(node.data.slice(at, h.start));
      const span = document.createElement("span");
      span.className = TERM_CLASS;
      span.dataset.termId = h.term.id;
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute("aria-describedby", tipId);
      span.textContent = node.data.slice(h.start, h.end);
      frag.append(span);
      at = h.end;
    }
    if (at < node.data.length) frag.append(node.data.slice(at));
    node.replaceWith(frag);
  }
  return seen.size;
}
