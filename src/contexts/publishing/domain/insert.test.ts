import { describe, expect, it } from "vitest";
import { insertBlock } from "./insert";

const L = "::diagram{slug=a-1}";

describe("insertBlock", () => {
  it("appends when there is no caret", () => {
    expect(insertBlock("", L, null)).toBe(`${L}\n`);
    expect(insertBlock("hi", L, null)).toBe(`hi\n\n${L}\n`);
    expect(insertBlock("hi\n", L, null)).toBe(`hi\n\n${L}\n`);
  });
  it("inserts mid-text as its own paragraph", () => {
    expect(insertBlock("onetwo", L, { start: 3, end: 3 })).toBe(`one\n\n${L}\n\ntwo`);
  });
  it("respects existing blank lines and replaces a selection", () => {
    expect(insertBlock("one\n\ntwo", L, { start: 5, end: 5 })).toBe(`one\n\n${L}\n\ntwo`);
    expect(insertBlock("a XX b", L, { start: 2, end: 4 })).toBe(`a \n\n${L}\n\n b`);
  });
  it("at the start and clamps a stale caret", () => {
    expect(insertBlock("body", L, { start: 0, end: 0 })).toBe(`${L}\n\nbody`);
    expect(insertBlock("body", L, { start: 99, end: 99 })).toBe(`body\n\n${L}\n`);
  });
});
