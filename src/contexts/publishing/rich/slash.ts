/** `/query` typed at the start of an empty block opens the insert menu. Returns the query, or null when the block is not a slash command. */
export function slashQuery(blockText: string): string | null {
  const m = /^\/([\p{L}\p{N}-]{0,24})$/u.exec(blockText);
  return m ? (m[1] as string) : null;
}

export type SlashId = "h1" | "h2" | "h3" | "image" | "code" | "codegroup" | "quote" | "ul" | "ol" | "hr" | "table" | "diagram" | "live" | "math";

/** English words that also find an item, whatever the interface language. */
export const SLASH_KEYWORDS: Record<SlashId, string> = {
  h1: "title heading h1",
  h2: "heading title h2",
  h3: "subheading subtitle h3",
  image: "image picture photo upload",
  code: "code snippet block pre",
  codegroup: "code languages tabs multi group snippet",
  quote: "quote blockquote citation",
  ul: "list bullet unordered ul",
  ol: "list numbered ordered ol",
  hr: "divider rule line hr separator",
  table: "table grid rows columns",
  diagram: "diagram embed chart",
  live: "animation html live interactive demo",
  math: "math formula equation latex tex katex",
};

export const SLASH_ORDER: SlashId[] = ["h1", "h2", "h3", "image", "code", "codegroup", "quote", "ul", "ol", "hr", "table", "diagram", "live", "math"];

/** Items whose label or keywords contain the query (all of them for an empty query). */
export function filterSlash(labels: Record<SlashId, string>, query: string): SlashId[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ORDER;
  return SLASH_ORDER.filter((id) => `${labels[id]} ${SLASH_KEYWORDS[id]}`.toLowerCase().includes(q));
}
