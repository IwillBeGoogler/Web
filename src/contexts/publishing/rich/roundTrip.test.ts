import { describe, expect, it } from "vitest";
import { scanLive } from "./liveScan";
import { canRoundTrip, parseMarkdown, type RichProblem, serializeDoc } from "./markdown";

const load = (g: Record<string, string>) => Object.entries(g).map(([path, text]) => ({ name: path.split("/").pop() as string, text }));
const ok = load(import.meta.glob("./fixtures/ok/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>);
const mdOnly = load(import.meta.glob("./fixtures/md-only/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>);

const roundTrip = (md: string) => serializeDoc(parseMarkdown(md));

describe("round trip corpus", () => {
  it("has fixtures", () => {
    expect(ok.length).toBeGreaterThan(8);
    expect(mdOnly.length).toBeGreaterThan(12);
  });

  for (const f of ok) {
    it(`${f.name} round-trips`, () => {
      expect(canRoundTrip(f.text)).toEqual({ ok: true });
      const once = roundTrip(f.text);
      // writing it again changes nothing: the editor's output is stable
      expect(roundTrip(once)).toBe(once);
      // html-live source survives byte for byte
      expect(scanLive(once).map((b) => [b.height, b.code])).toEqual(scanLive(f.text).map((b) => [b.height, b.code]));
    });
  }

  for (const f of mdOnly) {
    const expected = f.name.split("-")[0] as RichProblem;
    it(`${f.name} is kept in Markdown mode (${expected})`, () => {
      const r = canRoundTrip(f.text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toBe(expected);
    });
  }
});
