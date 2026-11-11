import { describe, expect, it } from "vitest";
import { encodeDest, escapeLineStart, escapeText, keepableImageSrc, parseMarkdown, serializeDoc } from "./markdown";

const md = (s: string) => serializeDoc(parseMarkdown(s));

describe("escapeText", () => {
  it("escapes what could change meaning and nothing else", () => {
    expect(escapeText("2 * 3 * 4")).toBe("2 * 3 * 4");
    expect(escapeText("*a*")).toBe("\\*a\\*");
    expect(escapeText("snake_case _x_")).toBe("snake_case \\_x\\_");
    expect(escapeText("[a] `b` \\ ~c~")).toBe("\\[a\\] \\`b\\` \\\\ \\~c\\~");
    expect(escapeText("a < b")).toBe("a < b");
    expect(escapeText("<b>x</b>")).toBe("\\<b>x\\</b>");
    expect(escapeText("&amp; & &#35;")).toBe("\\&amp; & \\&#35;");
  });

  it("keeps addresses and addresses-like text from becoming links", () => {
    expect(escapeText("http://x.com/a_b")).toBe("http\\://x.com/a_b");
    expect(escapeText("see www.x.com")).toBe("see www\\.x.com");
    expect(escapeText("a@b.co")).toBe("a\\@b.co");
    // the text of a link is written as it is: its address is the link
    expect(escapeText("http://x.com/a_b", true)).toBe("http://x.com/a_b");
  });
});

describe("escapeLineStart", () => {
  it("escapes a line that reads as a horizontal rule", () => {
    expect(escapeLineStart("***")).toBe("\\***");
    expect(escapeLineStart("___")).toBe("\\___");
    expect(escapeLineStart("_ _ _ _")).toBe("\\_ _ _ _");
    expect(escapeLineStart("__")).toBe("__");
    expect(escapeLineStart("_*_")).toBe("_*_");
  });
  it("escapes the marker of a line that would start a block", () => {
    expect(escapeLineStart("1. a")).toBe("1\\. a");
    expect(escapeLineStart("12) a")).toBe("12\\) a");
    expect(escapeLineStart("a. a")).toBe("a\\. a");
    expect(escapeLineStart("- a")).toBe("\\- a");
    expect(escapeLineStart("> a")).toBe("\\> a");
    expect(escapeLineStart("# a")).toBe("\\# a");
    expect(escapeLineStart("#b")).toBe("\\#b");
    expect(escapeLineStart("---")).toBe("\\---");
    expect(escapeLineStart("```js")).toBe("\\```js");
    expect(escapeLineStart("plain 1. text")).toBe("plain 1. text");
    expect(escapeLineStart("**bold** text")).toBe("**bold** text");
    expect(escapeLineStart("***-***")).toBe("***-***");
  });
});

describe("encodeDest", () => {
  it("keeps balanced parentheses and encodes what would break out of the link", () => {
    expect(encodeDest("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
    expect(encodeDest("https://x.com/a b")).toBe("https://x.com/a%20b");
    expect(encodeDest("https://x.com/a)b")).toBe("https://x.com/a%29b");
    expect(encodeDest("https://x.com/<a>")).toBe("https://x.com/%3Ca%3E");
  });
});

describe("keepableImageSrc", () => {
  it("keeps web addresses and the site's own uploads, drops the rest", () => {
    expect(keepableImageSrc("https://example.com/a.png")).toBe(true);
    expect(keepableImageSrc("http://example.com/a.png")).toBe(true);
    expect(keepableImageSrc("/api/uploads/abc.png")).toBe(true);
    for (const s of ["x", "", "file:///C:/a.png", "data:image/png;base64,AA", "javascript:alert(1)", "//evil.example/a.png", "/other/a.png", "https://"])
      expect(keepableImageSrc(s)).toBe(false);
  });
});

describe("what is written for a document", () => {
  it("writes images as blocks of their own", () => {
    expect(md("a\n\n![](https://example.com/a.png)\n\nb")).toBe("a\n\n![](https://example.com/a.png)\n\nb");
  });
  it("writes a code block with a longer fence when it holds one", () => {
    expect(md("````\na\n```\nb\n````")).toBe("````\na\n```\nb\n````");
  });
  it("leaves an empty list item out", () => {
    expect(md("- a\n- b")).toBe("- a\n- b");
  });
  it("writes spaces outside the marks", () => {
    expect(
      serializeDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: " a ", marks: [{ type: "bold" }] },
              { type: "text", text: "b" },
            ],
          },
        ],
      }),
    ).toBe("**a** b");
  });
  it("writes two line breaks in a row as two breaks", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "hardBreak" }, { type: "text", text: "b" }] }],
    };
    expect(serializeDoc(doc)).toBe("a  \n\\\nb");
    expect(serializeDoc(parseMarkdown(serializeDoc(doc)))).toBe(serializeDoc(doc));
  });
});
