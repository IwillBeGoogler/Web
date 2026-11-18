import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { patchEditor, richExtensions } from "../markdown";

it("toolbar heading commands make h1, h2 and h3", () => {
  const ed = patchEditor(new Editor({ extensions: richExtensions(), content: "<p>hello</p>" }));
  for (const level of [1, 2, 3] as const) {
    ed.chain().focus().setNode("heading", { level }).run();
    expect(ed.getHTML()).toContain(`<h${level}>hello</h${level}>`);
  }
});
