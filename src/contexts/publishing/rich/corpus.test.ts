import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canRoundTrip, parseMarkdown, serializeDoc } from "./markdown";

/**
 * Real-world Markdown from this repository (READMEs, design notes, docs) as a stand-in for story bodies, read from disk and never copied
 * into fixtures. A summary is written to stderr. The local database held no posts when this was written; point CORPUS_DIRS at a
 * folder of exported bodies (colon separated) to run the same check on them.
 */
const ROOT = resolve(__dirname, "../../../../..");
const dirs = (process.env.CORPUS_DIRS?.split(":") ?? [ROOT]).filter((d) => existsSync(d));

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", "test-results", "playwright-report", "legacy-js"].includes(n)) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (n.endsWith(".md") && s.size < 200_000) out.push(p);
  }
  return out;
}

const files = dirs.flatMap((d) => walk(d));

describe.skipIf(files.length === 0)("real-world Markdown corpus", () => {
  it("round-trips what it accepts and says why it refuses the rest", () => {
    const why: Record<string, number> = {};
    let ok = 0;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const r = canRoundTrip(text);
      if (r.ok) {
        ok++;
        const once = serializeDoc(parseMarkdown(text));
        expect(serializeDoc(parseMarkdown(once)), f).toBe(once);
      } else why[r.problem] = (why[r.problem] ?? 0) + 1;
    }
    process.stderr.write(`\n[corpus] ${files.length} files: ${ok} round-trip; refused: ${JSON.stringify(why)}\n`);
    expect(ok + Object.values(why).reduce((a, b) => a + b, 0)).toBe(files.length);
  });
});
