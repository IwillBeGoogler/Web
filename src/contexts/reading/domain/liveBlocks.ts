/**
 * Live HTML blocks: a fenced block with language `html-live` (optional `height=N`) in a story.
 * The server renders one as `<pre><code class="language-html-live-N">escaped source</code></pre>`; this reads that form back
 * strictly, and mirrors the server's fence scan (Backend post/live.go) so the editor preview shows the same blocks.
 */
export const LIVE_MIN_HEIGHT = 100;
export const LIVE_MAX_HEIGHT = 1000;
export const LIVE_DEFAULT_HEIGHT = 400;

export const clampLiveHeight = (n: number) => Math.min(LIVE_MAX_HEIGHT, Math.max(LIVE_MIN_HEIGHT, Math.trunc(n)));

const RENDERED_CLASS = /^language-html-live-(\d{3,4})$/;

/** Height from the class of a rendered block's `<code>`, clamped; null when it is not a live block. */
export function liveHeightFromClass(cls: string | null): number | null {
  const m = cls ? RENDERED_CLASS.exec(cls) : null;
  return m ? clampLiveHeight(Number(m[1])) : null;
}

export type LiveBlock = { code: string; height: number };

/**
 * Takes the live blocks out of sanitized article HTML. Each one becomes an empty `<div data-live="i">` host in the
 * returned markup, and `blocks[i]` holds its source. The source is only ever read as text.
 */
export function extractLive(html: string): { html: string; blocks: LiveBlock[] } {
  if (typeof DOMParser === "undefined" || !html.includes("language-html-live-")) return { html, blocks: [] };
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild as HTMLElement;
  const blocks: LiveBlock[] = [];
  for (const code of root.querySelectorAll("pre > code")) {
    const height = liveHeightFromClass(code.getAttribute("class"));
    const pre = code.parentElement;
    if (height === null || !pre || pre.children.length !== 1) continue;
    const host = root.ownerDocument.createElement("div");
    host.setAttribute("data-live", String(blocks.length));
    blocks.push({ code: code.textContent ?? "", height });
    pre.replaceWith(host);
  }
  return { html: root.innerHTML, blocks };
}

export type BodyPart = { id: number; kind: "text"; text: string } | ({ id: number; kind: "live" } & LiveBlock);

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEIGHT = /^height=(\d{1,5})$/;

/** Splits Markdown into prose and top-level html-live blocks (for the editor preview, which does not render Markdown). */
export function splitLive(body: string): BodyPart[] {
  if (!body.includes("html-live")) return [{ id: 0, kind: "text", text: body }];
  const parts: BodyPart[] = [];
  let text: string[] = [];
  // height is null for any fence that is not a valid live block; its lines stay prose
  let open: { ch: string; n: number; height: number | null; code: string[] } | null = null;
  const flush = () => {
    if (text.length) parts.push({ id: parts.length, kind: "text", text: text.join("\n") });
    text = [];
  };
  const emit = (o: { height: number | null; code: string[] }) => {
    flush();
    parts.push({ id: parts.length, kind: "live", code: o.code.join("\n"), height: o.height ?? LIVE_DEFAULT_HEIGHT });
  };
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!open) {
      const m = FENCE_OPEN.exec(line);
      const marker = m?.[1] ?? "";
      const info = m?.[2]?.trim() ?? "";
      if (!marker || (marker.startsWith("`") && info.includes("`"))) {
        text.push(raw);
        continue;
      }
      const f = info.split(/\s+/).filter(Boolean);
      const h = f.length === 2 ? HEIGHT.exec(f[1] ?? "") : null;
      const height = f[0] !== "html-live" ? null : f.length === 1 ? LIVE_DEFAULT_HEIGHT : h ? clampLiveHeight(Number(h[1])) : null;
      open = { ch: marker.slice(0, 1), n: marker.length, height, code: [] };
      if (height === null) text.push(raw);
      continue;
    }
    const close = FENCE_CLOSE.exec(line);
    const cm = close?.[1] ?? "";
    if (cm.startsWith(open.ch) && cm.length >= open.n) {
      if (open.height === null) text.push(raw);
      else emit(open);
      open = null;
    } else if (open.height === null) text.push(raw);
    else open.code.push(line);
  }
  if (open && open.height !== null) emit(open);
  flush();
  return parts;
}
