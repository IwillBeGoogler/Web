import { describe, expect, it } from "vitest";
import { canRoundTrip, parseMarkdown, serializeDoc } from "./markdown";

const md = "| A | B |\n| --- | :-: |\n| **x** | `y` |\n| 1 | 2 |";

describe("tables", () => {
  it("round-trips a GFM table", () => {
    expect(canRoundTrip(md)).toEqual({ ok: true });
    expect(parseMarkdown(serializeDoc(parseMarkdown(md)))).toEqual(parseMarkdown(md));
  });
  it("refuses raw HTML inside a cell", () => {
    expect(canRoundTrip("| A |\n| --- |\n| <b>x</b> |")).toMatchObject({
      ok: false,
    });
  });
});
