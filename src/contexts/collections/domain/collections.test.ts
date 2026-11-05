import { describe, expect, it } from "vitest";
import { canManage, listInputSchema, move, placeSchema, publicationInputSchema, runeRange, slugify } from "./collections";

describe("collections", () => {
  it("list input rules", () => {
    expect(listInputSchema.safeParse({ name: " ", description: "", private: false }).success).toBe(false);
    expect(listInputSchema.parse({ name: " Go ", description: "", private: true }).name).toBe("Go");
  });
  it("moves series parts", () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(move([1, 2], 0, 5)).toEqual([1, 2]);
  });
  it("finds rune offsets for a highlight, tolerating markdown and emoji", () => {
    const body = "😀 Hello **brave** new world";
    expect(runeRange(body, "brave new")).toEqual({ start: 10, end: 21 });
    expect(runeRange(body, "Hello")).toEqual({ start: 2, end: 7 });
    expect(runeRange(body, "missing")).toBeNull();
    expect(runeRange(body, "  ")).toBeNull();
  });
  it("series place tolerates shapes", () => {
    const p = placeSchema.parse({ position: 2, prev: { position: 1, post_id: 1, title: "a", slug: "a" }, next: null, posts: [] });
    expect(p.position).toBe(2);
    expect(p.prev?.slug).toBe("a");
    expect(placeSchema.parse({}).parts).toEqual([]);
  });
  it("publication rules", () => {
    expect(publicationInputSchema.safeParse({ slug: "My Pub", name: "x", description: "" }).success).toBe(false);
    expect(publicationInputSchema.safeParse({ slug: "my-pub", name: "x", description: "" }).success).toBe(true);
    expect(slugify("Hello, World!  Go_lang")).toBe("hello-world-go-lang");
    expect(canManage("owner", "editor")).toBe(true);
    expect(canManage("editor", "editor")).toBe(false);
    expect(canManage("editor", "writer")).toBe(true);
    expect(canManage("writer", "writer")).toBe(false);
    expect(canManage("owner", "owner")).toBe(false);
  });
});
