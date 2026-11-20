/**
 * Copied HTML that holds tables becomes Markdown with GFM tables, so a table copied from a page (a real
 * `<table>`, or a grid of `<div>` rows like a chat answer draws) lands in the Markdown editor as a table,
 * not as one cell per line. Returns null when the HTML holds no table: the paste then goes on as plain text.
 */

const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "TR", "BLOCKQUOTE", "PRE", "FIGURE"]);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (s: string) => clean(s).replace(/\|/g, "\\|");

/** Element children carrying text. */
const kids = (el: Element) => [...el.children].filter((c) => clean(c.textContent ?? ""));

/** One cell: no block inside, or wrappers that each hold a single text-bearing child (`<div><div><span>X</span></div></div>`). */
const isLeaf = (el: Element): boolean => {
  if (![...el.querySelectorAll("*")].some((d) => BLOCK.has(d.tagName))) return true;
  const k = kids(el);
  return k.length === 1 && isLeaf(k[0] as Element) && clean(el.textContent ?? "") === clean(k[0]?.textContent ?? "");
};

/** A grid row: two or more cells, each a leaf. */
const rowCells = (el: Element): string[] | null => {
  const k = kids(el);
  if (k.length < 2 || !k.every(isLeaf)) return null;
  return k.map((c) => cell(c.textContent ?? ""));
};

const table = (rows: string[][]): string => {
  const n = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => `| ${[...r, ...Array(n - r.length).fill("")].join(" | ")} |`;
  return [pad(rows[0] ?? []), `| ${Array(n).fill("---").join(" | ")} |`, ...rows.slice(1).map(pad)].join("\n");
};

export function htmlTablesToMarkdown(html: string): string | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  let found = false;

  const walk = (el: Element) => {
    if (el.tagName === "TABLE") {
      const rows = [...el.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => cell(c.textContent ?? ""))).filter((r) => r.length);
      if (rows.length) {
        out.push(table(rows));
        found = true;
      }
      return;
    }
    const children = kids(el);
    if (!children.length || isLeaf(el)) {
      const text = clean(el.textContent ?? "");
      if (text) out.push(/^H[1-6]$/.test(el.tagName) ? `${"#".repeat(Number(el.tagName[1]))} ${text}` : text);
      return;
    }
    // runs of two or more sibling rows with the same number of cells are one table
    let run: string[][] = [];
    const flush = () => {
      if (run.length >= 2) {
        out.push(table(run));
        found = true;
      } else for (const r of run) out.push(r.join(" "));
      run = [];
    };
    for (const c of children) {
      const r = rowCells(c);
      if (r && (!run.length || run[0]?.length === r.length)) {
        run.push(r);
        continue;
      }
      flush();
      if (r) run.push(r);
      else walk(c);
    }
    flush();
  };

  walk(doc.body);
  return found ? out.join("\n\n") : null;
}

/**
 * The plain text a grid copies as: cells one per line with a blank line between them, rows parted by three or more
 * blank lines, a title line glued to the first cell. Prose never leaves that many blank lines, so it is left alone.
 */
export function gridTextToMarkdown(text: string): string | null {
  const chunks = text.replace(/\r\n?/g, "\n").split(/\n{4,}/);
  if (chunks.length < 2) return null;
  const out: string[] = [];
  let run: string[][] = [];
  let tables = 0;
  const flush = () => {
    if (run.length >= 2) {
      out.push(table(run));
      tables++;
    } else for (const r of run) out.push(r.join(" "));
    run = [];
  };
  for (const chunk of chunks) {
    const parts = chunk
      .split(/\n{2,3}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) continue;
    // lines glued to the first cell with a single newline are titles above the row
    const head = (parts[0] as string).split("\n").map(clean).filter(Boolean);
    const first = head.pop() ?? "";
    const cells = [first, ...parts.slice(1)].map(cell);
    if (cells.some((c) => c.includes("\n")) || parts.slice(1).some((p) => p.includes("\n"))) return null;
    if (head.length) {
      flush();
      out.push(...head);
    }
    if (cells.length < 2) {
      flush();
      out.push(...cells);
      continue;
    }
    if (run.length && run[0]?.length !== cells.length) flush();
    run.push(cells);
  }
  flush();
  return tables ? out.join("\n\n") : null;
}
