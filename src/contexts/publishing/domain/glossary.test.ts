import { describe, expect, it } from "vitest";
import { sameStory } from "./autosave";
import { cleanEntry, entriesProblem, entryProblem, parseAliases, sameGlossary } from "./glossary";
import { decodeCopy, encodeCopy } from "./localDraft";
import { emptyStory } from "./story";

const e = (term: string, aliases: string[] = [], definition = "def") => ({ term, aliases, definition });

describe("glossary entries", () => {
  it("parses and cleans aliases", () => {
    expect(parseAliases(" a, b ,a,, ")).toEqual(["a", "b"]);
    expect(cleanEntry({ term: " T ", aliases: ["x", "x"], definition: " d " })).toEqual({ term: "T", aliases: ["x"], definition: "d" });
  });
  it("mirrors the server limits", () => {
    expect(entryProblem(e("", [], "d"), [])).toBe("required");
    expect(entryProblem(e("t", [], " "), [])).toBe("required");
    expect(entryProblem(e("a".repeat(81)), [])).toBe("termLong");
    expect(entryProblem(e("ж".repeat(80)), [])).toBeUndefined();
    expect(entryProblem(e("t", ["a".repeat(81)]), [])).toBe("termLong");
    expect(entryProblem(e("t", [], "d".repeat(601)), [])).toBe("definitionLong");
    expect(
      entryProblem(
        e(
          "t",
          Array.from({ length: 11 }, (_, i) => `a${i}`),
        ),
        [],
      ),
    ).toBe("aliases");
    expect(
      entryProblem(
        e("new"),
        Array.from({ length: 50 }, (_, i) => e(`t${i}`)),
      ),
    ).toBe("entries");
  });
  it("rejects repeats of a term or form, ignoring case", () => {
    expect(entryProblem(e("POD"), [e("pod")])).toBe("duplicate");
    expect(entryProblem(e("x", ["Pod"]), [e("y", ["pod"])])).toBe("duplicate");
    expect(entryProblem(e("x", ["a", "A"]), [])).toBeUndefined(); // repeats within one entry are dropped, as the server does
    expect(entriesProblem([e("a"), e("b", ["A"])])).toBe("duplicate");
    expect(entriesProblem([e("a"), e("b")])).toBeUndefined();
    expect(entriesProblem(Array.from({ length: 51 }, (_, i) => e(`t${i}`)))).toBe("entries");
  });
  it("compares lists", () => {
    expect(sameGlossary([e("a")], [e("a")])).toBe(true);
    expect(sameGlossary([e("a")], [e("a", [], "other")])).toBe(false);
  });
});

describe("glossary in autosave and local drafts", () => {
  it("a glossary edit makes the story unsaved", () => {
    const a = emptyStory();
    expect(sameStory(a, { ...a, glossary: [e("a")] })).toBe(false);
    expect(sameStory({ ...a, glossary: [e("a")] }, { ...a, glossary: [e("a")] })).toBe(true);
  });
  it("is kept in the local copy, and old copies without it still load", () => {
    const f = { ...emptyStory(), glossary: [e("a", ["b"])] };
    expect(decodeCopy(encodeCopy(f, 1))?.form.glossary).toEqual(f.glossary);
    const old = JSON.stringify({ v: 1, at: 1, form: { ...emptyStory(), glossary: undefined } });
    expect(decodeCopy(old)?.form.glossary).toEqual([]);
  });
});

describe("cleanEntry aliases", () => {
  it("drops aliases repeating the term or each other, ignoring case", () => {
    expect(cleanEntry({ term: "Cache", aliases: ["cache", "Caching", "CACHING"], definition: "d" }).aliases).toEqual(["Caching"]);
    expect(entryProblem({ term: "Cache", aliases: ["cache"], definition: "d" }, [])).toBeUndefined();
  });
});
