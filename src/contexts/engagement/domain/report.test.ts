import { describe, expect, it } from "vitest";
import { reportSchema } from "./report";

describe("report", () => {
  it("needs a note only for other", () => {
    expect(reportSchema.safeParse({ reason: "spam", note: "" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "other", note: " " }).success).toBe(false);
    expect(reportSchema.safeParse({ reason: "other", note: "x" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "nope", note: "" }).success).toBe(false);
  });
});
