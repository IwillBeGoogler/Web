/// <reference path="../node_modules/vite/client.d.ts" />
// Fails `bun run typecheck:editor` when the hand-written declaration (src/contexts/diagrams/diagram-editor.d.ts, what Web compiles
// against) and the real editor (editor/src/embed.tsx) drift apart. Mutual assignability, both ways, for props, features and the
// other exported shapes; the function exports are compared by their types.

import type * as Decl from "@diagram-editor";
import type * as Decl_ from "@diagram-editor";
import type * as Real from "../editor/src/embed";
import type * as Real_ from "../editor/src/embed";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Within<A, B> = [A] extends [B] ? true : false;
type Assert<T extends true> = T;

export type Checks = [
  Assert<Same<Real.DiagramEditorProps, Decl.DiagramEditorProps>>,
  Assert<Same<Real.EmbedUser, Decl.EmbedUser>>,
  Assert<Same<Real.EmbedTarget, Decl.EmbedTarget>>,
  Assert<Same<Real.Features, Decl.Features>>,
  Assert<Same<Real.HostActionContext, Decl.HostActionContext>>,
  Assert<Within<typeof Real_.DEFAULT_API_BASE, typeof Decl_.DEFAULT_API_BASE>>, // a literal in the editor, string in the declaration
  Assert<Same<typeof Real_.EMBED_FEATURES, typeof Decl_.EMBED_FEATURES>>,
  Assert<Same<typeof Real_.hasUnsavedChanges, typeof Decl_.hasUnsavedChanges>>,
  Assert<Same<typeof Real_.confirmLeave, typeof Decl_.confirmLeave>>,
  Assert<Same<typeof Real_.flushPendingSaves, typeof Decl_.flushPendingSaves>>,
];
