import { describe, expect, it } from "vitest";
import { toLocalInput, toRFC3339 } from "./story";

describe("story datetime edges", () => {
  it("maps empty and unparseable values to empty", () => {
    expect(toRFC3339("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not a date")).toBe("");
  });
  it("round-trips a local value", () => {
    const local = "2026-03-04T05:06";
    expect(toLocalInput(toRFC3339(local))).toBe(local);
  });
});
