import { describe, expect, it } from "vitest";
import { applyPrefs, readingPrefs } from "./store";

describe("reading prefs store", () => {
  it("applies palette tokens, dark mode and modes to <html>", () => {
    readingPrefs.set({ palette: "carbon", typeStep: 2, measureStep: -1, bold: true, focus: true });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface")).toBe("#171717");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--article-size")).toBe("22px");
    expect(root.style.getPropertyValue("--article-measure")).toBe("76ch");
    expect(root.classList.contains("bold-text")).toBe(true);
    expect(root.classList.contains("focus-mode")).toBe(true);
    expect(JSON.parse(localStorage.getItem("iblog.reading") ?? "{}").palette).toBe("carbon");
  });
  it("loads a webfont only once, on demand", () => {
    readingPrefs.set({ typeface: "lora" });
    readingPrefs.set({ typeface: "lora", typeStep: 1 });
    expect(document.querySelectorAll('link[data-typeface="lora"]')).toHaveLength(1);
  });
  it("reset returns to galaxy", () => {
    readingPrefs.reset();
    expect(readingPrefs.get().palette).toBe("galaxy");
    applyPrefs(readingPrefs.get());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
