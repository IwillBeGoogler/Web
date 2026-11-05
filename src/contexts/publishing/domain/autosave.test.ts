import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_MAX_MS,
  type AutosaveInput,
  autosaveDelay,
  canAutosave,
  hasServerContent,
  reconcileSave,
  sameStory,
  saveStatus,
} from "./autosave";
import { emptyStory, type StoryForm } from "./story";

const form = (o: Partial<StoryForm> = {}): StoryForm => ({ ...emptyStory(), title: "T", body: "hello", ...o });
const base: AutosaveInput = { serverStatus: "draft", ready: true, dirty: true, saveable: true, inFlight: false, blocked: false, sinceEdit: 0, sinceDirty: 0 };

describe("autosaveDelay", () => {
  it("waits for typing to stop, then saves", () => {
    expect(autosaveDelay(base)).toBe(AUTOSAVE_IDLE_MS);
    expect(autosaveDelay({ ...base, sinceEdit: 1000 })).toBe(AUTOSAVE_IDLE_MS - 1000);
    expect(autosaveDelay({ ...base, sinceEdit: 5000 })).toBe(0);
  });
  it("saves at least every 30 s while the user keeps typing", () => {
    expect(autosaveDelay({ ...base, sinceEdit: 100, sinceDirty: AUTOSAVE_MAX_MS - 500 })).toBe(500);
    expect(autosaveDelay({ ...base, sinceEdit: 100, sinceDirty: AUTOSAVE_MAX_MS + 1 })).toBe(0);
  });
  it("a new story is saved as a draft", () => {
    expect(autosaveDelay({ ...base, serverStatus: "new" })).toBe(AUTOSAVE_IDLE_MS);
  });
  it("NEVER autosaves a published or scheduled story", () => {
    for (const serverStatus of ["published", "scheduled"] as const) {
      expect(canAutosave(serverStatus)).toBe(false);
      expect(autosaveDelay({ ...base, serverStatus, sinceEdit: 99_999, sinceDirty: 99_999 })).toBeNull();
    }
  });
  it("does nothing when clean, empty, loading, saving or waiting on a decision", () => {
    expect(autosaveDelay({ ...base, dirty: false })).toBeNull();
    expect(autosaveDelay({ ...base, saveable: false })).toBeNull();
    expect(autosaveDelay({ ...base, ready: false })).toBeNull();
    expect(autosaveDelay({ ...base, inFlight: true })).toBeNull();
    expect(autosaveDelay({ ...base, blocked: true })).toBeNull();
  });
});

describe("hasServerContent", () => {
  it("needs a title: the server rejects an untitled story", () => {
    expect(hasServerContent({ title: "  " })).toBe(false);
    expect(hasServerContent({ title: "A" })).toBe(true);
  });
});

describe("sameStory", () => {
  it("ignores status, compares text, tags as the server stores them", () => {
    expect(sameStory(form(), form({ status: "published" }))).toBe(true);
    expect(sameStory(form(), form({ body: "hello!" }))).toBe(false);
    expect(sameStory(form({ tags: ["A", "a "] }), form({ tags: ["a"] }))).toBe(true);
  });
});

describe("reconcileSave: typing during a save is not lost", () => {
  it("clean when nothing was typed meanwhile", () => {
    const sent = form({ body: "one" });
    expect(reconcileSave(sent, form({ body: "one" }))).toEqual({ baseline: sent, dirty: false, clearLocal: true });
  });
  it("keeps newer text, stays dirty and keeps the local copy", () => {
    const sent = form({ body: "one" });
    const now = form({ body: "one two" });
    const r = reconcileSave(sent, now);
    expect(r.dirty).toBe(true);
    expect(r.clearLocal).toBe(false);
    expect(r.baseline.body).toBe("one"); // the baseline is what the server has, never the typed text
  });
});

describe("saveStatus", () => {
  const v = { saving: false, failed: false, dirty: false, serverAutosave: true, localCopy: false, lastSavedAt: null };
  it("orders states", () => {
    expect(saveStatus({ ...v, saving: true, failed: true }).kind).toBe("saving");
    expect(saveStatus({ ...v, failed: true }).kind).toBe("failed");
    expect(saveStatus({ ...v, dirty: true, serverAutosave: false, localCopy: true }).kind).toBe("local");
    expect(saveStatus({ ...v, lastSavedAt: 5 })).toEqual({ kind: "saved", at: 5 });
    expect(saveStatus({ ...v, dirty: true, lastSavedAt: 5 }).kind).toBe("none");
  });
});
