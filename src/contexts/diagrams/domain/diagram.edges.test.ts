import { describe, expect, it } from "vitest";
import { memberListSchema, shareListSchema, shareUrl } from "./diagram";

describe("diagram schemas", () => {
  it("treat null or missing item lists as empty", () => {
    expect(memberListSchema.parse({ items: null }).items).toEqual([]);
    expect(memberListSchema.parse({}).items).toEqual([]);
    expect(shareListSchema.parse({ items: null }).items).toEqual([]);
    expect(shareListSchema.parse({}).items).toEqual([]);
  });
  it("builds the share link from the page origin by default", () => {
    expect(shareUrl("abc")).toBe(`${window.location.origin}/d/s/abc`);
    expect(shareUrl("abc", "https://x.dev")).toBe("https://x.dev/d/s/abc");
  });
});
