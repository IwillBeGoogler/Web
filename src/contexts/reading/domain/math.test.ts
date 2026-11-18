import { describe, expect, it } from "vitest";
import { typesetMath } from "./math";

describe("typesetMath", () => {
  it("typesets inline and block formulas", () => {
    const out = typesetMath(
      '<p>a <span class="math-inline" data-tex="x^2">$x^2$</span></p><div class="math-block" data-tex="\\frac{1}{2}">$$\\frac{1}{2}$$</div>',
    );
    expect(out).toContain('class="katex"');
    expect(out).toContain("katex-display");
    expect(out).not.toContain("$x^2$");
  });
  it("leaves html without math alone", () => {
    expect(typesetMath("<p>hi</p>")).toBe("<p>hi</p>");
  });
  it("never runs markup from the formula", () => {
    const out = typesetMath('<span class="math-inline" data-tex="&lt;img src=x onerror=alert(1)&gt;">x</span>');
    expect(out).not.toMatch(/<img/);
  });
});
