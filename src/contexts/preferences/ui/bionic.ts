import { bionicSegments } from "../domain/reading";

const SKIP = new Set(["CODE", "PRE", "KBD", "SAMP", "VAR", "MATH", "SCRIPT", "STYLE", "H1", "H2", "H3", "H4", "H5", "H6", "B"]);

const SKIP_LIVE = "[data-live], [data-code], .glossary-term";

/** Wraps the leading part of each body word under `root` in <b class="bionic">, in place. */
export function bionicDom(root: Element): void {
  const doc = root.ownerDocument;
  const walk = (el: Element) => {
    for (const node of [...el.childNodes]) {
      if (node.nodeType === 1) {
        const e = node as Element;
        if (!SKIP.has(e.tagName) && !e.matches(SKIP_LIVE)) walk(e);
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
}

/** Undoes bionicDom: the markup goes back to the plain text it wrapped. */
export function clearBionic(root: Element): void {
  for (const b of Array.from(root.querySelectorAll("b.bionic"))) b.replaceWith(doc(root).createTextNode(b.textContent ?? ""));
  root.normalize();
}
const doc = (el: Element) => el.ownerDocument;

/**
 * Adds bionic-reading markup to already-sanitized article HTML: the leading
 * part of each body word is wrapped in <b class="bionic">. Code and headings
 * are left alone, and text content is unchanged (highlights still match).
 */
export function bionicHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild as HTMLElement;
  bionicDom(root);
  return root.innerHTML;
}
