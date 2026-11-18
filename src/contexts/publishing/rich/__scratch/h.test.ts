import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { patchEditor, richExtensions, serializeDoc } from "../markdown";
it("heading", () => {
  const ed = patchEditor(new Editor({ extensions: richExtensions(), content: "<p>hello</p>" }));
  ed.chain().focus().toggleHeading({ level: 2 }).run();
  console.log("toggle:", ed.getHTML(), JSON.stringify(serializeDoc(ed.getJSON())));
  ed.commands.setContent("<p>x</p>");
  ed.chain().focus().setNode("heading", { level: 3 }).run();
  console.log("setNode:", ed.getHTML());
  expect(1).toBe(1);
});
