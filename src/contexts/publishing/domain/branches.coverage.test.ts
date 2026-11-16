import { describe, expect, it } from "vitest";
import { firstPage } from "@/contexts/diagrams/domain/versionDiff";
import { safeHref } from "../rich/safeLink";
import { duration } from "./stats";

describe("branch coverage: small pure helpers", () => {
  it("duration covers whole minutes, mixed minutes and long hours", () => {
    expect(duration(45)).toBe("45s");
    expect(duration(120)).toBe("2m");
    expect(duration(252)).toBe("4m 12s");
    expect(duration(5400)).toBe("1.5h");
    expect(duration(36_000)).toBe("10h");
    expect(duration(3600 * 1234)).toBe("1,234h");
  });

  it("safeHref refuses a scheme hidden behind invisible characters", () => {
    expect(safeHref("java​script:alert(1)")).toBeNull();
    expect(safeHref("   ")).toBeNull();
  });

  it("firstPage tolerates malformed documents", () => {
    expect(firstPage(null)).toEqual({ nodes: [], edges: [] });
    expect(firstPage({ pages: [1], nodes: [{ id: "a" }] })).toEqual({ nodes: [{ id: "a" }], edges: [] });
    expect(firstPage({ pages: [{ nodes: "x", edges: [{ id: "e" }, 3] }] })).toEqual({ nodes: [], edges: [{ id: "e" }] });
  });
});
