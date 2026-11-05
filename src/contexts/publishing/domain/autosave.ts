import { normTags, type StoryForm } from "./story";

/** Autosave waits this long after the last keystroke, and never longer than MAX since the edits began. */
export const AUTOSAVE_IDLE_MS = 3_000;
export const AUTOSAVE_MAX_MS = 30_000;

/** "new" = not created on the server yet. */
export type ServerStatus = "new" | "draft" | "published" | "scheduled";

/** Whether two forms hold the same story. `status` is ignored: it is the target of a save, not something typed. */
export function sameStory(a: StoryForm, b: StoryForm): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.body === b.body &&
    a.coverUrl === b.coverUrl &&
    a.publishAt === b.publishAt &&
    a.publicationId === b.publicationId &&
    normTags(a.tags).join("\n") === normTags(b.tags).join("\n")
  );
}

/** Only drafts (and stories not created yet) are ever written to the server unasked. Published and scheduled stories would go live. */
export const canAutosave = (s: ServerStatus) => s === "new" || s === "draft";

/** The server needs a title; a body with no title stays on this device. */
export const hasServerContent = (f: Pick<StoryForm, "title">) => f.title.trim().length > 0;

export const hasAnyContent = (f: Pick<StoryForm, "title" | "subtitle" | "body">) => [f.title, f.subtitle, f.body].some((s) => s.trim().length > 0);

export type AutosaveInput = {
  serverStatus: ServerStatus;
  /** The story has been loaded into the form (an existing story must not be saved over before that). */
  ready: boolean;
  dirty: boolean;
  /** Valid for the server and has a title. */
  saveable: boolean;
  inFlight: boolean;
  /** A restore choice is pending, or the last attempt failed and nothing changed since. */
  blocked: boolean;
  /** ms since the last edit */
  sinceEdit: number;
  /** ms since the unsaved edits began */
  sinceDirty: number;
};

/** Milliseconds until the next autosave should fire, or null when none should be scheduled. */
export function autosaveDelay(i: AutosaveInput): number | null {
  if (!i.ready || !canAutosave(i.serverStatus) || !i.dirty || !i.saveable || i.inFlight || i.blocked) return null;
  return Math.max(0, Math.min(AUTOSAVE_IDLE_MS - i.sinceEdit, AUTOSAVE_MAX_MS - i.sinceDirty));
}

/**
 * What to do with the form when a save of `saved` succeeds while the form may have moved on.
 * The form is never reset to the server's copy: whatever is typed now stays, and is still unsaved when it differs.
 */
export function reconcileSave(saved: StoryForm, current: StoryForm): { baseline: StoryForm; dirty: boolean; clearLocal: boolean } {
  const dirty = !sameStory(saved, current);
  return { baseline: saved, dirty, clearLocal: !dirty };
}

export type SaveView = {
  saving: boolean;
  failed: boolean;
  dirty: boolean;
  /** The next change would be sent to the server on its own. */
  serverAutosave: boolean;
  /** A copy of the unsaved text is in this browser. */
  localCopy: boolean;
  lastSavedAt: number | null;
};

export type SaveStatus = { kind: "saving" | "failed" | "local" | "saved" | "none"; at?: number };

export function saveStatus(v: SaveView): SaveStatus {
  if (v.saving) return { kind: "saving" };
  if (v.failed) return { kind: "failed" };
  if (v.dirty && !v.serverAutosave && v.localCopy) return { kind: "local" };
  if (!v.dirty && v.lastSavedAt !== null) return { kind: "saved", at: v.lastSavedAt };
  return { kind: "none" };
}

export const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
