import type { GlossaryEntry } from "@/contexts/reading/domain/post";

export type { GlossaryEntry };

/** Same limits as glossary.NormalizeEntries on the server. */
export const GLOSSARY_LIMITS = { term: 80, definition: 600, aliases: 10, entries: 50 } as const;

const chars = (s: string) => [...s].length;
const norm = (s: string) => s.trim().toLowerCase();

/** "a, b ,a" -> ["a","b"]. */
export const parseAliases = (s: string): string[] => [
  ...new Set(
    s
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  ),
];

export type GlossaryProblem = "required" | "termLong" | "definitionLong" | "aliases" | "entries" | "duplicate";

/** Trims the entry and drops aliases that repeat the term or an earlier alias (case-insensitive), as the server does. */
export const cleanEntry = (e: GlossaryEntry): GlossaryEntry => {
  const term = e.term.trim();
  const seen = new Set([norm(term)]);
  const aliases = parseAliases(e.aliases.join(",")).filter((a) => !seen.has(norm(a)) && seen.add(norm(a)));
  return { term, aliases, definition: e.definition.trim() };
};

/** First problem with `e` next to the article's `others`, or undefined. */
export function entryProblem(e: GlossaryEntry, others: readonly GlossaryEntry[]): GlossaryProblem | undefined {
  const c = cleanEntry(e);
  if (!c.term || !c.definition) return "required";
  if (chars(c.term) > GLOSSARY_LIMITS.term || c.aliases.some((a) => chars(a) > GLOSSARY_LIMITS.term)) return "termLong";
  if (chars(c.definition) > GLOSSARY_LIMITS.definition) return "definitionLong";
  if (c.aliases.length > GLOSSARY_LIMITS.aliases) return "aliases";
  if (others.length >= GLOSSARY_LIMITS.entries) return "entries";
  const used = new Set(others.flatMap((o) => [norm(o.term), ...o.aliases.map(norm)]));
  const mine = [norm(c.term), ...c.aliases.map(norm)];
  if (new Set(mine).size !== mine.length || mine.some((k) => used.has(k))) return "duplicate";
  return undefined;
}

/** First problem across the whole list. */
export function entriesProblem(list: readonly GlossaryEntry[]): GlossaryProblem | undefined {
  if (list.length > GLOSSARY_LIMITS.entries) return "entries";
  for (let i = 0; i < list.length; i++) {
    const p = entryProblem(list[i] as GlossaryEntry, list.slice(0, i));
    if (p) return p;
  }
  return undefined;
}

export const sameGlossary = (a: readonly GlossaryEntry[], b: readonly GlossaryEntry[]) => a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
