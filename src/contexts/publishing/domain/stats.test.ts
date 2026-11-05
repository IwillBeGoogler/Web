import { describe, expect, it } from "vitest";
import { bars, pct, postStatSchema, totals } from "./stats";

describe("stats", () => {
  it("sums totals", () => {
    const r = postStatSchema.parse({ post_id: 1, title: "t", slug: "s", status: "published", views: 10, reads: 4, claps: 3, comments: 1 });
    expect(totals([r, r])).toEqual({ views: 20, reads: 8, claps: 6, comments: 2 });
  });
  it("formats read ratio", () => {
    expect(pct(0.456)).toBe("46%");
    expect(pct(46)).toBe("46%");
  });
  it("scales bars to the busiest day", () => {
    expect(
      bars([
        { date: "a", views: 5, reads: 1 },
        { date: "b", views: 10, reads: 10 },
      ]).map((b) => [b.h, b.r]),
    ).toEqual([
      [50, 10],
      [100, 100],
    ]);
    expect(bars([{ date: "a", views: 0, reads: 0 }])[0]?.h).toBe(0);
  });
});
