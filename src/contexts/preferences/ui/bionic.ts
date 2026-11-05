import { bionicSegments } from "../domain/reading";

const SKIP = new Set(["CODE", "PRE", "KBD", "SAMP", "VAR", "MATH", "SCRIPT", "STYLE", "H1", "H2", "H3", "H4", "H5", "H6", "B"]);

/**
 * Adds bionic-reading markup to already-sanitized article HTML: the leading
 * part of each body word is wrapped in <b class="bionic">. Code and headings
 * are left alone, and text content is unchanged (highlights still match).
 */
export function bionicHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (el: Element) => {
    for (const node of [...el.childNodes]) {
      if (node.nodeType === 1) {
        if (!SKIP.has((node as Element).tagName)) walk(node as Element);
      } else if (node.nodeType === 3 && node.textContent?.trim()) {
        const frag = doc.createDocumentFragment();
        for (const s of bionicSegments(node.textContent)) {
          if (s.b) {
            const b = doc.createElement("b");
            b.className = "bionic";
            b.textContent = s.b;
            frag.append(b);
          }
          frag.append(s.t);
        }
        node.replaceWith(frag);
      }
    }
  };
  walk(root);
  return root.innerHTML;
}
