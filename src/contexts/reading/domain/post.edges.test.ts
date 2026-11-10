import { describe, expect, it } from "vitest";
import { excerpt, postSchema } from "./post";

describe("post edges", () => {
  it("cuts a single over-long word without a space", () => {
    expect(excerpt("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
  it("turns null tags into an empty list", () => {
    const p = postSchema.parse({ id: 1, title: "T", slug: "t", status: "published", tags: null, created_at: "x", updated_at: "x" });
    expect(p.tags).toEqual([]);
  });
});
