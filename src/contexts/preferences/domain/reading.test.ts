import { describe, expect, it } from "vitest";
import { articleFontPx, bionicSegments, fixationLength, measureCh, normalizePrefs, PALETTES, paletteOf, paletteVars, TYPEFACES } from "./reading";

describe("reading prefs", () => {
  it("ships the full palette and typeface catalogue with unique ids", () => {
    expect(PALETTES).toHaveLength(19);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    expect(PALETTES.filter((p) => p.mode === "dark").map((p) => p.id)).toContain("carbon");
    expect(new Set(TYPEFACES.map((t) => t.id)).size).toBe(TYPEFACES.length);
  });
  it("normalizes stored prefs", () => {
    expect(normalizePrefs(null)).toMatchObject({ palette: "galaxy", typeface: "source-serif", typeStep: 0 });
    expect(normalizePrefs(null, true).palette).toBe("galaxy");
    expect(normalizePrefs({ palette: "gone", typeface: "lora", typeStep: 99, measureStep: -99, bold: "yes", bionic: true })).toEqual({
      palette: "galaxy",
      typeface: "lora",
      typeStep: 4,
      measureStep: -9,
      bold: false,
      bionic: true,
      focus: false,
    });
  });
  it("maps a palette onto the site's tokens", () => {
    const v = paletteVars(paletteOf("sepia"));
    expect(v["--surface"]).toBe("#f4ecd8");
    expect(v["--fg"]).toBe("#1f1a12");
    expect(v["--accent"]).toBe("#96601c");
    expect(paletteVars(paletteOf("nord"))["--on-accent"]).toBe("#2e3440");
  });
  it("size and measure steps", () => {
    expect(articleFontPx(-2)).toBe(18);
    expect(articleFontPx(10)).toBe(24);
    expect(measureCh(0)).toBe(80);
    expect(measureCh(-9)).toBe(44);
  });
  it("bionic fixation and segments", () => {
    expect(fixationLength("a")).toBe(1);
    expect(fixationLength("the")).toBe(1);
    expect(fixationLength("reading")).toBe(3);
    expect(bionicSegments("Hi, (reading) is fun!")).toEqual([
      { t: "Hi," },
      { t: " " },
      { t: "(" },
      { b: "rea", t: "ding)" },
      { t: " " },
      { t: "is" },
      { t: " " },
      { b: "f", t: "un!" },
    ]);
  });
});
