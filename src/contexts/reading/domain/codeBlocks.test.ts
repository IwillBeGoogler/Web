import { describe, expect, it } from "vitest";
import { extractCode } from "./codeBlocks";
import { canonLang, langLabel, pickTab } from "./codeLang";
import { canHighlight, HIGHLIGHT_LANGS, HIGHLIGHT_MAX, highlight, spansOf } from "./highlight";

const pre = (lang: string, code: string) => `<pre><code class="language-${lang}">${code}</code></pre>`;

describe("extractCode", () => {
  it("turns a group into one host with every language", () => {
    const { html, hosts } = extractCode(`<p>a</p><div class="code-tabs">${pre("go", "a &amp;&amp; b")}${pre("python", "x")}</div>`);
    expect(hosts).toEqual([
      [
        { lang: "go", code: "a && b" },
        { lang: "python", code: "x" },
      ],
    ]);
    expect(html).toBe('<p>a</p><div data-code="0"></div>');
  });
  it("turns a plain block into a host of one, and leaves a block without language", () => {
    const { html, hosts } = extractCode(`${pre("js", "1")}<pre><code>plain</code></pre>`);
    expect(hosts).toEqual([[{ lang: "js", code: "1" }]]);
    expect(html).toContain("<pre><code>plain</code></pre>");
  });
  it("does not tab a malformed group; its block is a plain one", () => {
    const { html, hosts } = extractCode(`<div class="code-tabs">${pre("go", "a")}<p>x</p></div>`);
    expect(hosts).toEqual([[{ lang: "go", code: "a" }]]);
    expect(html).toContain("<p>x</p>");
  });
});

describe("languages", () => {
  it("names one language once", () => {
    expect(canonLang("JS")).toBe("javascript");
    expect(canonLang("c++")).toBe("cpp");
    expect(langLabel("py")).toBe("Python");
    expect(langLabel("zig")).toBe("zig");
  });
  it("opens the reader's language when the block has it", () => {
    expect(pickTab(["go", "py"], "python")).toBe(1);
    expect(pickTab(["go", "py"], "rust")).toBe(0);
    expect(pickTab(["go", "py"], "")).toBe(0);
  });
});

describe("highlight", () => {
  it("splits code into runs that join back to the source", async () => {
    const code = 'func main() {\n\tfmt.Println("hi") // x\n}';
    const runs = await highlight(code, "golang");
    expect(runs?.map((r) => r.text).join("")).toBe(code);
    expect(runs?.some((r) => r.cls === "tok-keyword")).toBe(true);
    expect(spansOf((await import("@codemirror/legacy-modes/mode/go")).go as never, "")).toEqual([]);
  });
  it("loads every grammar and keeps the source whole", async () => {
    const code = "let a = 1\n// x\n";
    for (const lang of HIGHLIGHT_LANGS) {
      const runs = await highlight(code, lang);
      expect(runs?.map((r) => r.text).join(""), lang).toBe(code);
      expect(canHighlight(lang)).toBe(true);
    }
    expect(canHighlight("zig")).toBe(false);
  });
  it("leaves very long code as plain text", async () => {
    expect(await highlight("a".repeat(HIGHLIGHT_MAX + 1), "go")).toBeNull();
  });
  it("gives up on an unknown language", async () => {
    expect(await highlight("x", "zig")).toBeNull();
  });
});
