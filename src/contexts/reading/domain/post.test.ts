import { describe, expect, it } from "vitest";
import { excerpt, postPath, postSchema, readTime } from "./post";

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
  it("builds iBlog-style paths", () => {
    expect(postPath({ author: "ali", slug: "t-1" })).toBe("/@ali/t-1");
    expect(postPath({ author: "", slug: "t-1" })).toBe("/p/t-1");
  });
  it("excerpt strips markdown and cuts on a word", () => {
    expect(excerpt(raw.body, 200)).toBe("Hi Some bold link text code.");
    expect(excerpt("one two three four", 9)).toBe("one two…");
    expect(excerpt("", 10)).toBe("");
  });
  it("readTime is at least one minute", () => {
    expect(readTime(0)).toBe("1 min");
    expect(readTime(7)).toBe("7 min");
  });
});
