import { describe, expect, it } from "vitest";
import { excerpt, markdownFileName, postPath, postSchema, readTime, toMarkdownFile } from "./post";

const raw = {
  id: 1,
  title: "T",
  slug: "t-1",
  status: "published",
  body: "# Hi\n\nSome **bold** [link](http://x) text `code`.",
  reading_time: 3,
  author: "ali",
  user_id: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("post", () => {
  it("parses with defaults", () => {
    const p = postSchema.parse(raw);
    expect(p.tags).toEqual([]);
    expect(p.claps).toBe(0);
    expect(p.bookmarked).toBe(false);
  });
  it("coerces null arrays to empty arrays", () => {
    const p = postSchema.parse({
      ...raw,
      languages: null,
      tags: null,
      glossary: [{ term: "T", aliases: null, definition: "D" }],
    });
    expect(p.languages).toEqual([]);
    expect(p.tags).toEqual([]);
    expect(p.glossary[0]?.aliases).toEqual([]);

    const p2 = postSchema.parse({ ...raw, glossary: null });
    expect(p2.glossary).toEqual([]);
  });
  it("builds IWillBeGoogler-style paths", () => {
    expect(postPath({ author: "ali", slug: "t-1" })).toBe("/@ali/t-1");
    expect(postPath({ author: "", slug: "t-1" })).toBe("/p/t-1");
  });
  it("excerpt strips markdown and cuts on a word", () => {
    expect(excerpt(raw.body, 200)).toBe("Hi Some bold link text code.");
    expect(excerpt("one two three four", 9)).toBe("one two…");
    expect(excerpt("supercalifragilistic", 5)).toBe("super…");
    expect(excerpt("", 10)).toBe("");
  });
  it("readTime is at least one minute", () => {
    expect(readTime(0)).toBe("1 min");
    expect(readTime(7)).toBe("7 min");
  });
});

describe("toMarkdownFile", () => {
  it("writes front matter, title, subtitle and body", () => {
    const md = toMarkdownFile(
      { title: 'A "b"', subtitle: "sub", body: "## H\n\ntext\n\n", author: "ali", published_at: "2026-11-01T10:00:00Z", tags: ["go"] },
      "https://x/p",
    );
    expect(md).toBe('---\ntitle: "A \\"b\\""\nauthor: "ali"\ndate: 2026-11-01\ntags: ["go"]\nsource: "https://x/p"\n---\n\n# A "b"\n\n> sub\n\n## H\n\ntext\n');
  });
  it("omits optional front matter fields and subtitle when absent", () => {
    const md = toMarkdownFile({ title: "Plain", subtitle: "", body: "Body", author: "", published_at: null, tags: [] }, "https://x/p");
    expect(md).toBe('---\ntitle: "Plain"\nsource: "https://x/p"\n---\n\n# Plain\n\nBody\n');
  });
  it("names translations by language", () => {
    expect(markdownFileName({ slug: "s", lang: "uz" }, "uz")).toBe("s.md");
    expect(markdownFileName({ slug: "s", lang: "uz" }, "")).toBe("s.md");
    expect(markdownFileName({ slug: "s", lang: "uz" }, "en")).toBe("s.en.md");
  });
});
