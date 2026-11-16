import { expect, it } from "vitest";
import { parseMarkdown, serializeDoc } from "../markdown";

it("keeps an escaped pipe inside a table cell", () => {
  const md = serializeDoc(parseMarkdown("| a | b |\n| --- | --- |\n| x \\| y | z |\n"));
  expect(md).toContain("x \\| y");
});

it("keeps column alignment", () => {
  const md = serializeDoc(parseMarkdown("| a | b |\n|:---:|---:|\n| 1 | 2 |\n"));
  expect(md).toMatch(/:-+:/);
  expect(md).toMatch(/-+:/);
});
