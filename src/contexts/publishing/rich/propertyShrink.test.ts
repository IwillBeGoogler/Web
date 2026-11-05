import type { JSONContent } from "@tiptap/core";
import { it } from "vitest";
import { serializeDoc } from "./markdown";
import { check, randomDoc } from "./propertyDocs";

function variants(d: any, path: (string | number)[] = []): any[] {
  const out: any[] = [];
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const walk = (node: any, p: (string | number)[]) => {
    if (Array.isArray(node)) {
      node.forEach((_, i) => {
        const c = clone(d);
        let t = c;
        for (const k of p) t = t[k];
        t.splice(i, 1);
        out.push(c);
      });
      node.forEach((x, i) => {
        walk(x, [...p, i]);
      });
    } else if (node && typeof node === "object") {
      if (typeof node.text === "string" && [...node.text].length > 1) {
        {
          const cs = [...node.text];
          for (let i = 0; i < cs.length; i++) {
            const c = clone(d);
            let t = c;
            for (const k of p) t = t[k];
            t.text = cs.filter((_, j) => j !== i).join("");
            out.push(c);
          }
        }
      }
      if (node.marks) {
        node.marks.forEach((_: any, i: number) => {
          const c = clone(d);
          let t = c;
          for (const k of p) t = t[k];
          t.marks.splice(i, 1);
          if (!t.marks.length) delete t.marks;
          out.push(c);
        });
      }
      for (const k of Object.keys(node)) walk(node[k], [...p, k]);
    }
  };
  walk(d, path);
  return out;
}
/** A developer tool: `SHRINK=1 SEEDS=30000 npx vitest run propertyShrink` finds failing random documents and shrinks each to a minimal one. */
it.skipIf(!process.env.SHRINK)("shrinks failing random documents", { timeout: 300000 }, () => {
  const fails: string[] = [];
  const seeds = process.env.SEED ? process.env.SEED.split(",").map(Number) : Array.from({ length: Number(process.env.SEEDS ?? 3000) }, (_, i) => i + 1);
  const found: JSONContent[] = [];
  for (const s of seeds) {
    const d = randomDoc(s);
    if (check(d) && !check(d)?.startsWith("Markdown mode needed (footnote")) found.push(d);
  }
  const seen = new Set<string>();
  for (let d of found.slice(0, Number(process.env.N ?? 12))) {
    let progress = true;
    while (progress) {
      progress = false;
      for (const v of variants(d)) {
        let e: string | null = null;
        try {
          e = check(v);
        } catch {
          e = "throw";
        }
        if (e) {
          d = v;
          progress = true;
          break;
        }
      }
    }
    const k = serializeDoc(d);
    if (seen.has(k)) continue;
    seen.add(k);
    fails.push(JSON.stringify(d) + "\nMD " + JSON.stringify(k) + "\n" + check(d));
  }
  console.log("FOUND", found.length, "\n" + fails.join("\n\n"));
});
