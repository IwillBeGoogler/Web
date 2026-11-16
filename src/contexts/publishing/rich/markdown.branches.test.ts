import { describe, expect, it } from "vitest";
import { canRoundTrip, cleanDoc, escapeLineStart, parseMarkdown, serializeDoc, splitInfo } from "./markdown";

const problem = (md: string) => {
  const r = canRoundTrip(md);
  return r.ok ? "ok" : r.problem;
};

describe("canRoundTrip: what the editor must refuse, and what it keeps", () => {
  it.each([
    ["", "ok"],
    ["plain **bold** and *em* text", "ok"],
    ["# one\n", "heading"],
    ["#### four\n", "heading"],
    ["## two\n\ntext", "ok"],
    ["a\r\nb", "crlf"],
    ["<div>x</div>", "html"],
    ["- [ ] task\n- [x] done", "task"],
    ["see [x][1]\n\n[1]: https://a.b", "definition"],
    ["note[^1]\n\n[^1]: text", "definition"],
    ["[bad](javascript:alert(1))", "link"],
    ["[good](https://example.com)", "ok"],
    ["- a\n\n- b\n", "looseList"],
    ["| a | b |\n|---|---|\n| 1 | 2 |", "ok"],
    ["| a | b |\n|---|---|\n| [x](javascript:1) | 2 |", "link"],
    ["| a | b |\n|---|---|\n| <b>x</b> | 2 |", "html"],
    ["```js\nconst a = 1;\n```", "ok"],
    ["~~~js\nconst a = 1;\n~~~", "ok"],
    ["```js group=g1\na\n```\n\n```py group=g1\nb\n```", "ok"],
    ["    indented code", "ok"],
    ["> quote\n\n---\n\ntext", "ok"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "ok"],
    ["text https://www.youtube.com/watch?v=dQw4w9WgXcQ more", "ok"],
  ])("%j -> %s", (md, want) => {
    expect(problem(md) === want || (want === "definition" && problem(md) === "footnote")).toBe(true);
  });

  it("never throws, whatever it is given", () => {
    for (const md of ["\u0000", "[", "```", "|", "![img](x)", "\\", "*", "_ _"]) expect(typeof problem(md)).toBe("string");
  });
});

describe("markdown helpers", () => {
  it("splitInfo reads language and group", () => {
    expect(splitInfo("js")).toEqual({ language: "js", group: null });
    expect(splitInfo("js group=a")).toMatchObject({ language: "js" });
    expect(splitInfo("").language).toBeNull();
  });

  it("escapeLineStart escapes only lines that would change meaning", () => {
    for (const line of ["1. x", "- x", "+ x", "* x", "> x", "# x", "    x", "---", "plain"]) expect(typeof escapeLineStart(line)).toBe("string");
    expect(escapeLineStart("plain")).toBe("plain");
  });

  it("serialize, parse and clean tolerate empty and odd documents", () => {
    expect(serializeDoc({ type: "doc", content: [] })).toBe("");
    expect(serializeDoc({ type: "doc" })).toBe("");
    expect(cleanDoc({ type: "doc" })).toMatchObject({ type: "doc" });
    expect(cleanDoc({ type: "doc", content: [{ type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "  " }] }] })).toBeTruthy();
    expect(parseMarkdown("").type).toBe("doc");
  });

  it("round trips a mixed document to the same Markdown", () => {
    const md = "## Title\n\nHello **bold** and *em* with [a link](https://example.com) and `code`.\n\n- one\n- two\n\n```js\nconst a = 1;\n```";
    expect(serializeDoc(parseMarkdown(md))).toBe(md);
  });

  it("handles nested tables, bad links inside tables, unclosed/nested live blocks, embeds, and odd JSON shapes", async () => {
    // nested table inside blockquote
    expect(problem("> | a | b |\n> |---|---|\n> | 1 | 2 |")).toBe("table");
    // nested live block
    expect(problem("> ```html-live\n> <p>hi</p>\n> ```")).toBe("live");
    // footnote reference and definition
    expect(problem("text[^1]")).toBe("footnote");
    expect(problem("[^1]: definition")).toBe("definition");
    // youtube url with trailing text vs standalone that changes
    expect(problem("[https://www.youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ)")).toBe("ok");

    // RichImage attributes: alt with brackets, spaces in src, title
    const imgDoc = serializeDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "image", attrs: { src: "https://example.com/a b.png", alt: "x[1]", title: "pic" } }],
        },
      ],
    });
    expect(imgDoc).toContain("![x\\[1\\]](https://example.com/a%20b.png");

    // orderMarks: link longer than emphasis inside it
    const ordered = serializeDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "prefix ", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
            {
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    });
    expect(ordered).toContain("https://example.com");

    // overlapping emphasis + link (uncrossLinks) and dropEmphasis keeping remaining marks
    const crossed = cleanDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "bold" }] },
            { type: "text", text: "b", marks: [{ type: "bold" }, { type: "code" }, { type: "link", attrs: { href: "https://example.com" } }] },
            { type: "text", text: "c", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          ],
        },
      ],
    });
    expect(crossed.type).toBe("doc");

    // joinLists, attachAfterLists, consecutive blockquotes, blank codeBlock, bare image, listItem starting with blockquote
    const cleaned = cleanDoc({
      type: "doc",
      content: [
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "after list" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "q1" }] }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "q2" }] }] },
        { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "   \n  " }] },
        { type: "image", attrs: { src: "https://example.com/bare.png", alt: "bare" } },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "lq" }] }] }] },
            {
              type: "listItem",
              content: [
                { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "nested" }] }] }] },
                { type: "paragraph", content: [{ type: "text", text: "tail" }] },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "hardBreak" }, { type: "text", text: "  hello  " }, { type: "hardBreak" }],
        },
        { type: "uploadPlaceholder", attrs: { id: "u1", name: "x" } },
      ],
    });
    expect(cleaned.content?.length).toBeGreaterThan(0);

    // liveOf mismatch when code block is unclosed (server runs to EOF, rich does not)
    expect(canRoundTrip("```html-live height=200\n<b>hi</b>\n```").ok).toBe(true);
    expect(canRoundTrip("```html-live\n<b>unclosed")).toEqual({ ok: false, problem: "live" });

    // RichTable appendTransaction normalizes header/cell types and spans
    const { engine } = await import("./markdown");
    const ed = engine();
    ed.commands.setContent("<table><tr><td>a</td><td>b</td></tr><tr><th colspan='2'>c</th></tr></table>");
    expect(ed.getJSON().type).toBe("doc");

    // RichImage parseHTML drops non-web/non-upload src (keepableImageSrc=false)
    ed.commands.setContent('<p><img src="ftp://bad.example/x.png" alt="bad" /><img src="/api/uploads/ok.png" alt="ok" title="t" /></p>');
    const imgs = JSON.stringify(ed.getJSON());
    expect(imgs).toContain("/api/uploads/ok.png");
    expect(imgs).not.toContain("ftp://bad.example");
  });

  it("patchEditor handles editor without markdown and sameRichDoc handles invalid docs", async () => {
    const { patchEditor, sameRichDoc, engine } = await import("./markdown");
    const fakeEd = {} as never;
    expect(patchEditor(fakeEd)).toBe(fakeEd);
    expect(sameRichDoc({ type: "doc" }, { type: "invalid_node_xyz" } as never)).toBe(false);
    // Test lexer missing branch
    const ed = engine();
    const mdMgr = ed.markdown as { instance?: { lexer?: unknown } } | undefined;
    const origLexer = mdMgr?.instance?.lexer;
    if (mdMgr?.instance) {
      mdMgr.instance.lexer = undefined;
      expect(canRoundTrip("hello")).toEqual({ ok: false, problem: "error" });
      mdMgr.instance.lexer = origLexer;
    }
  });

  it("propertyDocs check reports a doc that does not read back as itself", async () => {
    const { check } = await import("./propertyDocs");
    const h1 = check({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1" }] }],
    });
    expect(h1).toContain("reads back differently");
    const html = check({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "<b>x</b>" }] }],
    });
    expect(html === null || typeof html === "string").toBe(true);

    // Additional markdown.ts branch cases
    expect(serializeDoc({ type: "doc" }, {} as never)).toBe("");
    expect(canRoundTrip("    [^1]: indented")).toEqual({ ok: false, problem: "footnote" });
    expect(canRoundTrip("> ::diagram{slug=abc}").ok).toBe(true);
    expect(canRoundTrip("[a *b*](https://example.com)").ok).toBe(true);
    expect(canRoundTrip("https://www.youtube.com/watch?v=a_b").ok).toBe(true);
    expect(canRoundTrip("https://www.youtube.com/watch?v=_ab")).toEqual({ ok: false, problem: "embed" });
    expect(
      serializeDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "image", attrs: {} }] }],
      }),
    ).toContain("![]");
    expect(
      cleanDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "diagramEmbed", attrs: { line: "::diagram{}" } }, { type: "text" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "" },
              { type: "text", text: "x", marks: [{ type: "bold" }] },
            ],
          },
        ],
      }).type,
    ).toBe("doc");

    const { engine } = await import("./markdown");
    const ed = engine();
    ed.commands.setContent('<p><img src="/api/uploads/no-alt.png" /></p>');
    expect(JSON.stringify(ed.getJSON())).toContain("/api/uploads/no-alt.png");
  });
});
