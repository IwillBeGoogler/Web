import katex from "katex";

/**
 * The server leaves each formula as an element holding its TeX
 * (`span.math-inline` / `div.math-block`, `data-tex`). This typesets them.
 * Input stays text: KaTeX output is built here from the TeX, never from the page's markup.
 */
export function typesetMath(html: string): string {
  if (!html.includes("data-tex")) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const el of tpl.content.querySelectorAll<HTMLElement>(".math-inline[data-tex], .math-block[data-tex]")) {
    const block = el.classList.contains("math-block");
    try {
      el.innerHTML = katex.renderToString(String(el.dataset.tex), { displayMode: block, throwOnError: false, strict: "ignore", maxExpand: 1000, trust: false });
    } catch {
      // leave the TeX as the fallback text the server wrote
    }
  }
  return tpl.innerHTML;
}
