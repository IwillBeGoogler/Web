import { Node } from "@tiptap/core";
import { FENCE_CLOSE, LIVE_LANG, liveInfo } from "./liveScan";

/** `::diagram{slug=…}` on a line of its own: the story shows that diagram as a card. */
export const DIAGRAM_LINE = /^ {0,3}(::diagram\{[^{}\n]*\})[ \t]*$/;

const lineStart = (src: string, re: RegExp) => {
  const m = re.exec(src);
  if (!m) return -1;
  return m.index + (m[0].startsWith("\n") ? 1 : 0);
};

/** A runnable HTML/CSS/JS block, stored as a ```html-live fence. The source is kept exactly as written. */
export const HtmlLive = Node.create({
  name: "htmlLive",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      code: { default: "" },
      height: { default: null as number | null },
      fence: { default: "```" },
    };
  },
  // the attributes ride in the element so that copy and paste inside the editor keeps the block
  parseHTML() {
    return [
      {
        tag: "div[data-html-live]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          const h = Number(e.getAttribute("data-height"));
          return {
            code: e.getAttribute("data-code") ?? "",
            height: Number.isInteger(h) && h > 0 ? h : null,
            fence: e.getAttribute("data-fence") === "~~~" ? "~~~" : "```",
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return ["div", { "data-html-live": "", "data-code": node.attrs.code, "data-height": node.attrs.height ?? "", "data-fence": node.attrs.fence }];
  },
  markdownTokenName: "htmlLive",
  markdownTokenizer: {
    name: "htmlLive",
    level: "block",
    start: (src: string) => lineStart(src, /(?:^|\n) {0,3}(?:`{3,}|~{3,})[ \t]*html-live/),
    tokenize(src: string) {
      const lines = src.split("\n");
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[0] ?? "");
      if (!open) return undefined;
      const fence = open[1] as string;
      const info = (open[2] as string).trim();
      if (fence[0] === "`" && info.includes("`")) return undefined;
      const live = liveInfo(info);
      if (!live) return undefined;
      const code: string[] = [];
      let end = -1;
      for (let i = 1; i < lines.length; i++) {
        const c = FENCE_CLOSE.exec(lines[i] as string);
        if (c && (c[1] as string)[0] === fence[0] && (c[1] as string).length >= fence.length) {
          end = i;
          break;
        }
        code.push(lines[i] as string);
      }
      if (end < 0) return undefined; // unclosed: the page runs it to the end of the text; keep that case in Markdown mode
      const raw = lines.slice(0, end + 1).join("\n") + (end + 1 < lines.length ? "\n" : "");
      return { type: "htmlLive", raw, code: code.join("\n"), height: live.height, fence };
    },
  },
  parseMarkdown: (token, h) => h.createNode("htmlLive", { code: token.code ?? "", height: token.height ?? null, fence: token.fence ?? "```" }),
  renderMarkdown: (node) => {
    const code = String(node.attrs?.code ?? "");
    const height = node.attrs?.height as number | null | undefined;
    const base = String(node.attrs?.fence ?? "```");
    const ch = base[0] === "~" ? "~" : "`";
    // the fence must be longer than any line inside that could close it
    let n = Math.max(3, base.length);
    for (const l of code.split("\n")) {
      const c = FENCE_CLOSE.exec(l);
      if (c && (c[1] as string)[0] === ch && (c[1] as string).length >= n) n = (c[1] as string).length + 1;
    }
    const f = ch.repeat(n);
    const info = `${LIVE_LANG}${height != null ? ` height=${height}` : ""}`;
    return `${f}${info}\n${code === "" ? "" : `${code}\n`}${f}`;
  },
});

/** A diagram of the author's, embedded with `::diagram{slug=…}` (or `file=`). Shown as a card; the line is stored as it was written. */
export const DiagramEmbed = Node.create({
  name: "diagramEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { line: { default: "::diagram{}" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-diagram-embed]",
        getAttrs: (el) => {
          const line = (el as HTMLElement).getAttribute("data-line") ?? "";
          return DIAGRAM_LINE.test(line) ? { line: line.trim() } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return ["div", { "data-diagram-embed": "", "data-line": node.attrs.line }];
  },
  markdownTokenName: "diagramEmbed",
  markdownTokenizer: {
    name: "diagramEmbed",
    level: "block",
    start: (src: string) => lineStart(src, /(?:^|\n) {0,3}::diagram\{/),
    tokenize(src: string) {
      const nl = src.indexOf("\n");
      const first = nl < 0 ? src : src.slice(0, nl);
      const m = DIAGRAM_LINE.exec(first);
      if (!m) return undefined;
      return { type: "diagramEmbed", raw: nl < 0 ? src : src.slice(0, nl + 1), line: m[1] };
    },
  },
  parseMarkdown: (token, h) => h.createNode("diagramEmbed", { line: token.line }),
  renderMarkdown: (node) => String(node.attrs?.line ?? ""),
});

/** An image on its way up. It exists only in the editor: it is never written into the Markdown. */
export const UploadPlaceholder = Node.create({
  name: "uploadPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: "" }, name: { default: "" } };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return ["span", { "data-upload": node.attrs.id, class: "rich-upload", contenteditable: "false" }, `${node.attrs.name || "image"}…`];
  },
  renderMarkdown: () => "",
});
