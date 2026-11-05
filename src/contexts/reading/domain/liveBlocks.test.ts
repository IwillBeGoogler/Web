import { describe, expect, it } from "vitest";
import { clampLiveHeight, extractLive, liveHeightFromClass, splitLive } from "./liveBlocks";
import { safeHtml } from "./sanitize";

const rendered = (cls: string, code: string) => `<p>a</p><pre><code class="${cls}">${code}</code></pre><p>b</p>`;

describe("live height", () => {
  it("clamps to 100-1000", () => {
    expect([5, 99, 100, 400, 1000, 5000].map(clampLiveHeight)).toEqual([100, 100, 100, 400, 1000, 1000]);
  });
  it("is read strictly from the rendered class", () => {
    expect(liveHeightFromClass("language-html-live-250")).toBe(250);
    expect(liveHeightFromClass("language-html-live-9999")).toBe(1000);
    for (const bad of [
      "language-html-live",
      "language-html-live-",
      "language-html-live-25",
      "language-html-live-12345",
      "language-html-live-40x",
      "language-html-live-4e2",
      "language-html-live-400 x",
      "x language-html-live-400",
      "language-html_live-400",
      null,
    ])
      expect(liveHeightFromClass(bad)).toBeNull();
  });
});

describe("extractLive", () => {
  it("replaces a live block with an empty host and keeps its source as text", () => {
    const code = "&lt;/code&gt;&lt;script&gt;alert(1)&lt;/script&gt;";
    const out = extractLive(safeHtml(rendered("language-html-live-300", code)));
    expect(out.blocks).toEqual([{ code: "</code><script>alert(1)</script>", height: 300 }]);
    expect(out.html).toContain('<div data-live="0"></div>');
    expect(out.html).not.toContain("script");
    expect(out.html).toContain("<p>a</p>");
  });
  it("survives DOMPurify as inert text with its class", () => {
    const html = safeHtml(rendered("language-html-live-400", "&lt;img src=x onerror=alert(1)&gt;"));
    expect(html).toContain('class="language-html-live-400"');
    expect(html).not.toContain("<img");
  });
  it("leaves ordinary and malformed code blocks alone", () => {
    const html = rendered("language-js", "x") + rendered("language-html-live-4000x", "y") + rendered("language-html-live", "z");
    const out = extractLive(html);
    expect(out.blocks).toEqual([]);
    expect(out.html).toBe(html);
  });
  it("ignores a block that is not alone in its pre", () => {
    const html = '<pre><code class="language-html-live-400">x</code><b>y</b></pre>';
    expect(extractLive(html).blocks).toEqual([]);
  });
});

describe("splitLive", () => {
  it("splits prose and blocks, with default and parsed height", () => {
    const parts = splitLive("intro\n\n```html-live\n<b>x</b>\n```\n\nmid\n\n```html-live height=250\ny\n```\nend");
    expect(parts.map((p) => p.kind)).toEqual(["text", "live", "text", "live", "text"]);
    expect(parts[1]).toMatchObject({ code: "<b>x</b>", height: 400 });
    expect(parts[3]).toMatchObject({ code: "y", height: 250 });
  });
  it("keeps invalid fences and nested fences as prose", () => {
    for (const body of ["```html-live height=1 onload=x\nz\n```", "````md\n```html-live\nz\n```\n````", "```html\nz\n```", "```html-live-400\nz\n```"])
      expect(splitLive(body).every((p) => p.kind === "text")).toBe(true);
  });
  it("clamps height", () => {
    expect(splitLive("```html-live height=9\nz\n```")[0]).toMatchObject({ kind: "live", height: 100 });
  });
});
