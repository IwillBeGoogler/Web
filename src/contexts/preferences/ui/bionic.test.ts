import { describe, expect, it } from "vitest";
import { bionicHtml } from "./bionic";

describe("bionicHtml", () => {
  it("bolds word prefixes in body text only and keeps the text", () => {
    const html = "<h2>Heading words</h2><p>Reading <code>const value</code> matters.</p>";
    const out = bionicHtml(html);
    expect(out).toContain("<h2>Heading words</h2>");
    expect(out).toContain('<b class="bionic">Rea</b>ding');
    expect(out).toContain("<code>const value</code>");
    const d = document.createElement("div");
    d.innerHTML = out;
    expect(d.textContent).toBe("Heading wordsReading const value matters.");
  });
});
