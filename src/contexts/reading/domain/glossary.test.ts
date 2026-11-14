import { describe, expect, it } from "vitest";
import { buildMatcher, clearTerms, findMatches, fold, type GlobalTerm, globalTermSchema, markTerms, mergeTerms, type Term } from "./glossary";

const T = (id: string, term: string, aliases: string[] = [], definition = `def ${term}`): Term => ({ id, term, aliases, definition });
const found = (terms: Term[], text: string) => {
  const m = buildMatcher(terms);
  return m ? findMatches(m, text).map((h) => text.slice(h.start, h.end)) : [];
};

describe("fold", () => {
  it("lowercases and unifies apostrophes without changing length", () => {
    expect(fold("O‘zbek G’isht Oʻ`")).toBe("o'zbek g'isht o''");
    expect(fold("İstanbul").length).toBe("İstanbul".length);
    expect(fold("ДОКЕР")).toBe("докер");
  });
});

describe("matching", () => {
  it("is case-insensitive and on word boundaries", () => {
    const t = [T("1", "Go")];
    expect(found(t, "Go, go! GO.")).toEqual(["Go", "go", "GO"]);
    expect(found(t, "Google gopher ago go1 1go")).toEqual([]);
    expect(found(t, '(go) "go" go-lang')).toEqual(["go", "go", "go"]);
  });
  it("works with Cyrillic and Unicode letters", () => {
    const t = [T("1", "контейнер", ["контейнеры"])];
    expect(found(t, "Контейнер и контейнеры, контейнерный")).toEqual(["Контейнер", "контейнеры"]);
    expect(found([T("1", "ёж")], "Ёж")).toEqual(["Ёж"]);
  });
  it("keeps Uzbek apostrophes inside words, whichever quote is typed", () => {
    const t = [T("1", "o‘zgaruvchi"), T("2", "g'isht")];
    expect(found(t, "o'zgaruvchi, oʻzgaruvchi va O’ZGARUVCHI")).toEqual(["o'zgaruvchi", "oʻzgaruvchi", "O’ZGARUVCHI"]);
    expect(found(t, "G‘isht")).toEqual(["G‘isht"]);
  });
  it("does not match a short term inside an Uzbek word that continues after an apostrophe", () => {
    expect(found([T("1", "go")], "go'sht go' go")).toEqual(["go", "go"]);
    expect(found([T("1", "sht")], "go'sht")).toEqual([]);
    expect(found([T("1", "docker")], "Docker's image")).toEqual(["Docker"]);
  });
  it("prefers the longest name at a position", () => {
    const t = [T("1", "Docker"), T("2", "Docker Compose")];
    expect(found(t, "Docker Compose and Docker")).toEqual(["Docker Compose", "Docker"]);
  });
  it("escapes regex characters in names", () => {
    expect(found([T("1", "C++"), T("2", "a.b")], "C++ and a.b but not axb")).toEqual(["C++", "a.b"]);
  });
  it("has no matcher without names", () => {
    expect(buildMatcher([])).toBeNull();
    expect(buildMatcher([T("1", " ")])).toBeNull();
  });
});

describe("mergeTerms", () => {
  const g = (id: number, term: string, aliases: string[] = []): GlobalTerm => ({ id, term, aliases, definition: `global ${term}`, lang: "" });
  it("the article's term wins over a site term with the same name or alias", () => {
    const m = mergeTerms([{ term: "Pod", aliases: [], definition: "mine" }], [g(1, "pod"), g(2, "Node")]);
    expect(m.map((t) => [t.id, t.definition])).toEqual([
      ["a:0", "mine"],
      ["g:2", "global Node"],
    ]);
  });
  it("matches across apostrophe variants and keeps the unused names of a site term", () => {
    const m = mergeTerms([{ term: "o'zgaruvchi", aliases: [], definition: "mine" }], [g(1, "oʻzgaruvchi", ["var"])]);
    expect(m.find((t) => t.id === "g:1")).toMatchObject({ term: "var", aliases: [] });
  });
  it("ignores blank entries and a site term fully covered", () => {
    expect(mergeTerms([{ term: " ", aliases: [], definition: "x" }], [g(1, " ")])).toEqual([]);
    expect(mergeTerms([{ term: "a", aliases: ["b"], definition: "x" }], [g(1, "A", ["B"])]).map((t) => t.id)).toEqual(["a:0"]);
  });
  it("no terms for the language gives only the article's", () => {
    expect(mergeTerms([{ term: "a", aliases: [], definition: "x" }], []).map((t) => t.id)).toEqual(["a:0"]);
  });
});

describe("globalTermSchema", () => {
  it("defaults aliases and lang", () => {
    expect(globalTermSchema.parse({ id: 1, term: "a", aliases: null, definition: "d" })).toEqual({ id: 1, term: "a", aliases: [], definition: "d", lang: "" });
  });
});

const dom = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};
const marked = (root: Element) => [...root.querySelectorAll(".glossary-term")].map((e) => e.textContent);

describe("markTerms", () => {
  const terms = [T("1", "Docker"), T("2", "Pod", ["pods"])];
  it("marks only the first occurrence of each term, with the accessible attributes", () => {
    const root = dom("<p>Docker runs in a Pod. docker again, more pods.</p>");
    expect(markTerms(root, terms, "tip")).toBe(2);
    expect(marked(root)).toEqual(["Docker", "Pod"]);
    const span = root.querySelector(".glossary-term") as HTMLElement;
    expect(span.dataset.termId).toBe("1");
    expect(span.getAttribute("tabindex")).toBe("0");
    expect(span.getAttribute("role")).toBe("button");
    expect(span.getAttribute("aria-describedby")).toBe("tip");
    expect(root.textContent).toBe("Docker runs in a Pod. docker again, more pods.");
  });
  it("an alias counts as the same term", () => {
    const root = dom("<p>pods first, then Pod.</p>");
    markTerms(root, terms, "t");
    expect(marked(root)).toEqual(["pods"]);
  });
  it("skips code, links, headings, kbd and friends and uses the next allowed mention", () => {
    const root = dom(
      "<h2>Docker</h2><pre><code>Docker</code></pre><p><a href='/x'>Docker</a> <code>Docker</code> <kbd>Docker</kbd> <samp>Docker</samp> <button>Docker</button></p><p>Then Docker.</p>",
    );
    markTerms(root, [terms[0] as Term], "t");
    expect(marked(root)).toEqual(["Docker"]);
    expect(root.querySelector("p:last-child .glossary-term")).not.toBeNull();
  });
  it("skips live and code hosts", () => {
    const root = dom('<div data-live="0">Docker</div><div data-code="0"><span>Docker</span></div><p>x</p>');
    expect(markTerms(root, [terms[0] as Term], "t")).toBe(0);
  });
  it("never injects markup: text with angle brackets stays text", () => {
    const root = dom("<p>a &lt;b&gt;Docker&lt;/b&gt; c</p>");
    markTerms(root, [T("1", "Docker", [], "<img src=x onerror=alert(1)>")], "t");
    expect(root.querySelector("img, b")).toBeNull();
    expect(root.textContent).toBe("a <b>Docker</b> c");
  });
  it("is repeatable and clearTerms restores the text", () => {
    const root = dom("<p>Docker and Pod</p>");
    markTerms(root, terms, "t");
    markTerms(root, terms, "t");
    expect(marked(root)).toEqual(["Docker", "Pod"]);
    clearTerms(root);
    expect(root.querySelector(".glossary-term")).toBeNull();
    expect(root.innerHTML).toBe("<p>Docker and Pod</p>");
  });
  it("marks nothing with no terms", () => {
    const root = dom("<p>Docker</p>");
    expect(markTerms(root, [], "t")).toBe(0);
  });
  it("handles several terms in one text node and keeps neighbouring text", () => {
    const root = dom("<p>x Pod, y Docker z</p>");
    markTerms(root, terms, "t");
    expect(marked(root)).toEqual(["Pod", "Docker"]);
    expect(root.textContent).toBe("x Pod, y Docker z");
  });
});
