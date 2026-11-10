import { describe, expect, it } from "vitest";
import { DiagramEmbed, HtmlLive, UploadPlaceholder } from "./nodes";

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
    expect(attrsOf(HtmlLive, "<div data-html-live></div>")).toEqual({ code: "", height: null, fence: "```" });
    expect(attrsOf(HtmlLive, '<div data-html-live data-height="1.5"></div>').height).toBeNull();
    expect(cfg(HtmlLive).addAttributes.call({}).fence.default).toBe("```");
  });
  it("renders HTML", () => {
    expect(cfg(HtmlLive).renderHTML({ node: { attrs: { code: "c", height: null, fence: "```" } } })[1]["data-height"]).toBe("");
    expect(cfg(HtmlLive).renderHTML({ node: { attrs: { code: "c", height: 5, fence: "```" } } })[1]["data-height"]).toBe(5);
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
