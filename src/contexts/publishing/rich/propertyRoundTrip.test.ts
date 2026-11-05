import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { check, randomDoc } from "./propertyDocs";

const SEEDS = Number(process.env.SEEDS ?? 1500);
const fixtures = Object.entries(import.meta.glob("./fixtures/prop/*.json", { eager: true, import: "default" })) as [string, JSONContent][];

describe("random documents round trip", () => {
  it(`${SEEDS} seeded documents`, () => {
    const bad: { len: number; msg: string }[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const doc = randomDoc(seed);
      const e = check(doc);
      if (e) bad.push({ len: JSON.stringify(doc).length, msg: `seed ${seed}: ${e}\n${JSON.stringify(doc)}` });
    }
    // the smallest failures first: they are the ones that can be read
    expect(
      bad
        .sort((a, b) => a.len - b.len)
        .slice(0, 5)
        .map((b) => b.msg),
    ).toEqual([]);
  });

  for (const [name, doc] of fixtures)
    it(`fixture ${name.split("/").pop()}`, () => {
      expect(check(doc)).toBeNull();
    });
});
