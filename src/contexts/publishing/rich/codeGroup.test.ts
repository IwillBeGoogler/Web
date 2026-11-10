import { describe, expect, it } from "vitest";
import { canRoundTrip, parseMarkdown, serializeDoc, splitInfo } from "./markdown";

describe("code groups", () => {
  it("splits an info string into language and group", () => {
    expect(splitInfo("go group=sort")).toEqual({ language: "go", group: "sort" });
    expect(splitInfo("group=sort")).toEqual({ language: null, group: "sort" });
    expect(splitInfo("go")).toEqual({ language: "go", group: null });
    expect(splitInfo("go groupie=x")).toEqual({ language: "go groupie=x", group: null });
    expect(splitInfo("go group=a<b")).toEqual({ language: "go group=a<b", group: null });
  });

  it("reads the group of each fence and writes it back", () => {
    const md = "```go group=s1\na()\n```\n\n```python group=s1\nb()\n```\n\n```bash\nls\n```";
    const doc = parseMarkdown(md);
    expect(doc.content?.map((n) => [n.attrs?.language, n.attrs?.group])).toEqual([
      ["go", "s1"],
      ["python", "s1"],
      ["bash", null],
    ]);
    expect(canRoundTrip(md)).toEqual({ ok: true });
    expect(serializeDoc(doc)).toBe(md);
  });

  it("keeps a longer fence around code that holds a fence", () => {
    const md = "````md group=s1\n```\nx\n```\n````\n\n```go group=s1\na()\n```";
    expect(serializeDoc(parseMarkdown(md))).toBe(md);
  });
});
