/**
 * Code blocks of sanitized article HTML: `div.code-tabs` (a language group, from a ```lang group=name run) and plain
 * `pre > code.language-x`. Each becomes an empty `<div data-code="i">` host; `hosts[i]` holds the sources, read as text only.
 */
export type CodeItem = { lang: string; code: string };

const LANG_CLASS = /^language-([\w+-]{1,30})$/;

const langOf = (code: Element): string | null => LANG_CLASS.exec(code.getAttribute("class") ?? "")?.[1] ?? null;

/** `pre` holding a single `code` element: that element, else null. */
const soleCode = (pre: Element): Element | null =>
  pre.tagName === "PRE" && pre.children.length === 1 && pre.firstElementChild?.tagName === "CODE" ? pre.firstElementChild : null;

export function extractCode(html: string): { html: string; hosts: CodeItem[][] } {
  if (typeof DOMParser === "undefined" || !html.includes("language-")) return { html, hosts: [] };
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild as HTMLElement;
  const doc = root.ownerDocument;
  const hosts: CodeItem[][] = [];
  const swap = (el: Element, items: CodeItem[]) => {
    const host = doc.createElement("div");
    host.setAttribute("data-code", String(hosts.length));
    hosts.push(items);
    el.replaceWith(host);
  };
  for (const box of root.querySelectorAll("div.code-tabs")) {
    const items: CodeItem[] = [];
    for (const pre of box.children) {
      const code = soleCode(pre);
      items.push({ lang: (code && langOf(code)) ?? "", code: code?.textContent ?? "" });
    }
    if (items.length > 1 && [...box.children].every((c) => soleCode(c))) swap(box, items);
  }
  for (const pre of root.querySelectorAll("pre")) {
    const code = soleCode(pre);
    const lang = code && langOf(code);
    if (code && lang) swap(pre, [{ lang, code: code.textContent ?? "" }]);
  }
  return { html: root.innerHTML, hosts };
}
