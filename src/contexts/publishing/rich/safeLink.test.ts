import { describe, expect, it } from "vitest";
import { keepableHref, safeHref } from "./safeLink";

describe("safeHref", () => {
  it("accepts web and mail links", () => {
    expect(safeHref("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(safeHref("  http://example.com ")).toBe("http://example.com");
    expect(safeHref("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
  it("adds https to a bare domain", () => {
    expect(safeHref("example.com")).toBe("https://example.com");
    expect(safeHref("blog.example.com/path?x=1")).toBe("https://blog.example.com/path?x=1");
  });
  it("rejects scripts and other schemes, however they are disguised", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      "file:///etc/passwd",
      "ftp://example.com",
      "\u0000javascript:alert(1)",
      "javascript​:alert(1)",
      "blob:https://x/y",
      "tel:123",
    ]) {
      expect(safeHref(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("rejects empty and non-links", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref("just some words")).toBeNull();
  });
});

describe("keepableHref (links already in a story)", () => {
  it("keeps web, mail and relative links", () => {
    for (const ok of ["https://a.b", "http://a.b", "mailto:x@y.z", "/p/story", "#top", "../x", "?q=1"]) expect(keepableHref(ok), ok).toBe(true);
  });
  it("refuses everything with another scheme", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html;base64,AAAA", "java\tscript:x", "file:///x"]) expect(keepableHref(bad), bad).toBe(false);
  });
});
