import { describe, expect, it } from "vitest";
import { scrollProgress } from "./progress";

describe("scrollProgress", () => {
  it("is 0 before the element, 1 after it, linear between", () => {
    // element from y=1000, 2000px tall, viewport 800px
    expect(scrollProgress(0, 1000, 2000, 800)).toBe(0);
    expect(scrollProgress(1000, 1000, 2000, 800)).toBe(0);
    expect(scrollProgress(1600, 1000, 2000, 800)).toBe(0.5);
    expect(scrollProgress(2200, 1000, 2000, 800)).toBe(1);
    expect(scrollProgress(9999, 1000, 2000, 800)).toBe(1);
  });
  it("short elements are complete once visible", () => {
    expect(scrollProgress(0, 0, 300, 800)).toBe(1);
  });
});

describe("scrollProgress short elements", () => {
  it("is 1 once the viewport bottom passes the top of an element shorter than the viewport, else 0", async () => {
    const { scrollProgress } = await import("./progress");
    expect(scrollProgress(0, 100, 50, 800)).toBe(1);
    expect(scrollProgress(0, 1000, 50, 800)).toBe(0);
  });
});
