import { describe, expect, it } from "vitest";
import { scopeCss, scopeSelector } from "./scopeDiagramCss";

describe("scopeSelector", () => {
  it("turns page-level selectors into the root", () => {
    expect(scopeSelector(":root")).toBe(".sdd-root");
    expect(scopeSelector(":root[data-theme='dark']")).toBe(".sdd-root[data-theme='dark']");
    expect(scopeSelector("html")).toBe(".sdd-root");
    expect(scopeSelector("body")).toBe(".sdd-root");
    expect(scopeSelector("#root")).toBe(".sdd-root");
    expect(scopeSelector(":root.theme-fade *")).toBe(".sdd-root.theme-fade *");
  });
  it("prefixes everything else and keeps the root itself in a universal rule", () => {
    expect(scopeSelector("button:hover:not(:disabled)")).toBe(".sdd-root button:hover:not(:disabled)");
    expect(scopeSelector(".panel")).toBe(".sdd-root .panel");
    expect(scopeSelector("*")).toBe(".sdd-root, .sdd-root *");
    expect(scopeSelector("::selection")).toBe(".sdd-root ::selection");
  });
  it("does not touch selectors already written against the root", () => {
    expect(scopeSelector(":where(.sdd-root.sdd-embed) :where(h1)")).toBe(":where(.sdd-root.sdd-embed) :where(h1)");
  });
  it("does not mistake class names for page elements", () => {
    expect(scopeSelector(".body-text")).toBe(".sdd-root .body-text");
    expect(scopeSelector("html-view")).toBe(".sdd-root html-view");
  });
});

describe("scopeCss", () => {
  const out = (css: string, names: string[] = []) => scopeCss(css, "/x/a.css", new Set(names));

  it("scopes every selector of a list, inside at-rules too, and leaves keyframe steps alone", () => {
    const css = out("html, body, #root { height: 100% } @media (max-width: 1px) { .a, .b { x: y } } @keyframes k { from { a: b } to { a: c } }");
    expect(css).toContain(".sdd-root { height: 100% }");
    expect(css).toContain(".sdd-root .a, .sdd-root .b");
    expect(css).toMatch(/@keyframes k \{\s*from/);
  });

  it("keeps a comma inside :is() / :not() in one selector, and still expands a bare *", () => {
    expect(out(".a :is(.b, .c) { x: y }")).toContain(".sdd-root .a :is(.b, .c)");
    expect(out("* { x: y }")).toContain(".sdd-root, .sdd-root *");
  });

  it("renames keyframes the editor defines, and the animations that use them, so the blog's own are not overridden", () => {
    const css = out("@keyframes pop-in { from { opacity: 0 } } .x { animation: pop-in 1s ease; animation-name: pop-in, other } .y { transition: pop-in 1s }", [
      "pop-in",
    ]);
    expect(css).toContain("@keyframes sdd-pop-in");
    expect(css).toContain("animation: sdd-pop-in 1s ease");
    expect(css).toContain("animation-name: sdd-pop-in, other");
    expect(css).toContain("transition: pop-in 1s"); // not an animation property
  });

  it("does not rename a longer identifier that merely contains a keyframe name", () => {
    expect(out(".x { animation: pop-in-slow 1s }", ["pop-in"])).toContain("animation: pop-in-slow 1s");
  });
});
