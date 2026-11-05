import { describe, expect, it } from "vitest";
import { filterSlash, SLASH_ORDER, type SlashId, slashQuery } from "./slash";

describe("slashQuery", () => {
  it("opens for a slash alone or followed by a word, at the start of the block", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/head")).toBe("head");
    expect(slashQuery("/h2")).toBe("h2");
    expect(slashQuery("/заг")).toBe("заг");
  });
  it("stays closed for anything else", () => {
    for (const t of ["", "text", "a /", " /", "/ x", "/a b", "//", "http://x", "/a/b", "1/2"]) expect(slashQuery(t), t).toBeNull();
  });
});

describe("filterSlash", () => {
  const labels = Object.fromEntries(SLASH_ORDER.map((id) => [id, id.toUpperCase()])) as Record<SlashId, string>;
  it("lists everything for an empty query", () => {
    expect(filterSlash(labels, "")).toEqual(SLASH_ORDER);
  });
  it("matches English keywords whatever the label language", () => {
    expect(filterSlash({ ...labels, quote: "Iqtibos" }, "quote")).toEqual(["quote"]);
    expect(filterSlash(labels, "list")).toEqual(["ul", "ol"]);
    expect(filterSlash(labels, "anim")).toEqual(["live"]);
    expect(filterSlash(labels, "zzz")).toEqual([]);
  });
});
