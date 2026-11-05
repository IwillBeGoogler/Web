export interface Command {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
}

/**
 * Fuzzy score of `query` against `text` (higher is better, -1 = no match): every query character must appear in order;
 * prefix, word-start and consecutive matches score more, so "zf" finds "Zoom to fit" ahead of "Show failures".
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const whole = t.indexOf(q);
  if (whole === 0) return 1000 - t.length;
  if (whole > 0) return 800 - whole - t.length * 0.1 + (/[\s:/-]/.test(t[whole - 1]) ? 50 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return -1;
    const wordStart = at === 0 || /[\s:/-]/.test(t[at - 1]);
    run = at === ti ? run + 1 : 0;
    score += 10 + run * 6 + (wordStart ? 15 : 0) - Math.min(8, at - ti);
    ti = at + 1;
  }
  return score;
}

/** Best matches first (title, keywords and section are searched; title matches win). Empty query keeps the given order. */
export function rankCommands(commands: Command[], query: string, limit = 50): Command[] {
  if (!query.trim()) return commands.slice(0, limit);
  const scored: { c: Command; s: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const title = fuzzyScore(query, c.title);
    const other = Math.max(-1, ...(c.keywords ?? []).map((k) => fuzzyScore(query, k) - 200), fuzzyScore(query, c.section) - 400);
    const s = Math.max(title, other);
    if (s >= 0) scored.push({ c, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.c);
}
