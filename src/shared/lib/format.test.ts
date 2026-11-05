import { describe, expect, it } from "vitest";
import { compact, shortDate, timeAgo } from "./format";

const now = new Date("2026-10-05T12:00:00Z");

describe("format", () => {
  it("shortDate hides the current year", () => {
    expect(shortDate("2026-03-04T12:00:00Z", now)).toBe("Mar 4");
    expect(shortDate("2024-03-04T12:00:00Z", now)).toBe("Mar 4, 2024");
    expect(shortDate(null, now)).toBe("");
    expect(shortDate("bad", now)).toBe("");
  });
  it("compact numbers", () => {
    expect(compact(999)).toBe("999");
    expect(compact(1200)).toBe("1.2K");
    expect(compact(3_400_000)).toBe("3.4M");
  });
  it("timeAgo", () => {
    expect(timeAgo("2026-10-05T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-05T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-10-05T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-03T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
  });
});
