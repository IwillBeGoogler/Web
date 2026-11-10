import { describe, expect, it } from "vitest";
import { extractLive, splitLive } from "./liveBlocks";

describe("splitLive edges", () => {
  it("keeps non-live fences, mismatched closers and unclosed live blocks sensible", () => {
    const parts = splitLive(["```js", "html-live", "```", "``` html-live `x`", "```html-live height=zz", "a", "```", "```html-live", "unclosed"].join("\n"));
    expect(parts.filter((p) => p.kind === "live")).toHaveLength(1);
    expect(parts[0]?.kind).toBe("text");
  });
  it("closes only with a long enough matching fence", () => {
    const parts = splitLive("````html-live height=120\nx\n```\ny\n~~~~\n````\nafter");
    const live = parts.find((p) => p.kind === "live");
    expect(live && "code" in live ? live.code : "").toBe("x\n```\ny\n~~~~");
    expect(parts.at(-1)).toMatchObject({ kind: "text", text: "after" });
  });
  it("keeps the lines of a non-live fenced block as prose, including its closer", () => {
    const parts = splitLive("~~~html-live-not\nbody\n~~~\n```html-live\nok\n```");
    expect(parts.map((p) => p.kind)).toEqual(["text", "live"]);
  });
});

describe("extractLive edges", () => {
  it("skips a pre with several children and a code without a live height", () => {
    const html =
      '<pre><code class="language-html-live-200">a</code><span>x</span></pre><pre><code class="language-js">b</code></pre><pre><code class="language-html-live-300">c</code></pre>';
    const r = extractLive(html);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]).toMatchObject({ code: "c", height: 300 });
  });
  it("passes html without live markers through", () => {
    expect(extractLive("<p>x</p>")).toEqual({ html: "<p>x</p>", blocks: [] });
  });
});
