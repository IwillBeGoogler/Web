import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scopeCss, scopeDiagramCss, scopeSelector } from "./scopeDiagramCss";

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

describe("scopeCss @import inlining", () => {
  const dir = mkdtempSync(join(tmpdir(), "scope-css-"));
  writeFileSync(join(dir, "b.css"), "body { margin: 0 } .b { color: red }");
  const run = (css: string) => scopeCss(css, join(dir, "a.css"), new Set());

  it("inlines and scopes relative css imports (plain and url() forms)", () => {
    const a = run('@import "./b.css"; .a { x: y }');
    expect(a).toContain(".sdd-root { margin: 0 }");
    expect(a).toContain(".sdd-root .b");
    expect(a).not.toContain("@import");
    expect(run("@import url('./b.css');")).toContain(".sdd-root .b");
  });
  it("leaves remote imports alone", () => {
    expect(run('@import "https://fonts.example/x.css";')).toContain("@import");
  });
  it("detects keyframes nested in other at-rules without scoping their steps", () => {
    const css = run("@media screen { @keyframes spin { from { a: b } } .x { y: z } }");
    expect(css).toContain("from {");
    expect(css).toContain(".sdd-root .x");
  });
});

describe("scopeDiagramCss plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "scope-plugin-"));
  const dir = join(root, "editor", "src");
  const nm = join(root, "nm");
  mkdirSync(join(dir, "ui"), { recursive: true });
  for (const skip of ["node_modules", "server", "dist"]) {
    mkdirSync(join(dir, skip));
    writeFileSync(join(dir, skip, "ignored.css"), "@keyframes ignored { from { a: b } }");
  }
  writeFileSync(join(dir, "ui", "x.css"), "@keyframes fade { from { a: b } } .x { animation: fade 1s }");
  writeFileSync(join(dir, "readme.txt"), "@keyframes nope {}");
  mkdirSync(join(nm, "@xyflow", "react", "dist"), { recursive: true });
  writeFileSync(join(nm, "@xyflow", "react", "dist", "style.css"), "@keyframes dash { from { a: b } } .flow { animation: dash 1s }");

  const plugin = scopeDiagramCss(dir, nm);
  const transform = (code: string, id: string) => (plugin.transform as (c: string, i: string) => { code: string } | null)(code, id);

  it("is a pre-enforced plugin", () => {
    expect(plugin).toMatchObject({ name: "scope-diagram-css", enforce: "pre" });
  });
  it("scopes editor css, with keyframes found anywhere in the tree", () => {
    const out = transform(".x { animation: fade 1s }", `${dir}/ui/x.css?inline`);
    expect(out?.code).toContain(".sdd-root .x");
    expect(out?.code).toContain("sdd-fade");
  });
  it("scopes the xyflow stylesheet, using its keyframes", () => {
    const out = transform(".flow { animation: dash 1s }", `${nm}/@xyflow/react/dist/style.css`);
    expect(out?.code).toContain("sdd-dash");
  });
  it("ignores skipped dirs, non-css files and css elsewhere", () => {
    expect(transform(".x { animation: ignored 1s }", `${dir}/ui/x.css`)?.code).toContain("animation: ignored 1s");
    expect(transform("x", `${dir}/readme.txt`)).toBeNull();
    expect(transform("a { b: c }", "/elsewhere/other.css")).toBeNull();
  });
  it("derives the default node_modules path from dir", () => {
    const base = mkdtempSync(join(tmpdir(), "scope-default-"));
    const d = join(base, "a", "b");
    mkdirSync(d, { recursive: true });
    mkdirSync(join(base, "node_modules", "@xyflow", "react", "dist"), { recursive: true });
    writeFileSync(join(base, "node_modules", "@xyflow", "react", "dist", "style.css"), "");
    expect(scopeDiagramCss(d).name).toBe("scope-diagram-css");
  });
  it("falls back to the raw id when it has no query", () => {
    expect(transform("a { b: c }", `${dir}/ui/y.css`)?.code).toContain(".sdd-root a");
  });
});
