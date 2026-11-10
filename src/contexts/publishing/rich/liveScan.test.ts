import { describe, expect, it } from "vitest";
import { liveInfo, MAX_LIVE_BLOCKS, scanLive } from "./liveScan";

describe("liveInfo", () => {
  it("accepts the bare language and a height, refuses the rest", () => {
    expect(liveInfo("html-live")).toEqual({ height: null });
    expect(liveInfo("  html-live   height=240 ")).toEqual({ height: 240 });
    expect(liveInfo("html-live height=abc")).toBeNull();
    expect(liveInfo("html-live height=1 extra")).toBeNull();
    expect(liveInfo("js")).toBeNull();
    expect(liveInfo("")).toBeNull();
  });
});

describe("scanLive", () => {
  it("returns nothing without the language", () => {
    expect(scanLive("plain\n```js\nx\n```")).toEqual([]);
  });
  it("finds closed, unclosed and CRLF blocks, skipping non-live and backtick-info fences", () => {
    const body = [
      "```html-live height=100",
      "<b>a</b>",
      "```",
      "```js",
      "html-live",
      "```",
      "``` html-live `x`",
      "~~~html-live",
      "b",
      "~~~~",
      "```html-live",
      "tail",
    ].join("\r\n");
    const r = scanLive(body);
    expect(r.map((b) => b.code)).toEqual(["<b>a</b>", "b", "tail"]);
    expect(r[0]).toMatchObject({ height: 100, start: 0, end: 3 });
    expect(r[2]?.end).toBe(12);
  });
  it("ignores a shorter or different closing fence and text between blocks", () => {
    const r = scanLive("text\n````html-live\na\n```\nb\n````\nmore");
    expect(r[0]?.code).toBe("a\n```\nb");
  });
  it("drops oversized blocks and caps the count", () => {
    const big = `\`\`\`html-live\n${"x".repeat(70_000)}\n\`\`\``;
    expect(scanLive(big)).toEqual([]);
    const many = Array.from({ length: MAX_LIVE_BLOCKS + 3 }, (_, i) => `\`\`\`html-live\n${i}\n\`\`\``).join("\n");
    expect(scanLive(many)).toHaveLength(MAX_LIVE_BLOCKS);
  });
});
