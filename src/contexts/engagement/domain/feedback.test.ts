import { describe, expect, it } from "vitest";
import { errorDetails, feedbackSchema, pageAddress } from "./feedback";

describe("feedback domain", () => {
  it("drops query string and hash", () => {
    expect(pageAddress("https://blog.test/@ali/post?token=abc#frag")).toBe("https://blog.test/@ali/post");
    expect(pageAddress("not a url")).toBe("");
  });
  it("hides the secret of a diagram share link", () => {
    expect(pageAddress("https://blog.test/d/s/secret123?x=1")).toBe("https://blog.test/d/s/…");
  });
  it("validates the form", () => {
    expect(feedbackSchema.safeParse({ kind: "bug", message: "  ", email: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ kind: "bug", message: "a".repeat(5001), email: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ kind: "bug", message: "ok", email: "nope" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ kind: "idea", message: "ok", email: "a@b.co" }).success).toBe(true);
  });
  it("reads an Error and anything else", () => {
    expect(errorDetails(new Error("boom")).message).toBe("boom");
    expect(errorDetails("x")).toEqual({ message: "x", stack: "" });
  });
});
