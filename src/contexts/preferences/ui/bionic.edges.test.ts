import { afterEach, describe, expect, it, vi } from "vitest";
import { bionicHtml } from "./bionic";

describe("bionicHtml edges", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns the html untouched where there is no DOMParser", () => {
    vi.stubGlobal("DOMParser", undefined);
    expect(bionicHtml("<p>Reading</p>")).toBe("<p>Reading</p>");
  });
  it("leaves comments and whitespace-only text alone", () => {
    const out = bionicHtml("<p><!-- note -->   <em>Reading</em></p>");
    expect(out).toContain("<!-- note -->");
    expect(out).toContain('<b class="bionic">Rea</b>ding');
  });
});
