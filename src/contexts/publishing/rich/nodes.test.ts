import { describe, expect, it } from "vitest";
import { DiagramEmbed, HtmlLive, MathBlock, MathInline, UploadPlaceholder } from "./nodes";

// biome-ignore lint/suspicious/noExplicitAny: calling Tiptap node config hooks directly
const cfg = (n: unknown) => (n as { config: any }).config;
const attrsOf = (n: unknown, html: string) => {
  const rule = cfg(n).parseHTML.call({})[0];
  const el = new DOMParser().parseFromString(html, "text/html").body.firstElementChild as HTMLElement;
  return rule.getAttrs(el);
};

describe("HtmlLive node", () => {
  it("parses attributes from the element, with defaults", () => {
    expect(attrsOf(HtmlLive, '<div data-html-live data-code="x" data-height="300" data-fence="~~~"></div>')).toEqual({ code: "x", height: 300, fence: "~~~" });
    expect(attrsOf(HtmlLive, "<div data-html-live></div>")).toEqual({
      code: "",
      height: null,
      fence: "```",
    });
    expect(attrsOf(HtmlLive, '<div data-html-live data-height="1.5"></div>').height).toBeNull();
    expect(cfg(HtmlLive).addAttributes.call({}).fence.default).toBe("```");
  });
  it("renders HTML", () => {
    expect(
      cfg(HtmlLive).renderHTML({
        node: { attrs: { code: "c", height: null, fence: "```" } },
      })[1]["data-height"],
    ).toBe("");
    expect(
      cfg(HtmlLive).renderHTML({
        node: { attrs: { code: "c", height: 5, fence: "```" } },
      })[1]["data-height"],
    ).toBe(5);
  });
  const t = cfg(HtmlLive).markdownTokenizer;
  it("finds the start", () => {
    expect(t.start("a\n```html-live\nx\n```")).toBe(2);
    expect(t.start("```html-live\nx")).toBe(0);
    expect(t.start("nothing")).toBe(-1);
  });
  it("tokenizes closed fences only", () => {
    expect(t.tokenize("not a fence")).toBeUndefined();
    expect(t.tokenize("```js\nx\n```")).toBeUndefined();
    expect(t.tokenize("``` html-live `x`\nx\n```")).toBeUndefined();
    expect(t.tokenize("```html-live\nunclosed")).toBeUndefined();
    expect(t.tokenize("```html-live height=200\na\nb\n```").code).toBe("a\nb");
    expect(t.tokenize("```html-live\na\n```\nmore").raw).toBe("```html-live\na\n```\n");
    // a shorter or different closing fence does not close
    expect(t.tokenize("````html-live\na\n```\nb\n````").code).toBe("a\n```\nb");
    expect(t.tokenize("~~~html-live\na\n```\nb\n~~~").code).toBe("a\n```\nb");
    expect(t.tokenize("")).toBeUndefined();
  });
  it("creates nodes with defaults and writes fences longer than inner ones", () => {
    const made: unknown[] = [];
    const h = { createNode: (n: string, a: unknown) => made.push([n, a]) };
    cfg(HtmlLive).parseMarkdown({}, h);
    cfg(HtmlLive).parseMarkdown({ code: "c", height: 2, fence: "~~~" }, h);
    expect(made[0]).toEqual(["htmlLive", { code: "", height: null, fence: "```" }]);
    const r = cfg(HtmlLive).renderMarkdown;
    expect(r({ attrs: {} })).toBe("```html-live\n```");
    expect(r({ attrs: { code: "a", height: 10, fence: "~~~" } })).toBe("~~~html-live height=10\na\n~~~");
    expect(r({ attrs: { code: "x\n```\ny" } })).toBe("````html-live\nx\n```\ny\n````");
    expect(r({})).toBe("```html-live\n```");
  });
});

describe("DiagramEmbed node", () => {
  it("parses only valid lines", () => {
    expect(attrsOf(DiagramEmbed, '<div data-diagram-embed data-line="::diagram{slug=a}"></div>')).toEqual({ line: "::diagram{slug=a}" });
    expect(attrsOf(DiagramEmbed, '<div data-diagram-embed data-line="bad"></div>')).toBe(false);
    expect(attrsOf(DiagramEmbed, "<div data-diagram-embed></div>")).toBe(false);
    expect(cfg(DiagramEmbed).addAttributes.call({}).line.default).toBe("::diagram{}");
    expect(cfg(DiagramEmbed).renderHTML({ node: { attrs: { line: "l" } } })[1]["data-line"]).toBe("l");
  });
  const t = cfg(DiagramEmbed).markdownTokenizer;
  it("tokenizes", () => {
    expect(t.start("x\n::diagram{slug=a}")).toBe(2);
    expect(t.start("::diagram{a}")).toBe(0);
    expect(t.tokenize("::diagram{slug=a}").raw).toBe("::diagram{slug=a}");
    expect(t.tokenize("::diagram{slug=a}\nrest").raw).toBe("::diagram{slug=a}\n");
    expect(t.tokenize("text")).toBeUndefined();
    let made: unknown;
    cfg(DiagramEmbed).parseMarkdown({ line: "L" }, { createNode: (...a: unknown[]) => (made = a) });
    expect(made).toEqual(["diagramEmbed", { line: "L" }]);
    expect(cfg(DiagramEmbed).renderMarkdown({ attrs: { line: "z" } })).toBe("z");
    expect(cfg(DiagramEmbed).renderMarkdown({})).toBe("");
  });
});

describe("UploadPlaceholder node", () => {
  it("renders a label and no markdown", () => {
    const c = cfg(UploadPlaceholder);
    expect(c.addAttributes.call({}).id.default).toBe("");
    expect(c.parseHTML.call({})).toEqual([]);
    expect(c.renderHTML({ node: { attrs: { id: "1", name: "" } } })[2]).toBe("image…");
    expect(c.renderHTML({ node: { attrs: { id: "1", name: "a.png" } } })[2]).toBe("a.png…");
    expect(c.renderMarkdown()).toBe("");
  });
});

describe("MathBlock node", () => {
  const t = cfg(MathBlock).markdownTokenizer;
  it("parses and renders HTML", () => {
    expect(attrsOf(MathBlock, '<div data-math-block data-tex="x" data-one-line="1"></div>')).toEqual({ tex: "x", oneLine: true });
    expect(attrsOf(MathBlock, "<div data-math-block></div>")).toEqual({ tex: "", oneLine: false });
    expect(cfg(MathBlock).addAttributes.call({}).tex.default).toBe("");
    expect(cfg(MathBlock).renderHTML({ node: { attrs: { tex: "a", oneLine: true } } })[1]["data-one-line"]).toBe("1");
    expect(cfg(MathBlock).renderHTML({ node: { attrs: { tex: "a", oneLine: false } } })[1]["data-one-line"]).toBe("0");
  });
  it("finds the start", () => {
    expect(t.start("a\n$$\nx\n$$")).toBe(2);
    expect(t.start("$$x$$")).toBe(0);
    expect(t.start("no math")).toBe(-1);
  });
  it("tokenizes fenced and one-line blocks, keeping the raw text", () => {
    expect(t.tokenize("$$\na\nb\n$$\nrest")).toMatchObject({ tex: "a\nb", oneLine: false, raw: "$$\na\nb\n$$\n" });
    expect(t.tokenize("$$\na\n$$")).toMatchObject({ raw: "$$\na\n$$" });
    expect(t.tokenize("$$a+b$$\nnext")).toMatchObject({ tex: "a+b", oneLine: true, raw: "$$a+b$$\n" });
    expect(t.tokenize("$$a+b$$")).toMatchObject({ raw: "$$a+b$$" });
  });
  it("refuses what the server would not treat as a block", () => {
    expect(t.tokenize("plain")).toBeUndefined();
    expect(t.tokenize("$$ text after")).toBeUndefined();
    expect(t.tokenize("$$\n\n$$")).toBeUndefined();
    expect(t.tokenize("$$\nnever closed")).toBeUndefined();
    expect(t.tokenize("$$\n```\n$$")).toBeUndefined();
  });
  it("parses a token and writes the Markdown back as it was", () => {
    const made: unknown[] = [];
    const h = { createNode: (n: string, a: unknown) => made.push([n, a]) };
    cfg(MathBlock).parseMarkdown({ tex: "x", oneLine: true }, h);
    cfg(MathBlock).parseMarkdown({}, h);
    expect(made).toEqual([
      ["mathBlock", { tex: "x", oneLine: true }],
      ["mathBlock", { tex: "", oneLine: false }],
    ]);
    const out = (attrs: Record<string, unknown>) => cfg(MathBlock).renderMarkdown({ attrs });
    expect(out({ tex: "x", oneLine: true })).toBe("$$x$$");
    expect(out({ tex: "x", oneLine: false })).toBe("$$\nx\n$$");
    expect(out({ tex: "a\nb", oneLine: true })).toBe("$$\na\nb\n$$");
    expect(out({ tex: "", oneLine: true })).toBe("$$\n\n$$");
    expect(cfg(MathBlock).renderMarkdown({})).toBe("$$\n\n$$");
  });
});

describe("MathInline node", () => {
  const t = cfg(MathInline).markdownTokenizer;
  it("parses and renders HTML", () => {
    expect(attrsOf(MathInline, '<span data-math-inline data-tex="x"></span>')).toEqual({ tex: "x" });
    expect(attrsOf(MathInline, "<span data-math-inline></span>")).toEqual({ tex: "" });
    expect(cfg(MathInline).addAttributes.call({}).tex.default).toBe("");
    expect(cfg(MathInline).renderHTML({ node: { attrs: { tex: "a" } } })[1]["data-tex"]).toBe("a");
  });
  it("finds a single dollar, not a double one", () => {
    expect(t.start("a $x$")).toBe(2);
    expect(t.start("a $$x$$")).toBe(-1);
    expect(t.start("none")).toBe(-1);
  });
  it("tokenizes like the server: no inner spaces, not before a digit", () => {
    expect(t.tokenize("$x^2$ rest")).toMatchObject({ tex: "x^2", raw: "$x^2$" });
    expect(t.tokenize("$a$")).toMatchObject({ tex: "a" });
    expect(t.tokenize("$5 and $6")).toBeUndefined();
    expect(t.tokenize("$x$5")).toBeUndefined();
    expect(t.tokenize("$ x$")).toBeUndefined();
  });
  it("parses a token and writes it back", () => {
    const made: unknown[] = [];
    const h = { createNode: (n: string, a: unknown) => made.push([n, a]) };
    cfg(MathInline).parseMarkdown({ tex: "x" }, h);
    cfg(MathInline).parseMarkdown({}, h);
    expect(made).toEqual([
      ["mathInline", { tex: "x" }],
      ["mathInline", { tex: "" }],
    ]);
    expect(cfg(MathInline).renderMarkdown({ attrs: { tex: "x" } })).toBe("$x$");
    expect(cfg(MathInline).renderMarkdown({})).toBe("$$");
  });
});
