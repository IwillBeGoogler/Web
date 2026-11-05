/** Links the editor lets an author create: web pages and mail only. Anything else (javascript:, data:, vbscript:, file:…) is refused. */
const ALLOWED = /^(?:https?:\/\/|mailto:)/i;

/** Strips the control characters and whitespace browsers ignore inside a scheme (`java\tscript:`), so a disguised one is seen as what it is. */
const INVISIBLE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(32)}${String.fromCharCode(127)}-${String.fromCharCode(159)}${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200f)}${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}${String.fromCharCode(0xfeff)}]`,
  "g",
);

/** The href to store for what an author typed, or null when it is not a link we allow. A bare domain gets https://. */
export function safeHref(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const squeezed = raw.replace(INVISIBLE, "");
  if (ALLOWED.test(squeezed)) return ALLOWED.test(raw) ? raw : null;
  // some other scheme (`javascript:alert(1)`, `data:…`)? A scheme is letters/digits/+-. then a colon, before any slash.
  if (/^[a-z][a-z0-9+.-]*:/i.test(squeezed)) return null;
  // a bare domain (example.com, example.com/path)
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)) return `https://${raw}`;
  return null;
}

/** Hrefs found in existing Markdown that the rich editor can keep as they are: allowed schemes, or no scheme at all (/path, #anchor, ?q). */
export function keepableHref(href: string): boolean {
  const squeezed = href.trim().replace(INVISIBLE, "");
  if (ALLOWED.test(squeezed)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(squeezed);
}
