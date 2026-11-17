import { readFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { it } from "vitest";
import { canRoundTrip, parseMarkdown, patchEditor, richExtensions } from "../markdown";

const md = readFileSync(`${process.cwd()}/src/contexts/publishing/rich/__scratch/post1.md`, "utf8");
it("post1 loads", () => {
  process.stdout.write(`roundtrip ${JSON.stringify(canRoundTrip(md))}\n`);
  const doc = parseMarkdown(md);
  process.stdout.write(`top ${JSON.stringify((doc.content ?? []).map((n) => n.type))}\n`);
  const ed = patchEditor(new Editor({ extensions: richExtensions(), content: "" }));
  ed.commands.setContent(doc);
  try { ed.state.doc.check(); process.stdout.write("doc ok\n"); } catch (e) { process.stdout.write(`doc bad ${e}\n`); }
  ed.state.doc.descendants((n) => { try { n.check(); } catch (e) { process.stdout.write(`bad node ${n.type.name} ${JSON.stringify(n.toJSON()).slice(0, 300)}\n`); } return true; });
});
import { serializeDoc } from "../markdown";
it("post1 round-trips through the editor", () => {
  const ed = patchEditor(new Editor({ extensions: richExtensions(), content: "" }));
  ed.commands.setContent(parseMarkdown(md));
  ed.state.doc.check();
  ed.commands.insertContent("x");
  const s = serializeDoc(parseMarkdown(md));
  process.stdout.write(`same ${JSON.stringify(parseMarkdown(s)) === JSON.stringify(parseMarkdown(md))} ${s.includes("**`Base`**")}\n`);
});
it("diff", () => {
  const a = parseMarkdown(md).content ?? [];
  const b = parseMarkdown(serializeDoc(parseMarkdown(md))).content ?? [];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { process.stdout.write(`A ${JSON.stringify(a[i]).slice(0, 400)}\nB ${JSON.stringify(b[i]).slice(0, 400)}\n`); break; }
});
