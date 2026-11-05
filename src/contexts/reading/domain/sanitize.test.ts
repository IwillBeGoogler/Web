import { describe, expect, it } from "vitest";
import { safeHtml } from "./sanitize";

describe("safeHtml", () => {
  it("drops scripts, handlers and javascript: links", () => {
    const out = safeHtml('<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/);
    expect(out).toContain("<p>hi</p>");
  });
});
