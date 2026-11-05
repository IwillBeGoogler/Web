import type { JSONContent } from "@tiptap/core";
import { canRoundTrip, parseMarkdown, sameRichDoc, serializeDoc } from "./markdown";

/** A small seeded generator, so a failing run can be named by its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// biome-ignore format: a flat list reads better
const NASTY = [
  "*", "**", "_", "__", "[", "]", "#", "`", "``", "\\", "<", ">", "&", "&amp;", "&#35;", "|", "~", "~~", "!", "(", ")", ":", "-", "+", "=", ".", "1",
  "1. ", "- ", "> ", "# ", "## ", "```", "---", "***", "===", "![", "](", "<b>", "</p>", "<script>", "http://x.com/a_b_(c)", "[^1]", "[a]: b", "www.x.com",
  "a", "b", "word", "qalin", " ", "  ", "\t", " ", "я", "Ў", "o'z", "oʻz", "o‘z", "😀", "é", "日本",
];
// biome-ignore format: a flat list reads better
const HREFS = ["https://example.com/a_b", "https://example.com/a_(b)", "https://example.com/a b", "https://example.com/x)y", "http://a.com/?q=1&r=2", "mailto:a@b.co", "/relative/path"];
const SRCS = ["https://example.com/a.png", "https://example.com/a_(1).png", "/api/uploads/abc.png", "https://example.com/a b.png"];

const SMALL = Boolean(process.env.SMALL);
type R = () => number;
const pick = <T>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T;
const chance = (r: R, p: number) => r() < p;

function text(r: R): string {
  let s = "";
  const n = 1 + Math.floor(r() * (SMALL ? 2 : 6));
  for (let i = 0; i < n; i++) s += pick(r, NASTY);
  return s;
}
const oneLine = (r: R) => text(r).replace(/\s+/g, " ");

function inline(r: R): JSONContent[] {
  const out: JSONContent[] = [];
  const n = 1 + Math.floor(r() * (SMALL ? 2 : 5));
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.08) out.push({ type: "hardBreak" });
    else if (k < 0.16)
      out.push({ type: "image", attrs: { src: pick(r, SRCS), alt: chance(r, 0.5) ? oneLine(r) : "", title: chance(r, 0.3) ? oneLine(r) : null } });
    else {
      const marks: NonNullable<JSONContent["marks"]> = [];
      if (chance(r, 0.15)) marks.push({ type: "code" });
      else {
        if (chance(r, 0.25)) marks.push({ type: "bold" });
        if (chance(r, 0.25)) marks.push({ type: "italic" });
        if (chance(r, 0.1)) marks.push({ type: "strike" });
        if (chance(r, 0.15)) marks.push({ type: "link", attrs: { href: pick(r, HREFS), title: chance(r, 0.2) ? oneLine(r) : null } });
      }
      out.push({ type: "text", text: text(r), ...(marks.length ? { marks } : {}) });
    }
  }
  return out;
}

const paragraph = (r: R): JSONContent => ({ type: "paragraph", content: inline(r) });

function listItem(r: R, depth: number): JSONContent {
  const content: JSONContent[] = [chance(r, 0.1) ? { type: "paragraph" } : paragraph(r)];
  if (depth < 1 && chance(r, 0.3)) content.push(list(r, depth + 1));
  if (chance(r, 0.1)) content.push({ type: "blockquote", content: [paragraph(r)] });
  return { type: "listItem", content };
}

function list(r: R, depth: number): JSONContent {
  const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => listItem(r, depth));
  return chance(r, 0.5)
    ? { type: "bulletList", content: items }
    : { type: "orderedList", attrs: { start: chance(r, 0.2) ? 3 : 1, type: null }, content: items };
}

function block(r: R, depth: number): JSONContent {
  const k = r();
  if (k < 0.4) return paragraph(r);
  if (k < 0.5) return { type: "heading", attrs: { level: chance(r, 0.5) ? 2 : 3 }, content: [{ type: "text", text: oneLine(r) }] };
  if (k < 0.65) return list(r, depth);
  if (k < 0.75 && depth < 2) return { type: "blockquote", content: Array.from({ length: 1 + Math.floor(r() * 2) }, () => block(r, depth + 1)) };
  if (k < 0.85)
    return {
      type: "codeBlock",
      attrs: { language: pick(r, [null, "js", "bash"]) },
      content: [{ type: "text", text: `${pick(r, ["", "```", "~~~", "a\n```\nb", "  x"])}${oneLine(r)}` }],
    };
  if (k < 0.9) return { type: "horizontalRule" };
  return paragraph(r);
}

export function randomDoc(seed: number): JSONContent {
  const r = rng(seed);
  return { type: "doc", content: Array.from({ length: 1 + Math.floor(r() * 5) }, () => block(r, 0)) };
}

/** The contract: whatever the editor holds, the Markdown written for it reads back as the same document, with no raw HTML or foreign syntax. */
export function check(doc: JSONContent): string | null {
  const md = serializeDoc(doc);
  const back = parseMarkdown(md);
  if (!sameRichDoc(back, doc)) return `reads back differently:\n${md}`;
  const again = serializeDoc(back);
  if (again !== md) return `unstable:\n${md}\n---\n${again}`;
  const rt = canRoundTrip(md);
  if (!rt.ok && md.trim()) return `Markdown mode needed (${rt.problem}):\n${md}`;
  return null;
}
