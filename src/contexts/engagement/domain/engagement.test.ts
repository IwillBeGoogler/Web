import { describe, expect, it } from "vitest";
import { addClaps, CLAP_MAX, commentInputSchema, threadComments } from "./engagement";

const c = (id: number, parent_id = 0, created_at = `2026-01-0${id}T00:00:00Z`) => ({
  id,
  post_id: 1,
  parent_id,
  user_id: 1,
  author: "a",
  text: "t",
  created_at,
  likes: 0,
  liked: false,
});

describe("claps", () => {
  it("adds claps up to the per-reader cap", () => {
    expect(addClaps({ claps: 10, myClaps: 0 }, 1)).toEqual({ claps: 11, myClaps: 1, added: 1 });
    expect(addClaps({ claps: 60, myClaps: 48 }, 5)).toEqual({ claps: 62, myClaps: CLAP_MAX, added: 2 });
    expect(addClaps({ claps: 60, myClaps: CLAP_MAX }, 1)).toEqual({ claps: 60, myClaps: CLAP_MAX, added: 0 });
  });
});

describe("comments", () => {
  it("validates text 1–5000", () => {
    expect(commentInputSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(commentInputSchema.safeParse({ text: "x".repeat(5001) }).success).toBe(false);
    expect(commentInputSchema.parse({ text: " hi " }).text).toBe("hi");
  });
  it("threads replies under parents, oldest first; orphans become roots", () => {
    const t = threadComments([c(3, 1), c(1), c(2), c(4, 99)]);
    expect(t.map((n) => n.id)).toEqual([1, 2, 4]);
    expect(t[0]?.replies.map((n) => n.id)).toEqual([3]);
  });
});
