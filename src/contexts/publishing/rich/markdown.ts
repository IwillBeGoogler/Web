import { type AnyExtension, Editor, type Extensions, type JSONContent, markInputRule } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import Heading from "@tiptap/extension-heading";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { scanLive } from "./liveScan";
import { DiagramEmbed, HtmlLive, UploadPlaceholder } from "./nodes";
import { keepableHref } from "./safeLink";

/** Why a story cannot be edited visually without losing something. The editor maps each to a short explanation. */
export type RichProblem =
  | "html"
  | "table"
  | "footnote"
  | "task"
  | "heading"
  | "link"
  | "looseList"
  | "definition"
  | "live"
  | "embed"
  | "crlf"
  | "unknown"
  | "changes"
  | "error";

export type RoundTrip = { ok: true } | { ok: false; problem: RichProblem };

// characters a bare address may hold without Markdown escaping getting in its way
const BARE_OK = /^https?:\/\/[A-Za-z0-9\-._:/?#@!$'+,;=%]+$/;
const bareOk = (href: string) =>
  BARE_OK.test(href) && !/[.,;:!?'"]$/.test(href) && !/(^|[^A-Za-z0-9])_|_($|[^A-Za-z0-9])/.test(href.replace(/^https?:\/\//, ""));

/** A link or image address that cannot break out of its Markdown: spaces, angle brackets, control characters and unbalanced parentheses are percent-encoded. */
export function encodeDest(href: string): string {
  let depth = 0;
  let balanced = true;
  for (const c of href) {
    if (c === "(") depth++;
    else if (c === ")" && --depth < 0) balanced = false;
  }
  if (depth !== 0) balanced = false;
  let out = "";
  for (const c of href) {
    if (/[\s<>"\\]/.test(c) || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      out += [...new TextEncoder().encode(c)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`).join("");
    else if (!balanced && c === "(") out += "%28";
    else if (!balanced && c === ")") out += "%29";
    else out += c;
  }
  return out;
}

/** A link whose text is its own address is written as the bare address, which is how the server turns a lone video link into an embed. */
const RichLink = Link.extend({
  renderMarkdown(node, h, ctx) {
    const href = String(node.attrs?.href ?? "");
    const title = String(node.attrs?.title ?? "");
    const text = (ctx as { meta?: { markText?: string } } | undefined)?.meta?.markText;
    const inner = h.renderChildren(node);
    if (!title && text !== undefined && text === href && bareOk(href)) return inner;
    const dest = encodeDest(href);
    return title ? `[${inner}](${dest} "${title.replace(/[\\"]/g, "\\$&")}")` : `[${inner}](${dest})`;
  },
});

/** A line that starts like another block ("# ", "- ", "1. ", "> ", a fence, a rule) is written with its first marker character escaped. */
const BLOCK_START =
  /^(?: {0,3})(#|(?:[A-Za-z]|[ivxlcdmIVXLCDM]{2,6})[.)](?:\s|$)|[-+*](?:\s|$)|\d{1,9}[.)](?:\s|$)|>|`{3,}|~{3,}|(?:([-_*])[ \t]*\2[ \t]*\2[ \t]*(?:\2[ \t]*)*)$|=+\s*$|-+\s*$|\|)/;
const NUMBERED = /^( {0,3}(?:\d{1,9}|[A-Za-z]|[ivxlcdmIVXLCDM]{2,6}))([.)])/;
export function escapeLineStart(line: string): string {
  if (!BLOCK_START.test(line) || line.startsWith("&nbsp;")) return line;
  if (NUMBERED.test(line)) return line.replace(NUMBERED, "$1\\$2");
  return line.replace(/^( {0,3})(.)/, "$1\\$2");
}
const RichParagraph = Paragraph.extend({
  renderMarkdown(node, h, ctx) {
    const out = this.parent?.(node, h, ctx) ?? "";
    // a line of only spaces is a second break in a row: it is written as a backslash, which keeps it a break and not a blank line
    return out
      .split("\n")
      .map((l, i) => (i > 0 && !l.trim() ? "\\" : escapeLineStart(l)))
      .join("\n");
  },
});

/** An ATX heading ends at a closing run of `#`, so a trailing `#` in the text is escaped. */
const RichHeading = Heading.extend({
  renderMarkdown(node, h, ctx) {
    const out = this.parent?.(node, h, ctx) ?? "";
    return out.replace(/(^|\s)(#+)$/, (_m, a: string, b: string) => `${a}\\${b}`);
  },
});

// Markdown-looking text that is pasted stays text: it is not turned into marks ("2 * 3 * 4" must not become italic).
const noPaste = { addPasteRules: () => [] };
// Typed `*x*`, `**x**`, `_x_` become marks only as Markdown reads them: nothing but the text next to the signs, so "2 * 3 * 4" stays as typed.
const pair = (sign: string, edge: string) => new RegExp(`(?:^|\\s)(${sign}(?![\\s${edge}])([^${edge}]*[^\\s${edge}])${sign})$`);
const RichBold = Bold.extend({
  ...noPaste,
  addInputRules() {
    return [pair("\\*\\*", "*"), pair("__", "_")].map((find) => markInputRule({ find, type: this.type }));
  },
});
const RichItalic = Italic.extend({
  ...noPaste,
  addInputRules() {
    return [pair("\\*", "*"), pair("_", "_")].map((find) => markInputRule({ find, type: this.type }));
  },
});
const RichStrike = Strike.extend({
  ...noPaste,
  addInputRules() {
    return [markInputRule({ find: pair("~~", "~"), type: this.type })];
  },
});
const RichCode = Code.extend(noPaste);

/** `group=name` in a fence's info string: fences next to each other with the same name are shown as one block with a tab per language. */
const GROUP_ATTR = /(?:^|\s)group=([A-Za-z0-9_-]{1,32})(?=\s|$)/;

/** A fence's info string split into its language (everything but the group) and its group name. */
export function splitInfo(info: string): { language: string | null; group: string | null } {
  const m = GROUP_ATTR.exec(info);
  const language = (m ? info.replace(GROUP_ATTR, " ") : info).trim();
  return { language: language || null, group: m ? (m[1] as string) : null };
}

/** A new group name for the code blocks of one article. */
export const newCodeGroup = () => `g${Math.random().toString(36).slice(2, 7)}`;

/** Marks each code block that belongs to a group, and the first/last of a run, so the editor can draw them as one block. */
const codeGroupMarks = new Plugin({
  props: {
    decorations(state) {
      const out: Decoration[] = [];
      const items: { pos: number; size: number; group: string | null; lang: string }[] = [];
      state.doc.forEach((n, pos) => {
        items.push({
          pos,
          size: n.nodeSize,
          group: n.type.name === "codeBlock" ? ((n.attrs.group as string | null) ?? null) : null,
          lang: String(n.attrs.language ?? "") || "text",
        });
      });
      items.forEach((it, i) => {
        if (!it.group) return;
        const first = items[i - 1]?.group !== it.group;
        const last = items[i + 1]?.group !== it.group;
        const pos = first && last ? "solo" : first ? "first" : last ? "last" : "mid";
        out.push(Decoration.node(it.pos, it.pos + it.size, { class: `code-group code-group-${pos}`, "data-lang": it.lang }));
      });
      return out.length ? DecorationSet.create(state.doc, out) : DecorationSet.empty;
    },
  },
});

/** A code block fenced with more backticks than any line inside could close it with. */
const RichCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      group: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-group"),
        renderHTML: (a: Record<string, unknown>) => (a.group ? { "data-group": a.group as string } : {}),
      },
    };
  },
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), codeGroupMarks];
  },
  parseMarkdown(token, helpers) {
    if (token.raw?.startsWith("```") === false && token.raw?.startsWith("~~~") === false && token.codeBlockStyle !== "indented") return [];
    const { language, group } = splitInfo(String(token.lang ?? ""));
    return helpers.createNode("codeBlock", { language, group }, token.text ? [helpers.createTextNode(token.text)] : []);
  },
  renderMarkdown(node) {
    const code = (node.content ?? []).map((c) => c.text ?? "").join("");
    const lang = String(node.attrs?.language ?? "").replace(/[`\r\n]/g, "");
    const group = /^[A-Za-z0-9_-]{1,32}$/.test(String(node.attrs?.group ?? "")) ? String(node.attrs?.group) : "";
    const info = [lang, group ? `group=${group}` : ""].filter(Boolean).join(" ");
    let n = 3;
    for (const l of code.split("\n")) {
      const m = /^ {0,3}(`{3,})/.exec(l);
      if (m && (m[1] as string).length >= n) n = (m[1] as string).length + 1;
    }
    const f = "`".repeat(n);
    return `${f}${info}\n${code}\n${f}`;
  },
});

/** Image sources the editor keeps from pasted HTML: web addresses and the site's own uploads. Relative paths, file:, data: and the like are dropped. */
export const keepableImageSrc = (src: string): boolean => /^https?:\/\/[^\s]/i.test(src.trim()) || /^\/api\/uploads\//.test(src.trim());

/** Pasted images keep only src, alt and title (an `onerror` or style never comes along), and only from an address worth keeping. */
const RichImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const src = (e.getAttribute("src") ?? "").trim();
          if (!keepableImageSrc(src)) return false;
          return { src, alt: e.getAttribute("alt") ?? "", title: e.getAttribute("title") || null };
        },
      },
    ];
  },
  renderMarkdown(node) {
    const a = node.attrs ?? {};
    const alt = String(a.alt ?? "").replace(/[\\[\]]/g, "\\$&");
    const src = encodeDest(String(a.src ?? ""));
    const title = a.title ? ` "${String(a.title).replace(/[\\"]/g, "\\$&")}"` : "";
    return `![${alt}](${src}${title})`;
  },
});

export type RichOptions = { placeholder?: string; htmlLive?: AnyExtension; diagramEmbed?: AnyExtension };

/** The schema of the rich editor: what Markdown stories can hold, and nothing else. */
export function richExtensions(o: RichOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      underline: false,
      link: false,
      paragraph: false,
      codeBlock: false,
    }),
    RichCodeBlock.configure({ enableTabIndentation: false }),
    RichParagraph,
    RichHeading.configure({ levels: [2, 3] }),
    RichBold,
    RichItalic,
    RichStrike,
    RichCode,
    RichLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => keepableHref(url),
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
    }),
    RichImage.configure({ inline: true, allowBase64: false }),
    o.htmlLive ?? HtmlLive,
    o.diagramEmbed ?? DiagramEmbed,
    UploadPlaceholder,
    Placeholder.configure({ placeholder: o.placeholder ?? "" }),
    Markdown,
  ];
}

type Mark = { type: string; attrs?: Record<string, unknown> };
const EDGE_MARKS = new Set(["bold", "italic", "strike", "code", "link"]);
const markKey = (marks: Mark[] | undefined) =>
  (marks ?? [])
    .map((m) => `${m.type}${JSON.stringify(m.attrs ?? {})}`)
    .sort()
    .join("|");

/** Text with the spaces at its edges moved out of its marks (`**a **` is not bold in Markdown), and whitespace-only marked text unmarked. */
function splitEdges(n: JSONContent): JSONContent[] {
  const marks = (n.marks ?? []) as Mark[];
  if (n.type !== "text" || !marks.some((m) => EDGE_MARKS.has(m.type))) return [n];
  const text = n.text ?? "";
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
  const [, lead = "", core = "", trail = ""] = m;
  if (!core) return [{ type: "text", text }];
  const out: JSONContent[] = [];
  if (lead) out.push({ type: "text", text: lead });
  out.push({ ...n, text: core });
  if (trail) out.push({ type: "text", text: trail });
  return out;
}

/** A title is a tooltip: the characters parsers disagree on are left out. */
const cleanTitle = (t: unknown): string | null =>
  String(t ?? "")
    .replace(/[()*_`<>&[\]\\"~]/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;

function tidyMark(m: Mark): Mark {
  if (m.type !== "link") return m;
  const a = m.attrs ?? {};
  return { type: "link", attrs: { href: encodeDest(String(a.href ?? "")), title: cleanTitle(a.title) } };
}

const EMPHASIS = new Set(["bold", "italic", "strike"]);
const PUNCT = /[\p{P}\p{S}]/u;
const hasMark = (n: JSONContent | undefined, type: string) => ((n?.marks ?? []) as Mark[]).some((m) => m.type === type);
const linkOf = (n: JSONContent | undefined) => JSON.stringify(((n?.marks ?? []) as Mark[]).find((m) => m.type === "link")?.attrs ?? null);
/** The first / last character of a node as written in Markdown (a link starts with "[" and ends with ")", code is fenced with backticks). */
function srcEdge(n: JSONContent | undefined, other: JSONContent | undefined, side: "first" | "last"): string {
  if (!n || n.type === "hardBreak") return " ";
  if (n.type === "image") return side === "first" ? "!" : ")";
  if (hasMark(n, "link") && linkOf(n) !== linkOf(other)) return side === "first" ? "[" : ")";
  if (hasMark(n, "code") && !hasMark(other, "code")) return "`";
  const chars = [...(n.text ?? " ")];
  return (side === "first" ? chars[0] : chars[chars.length - 1]) ?? " ";
}

/**
 * Emphasis that starts or ends on punctuation right next to a letter is not emphasis in Markdown (`a**(b)**c` is plain text, and parsers differ
 * on the edges). Such a run is written without its mark. The editor's document and the text's document are both compared in this form.
 */
function shrinkToFlank(list: JSONContent[]): JSONContent[] {
  const out = list.map((n) => ({ ...n }));
  const touching = (c: string) => !/\s/.test(c);
  for (const type of EMPHASIS) {
    let i = 0;
    while (i < out.length) {
      if (!hasMark(out[i], type)) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < out.length && hasMark(out[j + 1], type)) j++;
      const first = srcEdge(out[i], out[i - 1], "first");
      const last = srcEdge(out[j], out[j + 1], "last");
      const before = out[i - 1] ? srcEdge(out[i - 1], out[i], "last") : " ";
      const after = out[j + 1] ? srcEdge(out[j + 1], out[j], "first") : " ";
      if ((PUNCT.test(first) && touching(before)) || (PUNCT.test(last) && touching(after)))
        for (let k = i; k <= j; k++) {
          const n = out[k] as JSONContent;
          const marks = ((n.marks ?? []) as Mark[]).filter((m) => m.type !== type);
          if (marks.length) n.marks = marks as JSONContent["marks"];
          else delete n.marks;
        }
      i = j + 1;
    }
  }
  return out;
}

const emphasisSet = (n: JSONContent) => ((n.marks ?? []) as Mark[]).filter((m) => EMPHASIS.has(m.type)).map((m) => m.type);

function dropEmphasis(n: JSONContent, types: string[]) {
  const marks = ((n.marks ?? []) as Mark[]).filter((m) => !types.includes(m.type));
  if (marks.length) n.marks = marks as JSONContent["marks"];
  else delete n.marks;
}

/**
 * Emphasis that changes inside a stretch (`**a *b* c**`, `**a**` touching `*b*`) is read differently by different Markdown parsers, so a stretch
 * of emphasized text keeps only the emphasis all of it has. A strike next to bold or italic is kept only when letters do not touch it.
 */
function unifyTouching(list: JSONContent[]): JSONContent[] {
  const out = list.map((n) => ({ ...n }));
  let i = 0;
  while (i < out.length) {
    if (out[i]?.type !== "text" || !emphasisSet(out[i] as JSONContent).length) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1]?.type === "text" && emphasisSet(out[j + 1] as JSONContent).length) j++;
    let common = emphasisSet(out[i] as JSONContent);
    for (let k = i + 1; k <= j; k++) common = common.filter((t) => emphasisSet(out[k] as JSONContent).includes(t));
    if (common.includes("strike") && common.length > 1) {
      const before = out[i - 1] ? srcEdge(out[i - 1], out[i], "last") : " ";
      const after = out[j + 1] ? srcEdge(out[j + 1], out[j], "first") : " ";
      if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) common = common.filter((t) => t !== "strike");
    }
    for (let k = i; k <= j; k++)
      dropEmphasis(
        out[k] as JSONContent,
        EMPHASIS_LIST.filter((t) => !common.includes(t)),
      );
    i = j + 1;
  }
  return out;
}
const EMPHASIS_LIST = ["bold", "italic", "strike"];

const linkKey = (n: JSONContent | undefined) => (hasMark(n, "link") ? linkOf(n) : "");

/** Emphasis and a link must nest (`**a [b](u)**`, `[**a** b](u)`); where they only overlap (`**a [b**](u)`) the emphasis is written without its mark. */
function uncrossLinks(list: JSONContent[]): JSONContent[] {
  const out = list.map((n) => ({ ...n }));
  const runs = (key: (n: JSONContent) => string) => {
    const r: { s: number; e: number; k: string }[] = [];
    out.forEach((n, i) => {
      const k = key(n);
      const last = r[r.length - 1];
      if (k && last && last.e === i - 1 && last.k === k) last.e = i;
      else if (k) r.push({ s: i, e: i, k });
    });
    return r;
  };
  const links = runs((n) => linkKey(n));
  for (const t of EMPHASIS) {
    for (const er of runs((n) => (hasMark(n, t) ? "1" : ""))) {
      const crossed = links.some((l) => l.s <= er.e && er.s <= l.e && !((l.s <= er.s && er.e <= l.e) || (er.s <= l.s && l.e <= er.e)));
      if (crossed) for (let k = er.s; k <= er.e; k++) dropEmphasis(out[k] as JSONContent, [t]);
    }
  }
  return out;
}

const MARK_ORDER = ["bold", "italic", "strike", "link", "code"];
/** Marks in the order the writer nests them: emphasis outside the link, or inside it when the link is the longer one. */
function orderMarks(list: JSONContent[]): JSONContent[] {
  const lenOf = (i: number, test: (n: JSONContent) => boolean) => {
    let s = i;
    let e = i;
    while (s > 0 && test(list[s - 1] as JSONContent)) s--;
    while (e + 1 < list.length && test(list[e + 1] as JSONContent)) e++;
    return e - s;
  };
  return list.map((n, i) => {
    if (n.type !== "text" || !n.marks?.length) return n;
    const marks = [...(n.marks as Mark[])];
    const rank = (m: Mark) => MARK_ORDER.indexOf(m.type);
    marks.sort((a, b) => rank(a) - rank(b));
    const link = marks.find((m) => m.type === "link");
    const emph = marks.filter((m) => EMPHASIS.has(m.type));
    if (link && emph.length) {
      const linkLen = lenOf(i, (x) => linkKey(x) === linkKey(n));
      const longestEmph = Math.max(...emph.map((m) => lenOf(i, (x) => hasMark(x, m.type))));
      if (linkLen > longestEmph) return { ...n, marks: [link, ...emph, ...marks.filter((m) => m !== link && !emph.includes(m))] as JSONContent["marks"] };
    }
    return { ...n, marks: marks as JSONContent["marks"] };
  });
}

/** The editor's inline content in the one form Markdown can hold: merged runs, no spaces at the edges of marks, lines or blocks. */
function tidyInline(nodes: JSONContent[], heading: boolean): JSONContent[] {
  const merge = (list: JSONContent[]) => {
    const out: JSONContent[] = [];
    for (const n of list) {
      const last = out[out.length - 1];
      if (n.type === "text" && !n.text) continue;
      if (last && n.type === "text" && last.type === "text" && markKey(last.marks as Mark[]) === markKey(n.marks as Mark[]))
        last.text = (last.text ?? "") + (n.text ?? "");
      else out.push({ ...n });
    }
    return out;
  };
  let list = nodes.map((n): JSONContent => {
    if (n.type === "hardBreak") return heading ? { type: "text", text: " " } : { type: "hardBreak" };
    if (n.type === "image") {
      const a = n.attrs ?? {};
      return {
        type: "image",
        attrs: {
          src: encodeDest(String(a.src ?? "")),
          alt: String(a.alt ?? "")
            .replace(/[\\`<>]/g, "")
            .replace(/\[\^/g, "[")
            .replace(/\s+/g, " ")
            .trim(),
          title: cleanTitle(a.title),
        },
      };
    }
    if (n.type !== "text") return n;
    // code that holds a backtick or a backslash is written as plain text (parsers disagree on those)
    if (/[`\\]/.test(n.text ?? "") && n.marks?.some((m) => (m as Mark).type === "code"))
      n = { ...n, marks: (n.marks as Mark[]).filter((m) => m.type !== "code") as JSONContent["marks"] };
    // a tab inside a line is read back as spaces
    const t = n.text?.includes("\t") ? { ...n, text: n.text.replace(/\t/g, " ") } : n;
    return n.marks?.length ? { ...t, marks: (n.marks as Mark[]).map(tidyMark) as JSONContent["marks"] } : t;
  });
  for (let round = 0; round < 4; round++) {
    const before = JSON.stringify(list);
    list = merge(uncrossLinks(unifyTouching(shrinkToFlank(merge(list.flatMap(splitEdges))))));
    if (JSON.stringify(list) === before) break;
  }
  // spaces at the start and end of a block and around a line break are not kept by Markdown
  list = list.map((n, i) => {
    if (n.type !== "text") return n;
    let t = n.text ?? "";
    const prev = list[i - 1];
    const next = list[i + 1];
    if (!prev || prev.type === "hardBreak") t = t.replace(/^\s+/, "");
    if (!next || next.type === "hardBreak") t = t.replace(/\s+$/, "");
    return { ...n, text: t };
  });
  list = merge(list);
  while (list[0]?.type === "hardBreak") list.shift();
  while (list[list.length - 1]?.type === "hardBreak") list.pop();
  return orderMarks(list);
}

const INLINE = new Set(["text", "image", "hardBreak"]);

/** Two lists of the same kind with only a blank line between are one list in Markdown. */
function joinLists(blocks: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && b.type === last.type && (b.type === "bulletList" || b.type === "orderedList"))
      out[out.length - 1] = { ...last, content: [...(last.content ?? []), ...(b.content ?? [])] };
    else out.push(b);
  }
  return out;
}

const isList = (b: JSONContent | undefined) => b?.type === "bulletList" || b?.type === "orderedList";

/** Inside a list item, a block after a nested list is read back as part of that list's last item, so that is where it is written. */
function attachAfterLists(blocks: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    const lastItem = last?.content?.[last.content.length - 1];
    if (last && isList(last) && !isList(b) && lastItem) {
      const items = [...(last.content ?? [])];
      items[items.length - 1] = { ...lastItem, content: attachAfterLists([...(lastItem.content ?? []), b]) };
      out[out.length - 1] = { ...last, content: items };
    } else if (last?.type === "blockquote" && b.type === "blockquote")
      out[out.length - 1] = { ...last, content: [...(last.content ?? []), ...(b.content ?? [])] };
    else out.push(b);
  }
  return out;
}

const isEmptyPara = (k: JSONContent) => k.type === "paragraph" && !(k.content?.length ?? 0);

/**
 * The one form of a document that Markdown round-trips to: what the editor holds and what the text parses to are compared through it.
 * What Markdown cannot hold (an empty list item, an empty quote) is left out, as an empty paragraph already is.
 */
function tidy(n: JSONContent): JSONContent | null {
  if (!n.content) return n;
  if (n.type === "paragraph" || n.type === "heading") return { ...n, content: tidyInline(n.content, n.type === "heading") };
  if (n.type === "codeBlock") {
    // a block of blank lines is read back as an empty one
    const blank = (n.content ?? []).every((c) => !(c.text ?? "").trim());
    return blank ? { type: "codeBlock", attrs: n.attrs } : n;
  }
  const kids: JSONContent[] = [];
  let run: JSONContent[] = [];
  const close = () => {
    if (run.length) kids.push({ type: "paragraph", content: tidyInline(run, false) });
    run = [];
  };
  for (const k of n.content) {
    if (INLINE.has(k.type ?? "")) {
      // an image the parser left bare is a paragraph of its own
      if (k.type === "image") close();
      run.push(k);
      if (k.type === "image") close();
    } else {
      close();
      const t = tidy(k);
      if (t) kids.push(t);
    }
  }
  close();
  if (n.type === "doc") return { ...n, content: joinLists(kids.filter((k) => !isEmptyPara(k))) };
  if (n.type === "blockquote" || n.type === "listItem" || n.type === "bulletList" || n.type === "orderedList") {
    let real = kids.filter((k) => !isEmptyPara(k));
    // a quote at the start of a list item is read back as the text "> ": it is written as its paragraphs
    if (n.type === "listItem" && real[0]?.type === "blockquote") real = real.flatMap((k) => (k.type === "blockquote" ? (k.content ?? []) : [k]));
    if (!real.length) return null;
    if (n.type === "bulletList" || n.type === "orderedList") {
      // a list that starts an item (`- - a`) is read back as text: its items join this list
      const items = kids.flatMap((k) =>
        k.type === "listItem" && (k.content?.[0]?.type === "bulletList" || k.content?.[0]?.type === "orderedList") ? (k.content[0].content ?? []) : [k],
      );
      return { ...n, content: items };
    }
    return { ...n, content: n.type === "listItem" ? attachAfterLists(joinLists(real)) : joinLists(real) };
  }
  return { ...n, content: kids };
}

/** Doc JSON without what must not reach the Markdown: upload placeholders, and the empty paragraphs the editor leaves around. */
export function cleanDoc(doc: JSONContent): JSONContent {
  const strip = (n: JSONContent): JSONContent | null => {
    if (n.type === "uploadPlaceholder") return null;
    if (!n.content) return n;
    const kids = n.content.map(strip).filter((x): x is JSONContent => x !== null);
    return { ...n, content: kids };
  };
  const top = (doc.content ?? []).map(strip).filter((x): x is JSONContent => x !== null);
  return tidy({ ...doc, content: top }) as JSONContent;
}

const isCode = (node: JSONContent, parent?: JSONContent) =>
  parent?.type === "codeBlock" || (node.marks ?? []).some((m) => (typeof m === "string" ? m : m.type) === "code");
const ALNUM = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

/** Escapes only what could change meaning when the text is read back as Markdown (the stock escaping also hits every `_` and `&`). */
export function escapeText(text: string, linked = false): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (c === "\\" || c === "`" || c === "[" || c === "]" || c === "~") out += `\\${c}`;
    else if (c === "*") out += prev !== undefined && next !== undefined && SPACE.test(prev) && SPACE.test(next) ? c : "\\*";
    else if (c === "_") out += prev !== undefined && next !== undefined && ALNUM.test(prev) && ALNUM.test(next) ? c : "\\_";
    else if (c === "<") out += prev !== undefined && next !== undefined && SPACE.test(prev) && SPACE.test(next) ? c : "\\<";
    else if (c === "&") out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i)) ? "\\&" : c;
    else if (c === ":" && !linked && /^:\/\//.test(text.slice(i)) && /(?:https?|ftp)$/i.test(text.slice(0, i))) out += "\\:";
    else if (c === "." && !linked && /^www$/i.test(text.slice(Math.max(0, i - 3), i))) out += "\\.";
    else if (c === "@") out += "\\@";
    else if ((c === "(" || c === ")") && linked) out += `\\${c}`;
    else out += c;
  }
  return out;
}

type Patchable = { encodeTextForMarkdown: (text: string, node: JSONContent, parent?: JSONContent) => string };
/** Swaps the Markdown manager's text escaping for `escapeText` (the manager has no option for it). */
export function patchEditor(ed: Editor): Editor {
  const m = ed.markdown as unknown as Patchable | undefined;
  if (m)
    m.encodeTextForMarkdown = (text, node, parent) =>
      isCode(node, parent)
        ? text
        : escapeText(
            text,
            (node.marks ?? []).some((k) => (typeof k === "string" ? k : k.type) === "link"),
          );
  return ed;
}

let headless: Editor | null = null;
export function engine(): Editor {
  headless ??= patchEditor(new Editor({ extensions: richExtensions(), content: "" }));
  return headless;
}

/** Markdown to a document (JSON). */
export const parseMarkdown = (md: string, ed: Editor = engine()): JSONContent => ed.markdown?.parse(md) as JSONContent;

/** A document to Markdown. */
export const serializeDoc = (doc: JSONContent, ed: Editor = engine()): string => (ed.markdown?.serialize(cleanDoc(doc)) ?? "").replace(/[ \t\r\n]+$/, "");

type Tok = { type?: string; raw?: string; text?: string; href?: string; depth?: number; loose?: boolean; task?: boolean; tokens?: Tok[]; items?: Tok[] };

function scan(tokens: Tok[], nested: boolean, inLink = false): RichProblem | null {
  for (const t of tokens) {
    let p: RichProblem | null = null;
    switch (t.type) {
      case "space":
      case "paragraph":
      case "strong":
      case "em":
      case "codespan":
      case "br":
      case "escape":
      case "hr":
      case "code":
      case "del":
      case "image":
      case "blockquote":
      case "list_item":
      case "diagramEmbed":
        break;
      case "text":
        if (!inLink && !t.tokens?.length && /(?<!\\)\[\^[^\]\s]+\]/.test(t.raw ?? "")) p = "footnote";
        break;
      case "htmlLive":
        if (nested) p = "live";
        break;
      case "heading":
        if (t.depth !== 2 && t.depth !== 3) p = "heading";
        break;
      case "link":
        if (!keepableHref(t.href ?? "")) p = "link";
        break;
      case "list":
        if (t.loose) p = "looseList";
        break;
      case "html":
        p = "html";
        break;
      case "table":
        p = "table";
        break;
      case "def":
        p = "definition";
        break;
      default:
        p = "unknown";
    }
    if (t.type === "list_item" && t.task) p = "task";
    if (p) return p;
    const kids = [...(t.tokens ?? []), ...(t.items ?? [])];
    if (kids.length) {
      const q = scan(kids, nested || t.type === "list" || t.type === "list_item" || t.type === "blockquote", inLink || t.type === "link");
      if (q) return q;
    }
  }
  return null;
}

const EMBED_URL = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)\S+$/;

/** The rich view of a body as comparable nodes. */
function asNode(ed: Editor, doc: JSONContent): PMNode {
  return PMNode.fromJSON(ed.schema, cleanDoc(doc));
}

const liveOf = (md: string) => scanLive(md).map((b) => `${b.height ?? ""}\u0000${b.code}`);
const liveOfDoc = (doc: JSONContent) =>
  (doc.content ?? []).filter((n) => n.type === "htmlLive").map((n) => `${n.attrs?.height ?? ""}\u0000${n.attrs?.code ?? ""}`);

/**
 * Can the rich editor hold this Markdown without losing or changing anything that matters?
 * Parses to the editor's document, writes it back, parses that again, and requires both documents to be the same. Syntax the editor does not
 * model at all (raw HTML, tables, footnotes, reference links, tasks, other heading levels, unsafe links, loose lists) is refused up front,
 * because parsing could silently drop it.
 */
export function canRoundTrip(md: string): RoundTrip {
  try {
    if (!md.trim()) return { ok: true };
    if (md.includes("\r")) return { ok: false, problem: "crlf" };
    const ed = engine();
    const lexer = ed.markdown?.instance.lexer as ((s: string) => Tok[]) | undefined;
    if (!lexer) return { ok: false, problem: "error" };
    const bad = scan(lexer(md), false);
    if (bad) return { ok: false, problem: bad };
    if (/^\s*\[\^[^\]\s]+\]:/m.test(md)) return { ok: false, problem: "footnote" };
    const d1 = parseMarkdown(md, ed);
    const n1 = asNode(ed, d1);
    // a live block the server runs must be a live block here, and the other way round
    if (JSON.stringify(liveOf(md)) !== JSON.stringify(liveOfDoc(d1))) return { ok: false, problem: "live" };
    const md2 = serializeDoc(d1, ed);
    const d2 = parseMarkdown(md2, ed);
    const n2 = asNode(ed, d2);
    if (!n1.eq(n2)) return { ok: false, problem: "changes" };
    if (JSON.stringify(liveOf(md2)) !== JSON.stringify(liveOf(md))) return { ok: false, problem: "live" };
    // a video link must stay alone on its line (the server embeds only those)
    for (const line of md.split("\n"))
      if (EMBED_URL.test(line.trim()) && !md2.split("\n").some((l) => l.trim() === line.trim())) return { ok: false, problem: "embed" };
    return { ok: true };
  } catch {
    return { ok: false, problem: "error" };
  }
}

/** Do two Markdown strings give the same rich document? (Used to keep the original bytes while nothing was edited.) */
export function sameRichDoc(a: JSONContent, b: JSONContent): boolean {
  const ed = engine();
  try {
    return asNode(ed, a).eq(asNode(ed, b));
  } catch {
    return false;
  }
}
