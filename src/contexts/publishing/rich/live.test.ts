import { describe, expect, it } from "vitest";
import { scanLive } from "./liveScan";
import { canRoundTrip, parseMarkdown, serializeDoc } from "./markdown";

const awkward = [
  "<style>\tbody { margin:0 }   </style>",
  "",
  "<script>",
  '  const s = "</script>"; // ünïcödé 日本語 🚀',
  "  x = `a` + '\\\\';",
  "</script>   ",
  "",
].join("\n");

describe("html-live blocks", () => {
  const md = (code: string, info = "html-live height=240") => `Before.\n\n\`\`\`${info}\n${code}\n\`\`\`\n\nAfter.`;

  it("keeps the source byte for byte through parse and serialize", () => {
    const src = md(awkward);
    expect(canRoundTrip(src)).toEqual({ ok: true });
    const out = serializeDoc(parseMarkdown(src));
    expect(scanLive(out)[0]?.code).toBe(awkward);
    expect(out).toBe(src);
  });

  it("keeps it when the text around it is edited", () => {
    const doc = parseMarkdown(md(awkward));
    const first = doc.content?.[0];
    if (first?.content?.[0]) first.content[0].text = "Edited before.";
    const out = serializeDoc(doc);
    expect(out.startsWith("Edited before.")).toBe(true);
    expect(scanLive(out)[0]?.code).toBe(awkward);
    expect(scanLive(out)[0]?.height).toBe(240);
  });

  it("writes the fence the page expects: the info string, height only when set", () => {
    expect(serializeDoc(parseMarkdown(md("<b>x</b>", "html-live")))).toContain("```html-live\n<b>x</b>\n```");
    expect(serializeDoc(parseMarkdown(md("<b>x</b>", "html-live height=100")))).toContain("```html-live height=100\n");
  });

  it("lengthens the fence when the source contains a line that would close it", () => {
    const code = "<pre>\n```\n</pre>";
    const doc = parseMarkdown(`\`\`\`\`html-live\n${code}\n\`\`\`\`\n`);
    const out = serializeDoc(doc);
    expect(scanLive(out)).toHaveLength(1);
    expect(scanLive(out)[0]?.code).toBe(code);
    // the same block with a shorter fence in the attrs still comes out safe
    const node = doc.content?.[0];
    if (node?.attrs) node.attrs.fence = "```";
    expect(scanLive(serializeDoc(doc))[0]?.code).toBe(code);
  });

  it("an empty block stays empty", () => {
    const out = serializeDoc(parseMarkdown("```html-live\n```"));
    expect(out).toBe("```html-live\n```");
  });

  it("is seen as a block by the page exactly when the editor sees one", () => {
    expect(scanLive(md("x", "html-live width=3"))).toHaveLength(0);
    expect(scanLive(md("x"))).toHaveLength(1);
  });
});
