import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { canRoundTrip, cleanDoc, encodeDest, escapeText, parseMarkdown, sameRichDoc, serializeDoc } from "./markdown";

const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, marks });

describe("markdown defensive paths", () => {
  it("encodeDest balances or escapes parentheses", () => {
    expect(encodeDest("a(b")).toBe("a%28b");
    expect(encodeDest("a)b")).toBe("a%29b");
    expect(encodeDest("a(b)c")).toBe("a(b)c");
    expect(encodeDest("a b")).toBe("a%20b");
  });

  it("serializes nodes that lack optional fields without throwing", () => {
    const docs: JSONContent[] = [
      doc(p({ type: "text", marks: [{ type: "link" }] } as JSONContent)),
      doc(p(t("x", [{ type: "link" }]))),
      doc(p({ type: "image" })),
      doc(p({ type: "image", attrs: { src: "https://a.b/c.png", alt: "a`[^b]\n c", title: "T" } })),
      doc({ type: "heading", attrs: { level: 2 }, content: [t("a"), { type: "hardBreak" }, t("b")] }),
      doc(p(t("a"), { type: "hardBreak" }, t("b"))),
      doc({ type: "codeBlock", content: [{ type: "text" }] }),
      doc({ type: "codeBlock", content: [t("  \n ")] }),
      doc({ type: "codeBlock" }),
      doc(p(t("a`b\\c", [{ type: "code" }]))),
      doc(p(t("tab\there", [{ type: "bold" }]))),
      doc(p(t("plain\ttab"))),
      doc({ type: "bulletList" }),
      doc({ type: "bulletList", content: [{ type: "listItem" }] }),
      doc({
        type: "blockquote",
        content: [
          { type: "blockquote", content: [p(t("a"))] },
          { type: "blockquote", content: [p(t("b"))] },
        ],
      }),
      doc({ type: "bulletList", content: [{ type: "listItem", content: [p(t("a")), { type: "blockquote", content: [p(t("q"))] }] }] }),
      doc({
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(t("n"))] }] }, p(t("after"))] }],
      }),
      doc(
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("a"))] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("b"))] }] },
      ),
      doc({ type: "orderedList", content: [{ type: "listItem", content: [{ type: "bulletList" }] }] }),
      doc({ type: "uploadPlaceholder" }, p(t("kept"))),
      doc({ type: "htmlLive" }),
      doc({ type: "htmlLive", attrs: { height: 300, code: "<b>x</b>" } }),
      doc(p(t("a", [{ type: "bold" }, { type: "link", attrs: { href: "https://x.y" } }]))),
      doc(p(t("both", [{ type: "italic" }, { type: "bold" }, { type: "link", attrs: { href: "https://x.y" } }]))),
      doc(p(t("a "), t("b", [{ type: "bold" }]), t(" c"))),
      doc(p(t("*", [{ type: "bold" }]), t("x", [{ type: "italic" }]))),
      doc(p(t("# not heading"))),
      doc(p(t("1. nope"))),
      doc(p(t("a"), t("   "), t("b"))),
      doc({ type: "heading", attrs: { level: 1 }, content: [t("trailing #")] }),
      doc({ type: "paragraph" }),
      { type: "doc" },
    ];
    for (const d of docs) {
      expect(typeof serializeDoc(d)).toBe("string");
      expect(cleanDoc(d)).toBeTruthy();
    }
  });

  it("escapeText handles marks as strings and plain text", () => {
    expect(escapeText("a_b*c")).toBeTypeOf("string");
    expect(escapeText("a_b", true)).toBeTypeOf("string");
  });

  it("canRoundTrip refuses footnote definitions, embeds, and survives odd input", () => {
    expect(canRoundTrip("").ok).toBe(true);
    expect(canRoundTrip("a\r\nb")).toEqual({ ok: false, problem: "crlf" });
    expect(canRoundTrip("text[^1]\n\n[^1]: note").ok).toBe(false);
    expect(canRoundTrip("https://youtu.be/abc\n\nhttps://youtu.be/def").ok).toBeTypeOf("boolean");
    expect(canRoundTrip("* a\n\n\n* b").ok).toBeTypeOf("boolean");
    expect(canRoundTrip("a\\\n \\\nb").ok).toBeTypeOf("boolean");
    expect(canRoundTrip("<live>\nx\n</live>").ok).toBeTypeOf("boolean");
  });

  it("sameRichDoc compares documents and tolerates junk", () => {
    expect(sameRichDoc(parseMarkdown("a"), parseMarkdown("a"))).toBe(true);
    expect(sameRichDoc(parseMarkdown("a"), parseMarkdown("b"))).toBe(false);
    expect(sameRichDoc({ type: "nope" }, parseMarkdown("a"))).toBe(false);
  });
});
