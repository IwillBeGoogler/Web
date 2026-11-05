import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/http";
import { type ServerStatus, sameStory } from "../domain/autosave";
import { localDraft } from "../domain/localDraft";
import { emptyStory, type StoryForm } from "../domain/story";
import { useStorySaver } from "./useStorySaver";

const calls: { kind: "create" | "update"; id?: number; body: string; status: string }[] = [];
let release: (() => void)[] = [];
let manual = false;
let fail: boolean | Error = false;
const post = (id: number, d: { body: string; status: string; title: string }) => ({
  id,
  slug: `s-${id}`,
  title: d.title,
  subtitle: "",
  body: d.body,
  status: d.status,
  cover_url: "",
  tags: [],
  updated_at: new Date().toISOString(),
});
vi.mock("../infrastructure/storyRepository", () => ({
  storyRepository: {
    create: (d: { body: string; status: string; title: string }) => {
      calls.push({ kind: "create", body: d.body, status: d.status });
      return respond(post(7, d));
    },
    update: (id: number, d: { body: string; status: string; title: string }) => {
      calls.push({ kind: "update", id, body: d.body, status: d.status });
      return respond(post(id, d));
    },
  },
}));
const respond = (p: unknown) =>
  new Promise((resolve, reject) => {
    const go = () => (fail ? reject(fail instanceof Error ? fail : new Error("offline")) : resolve(p));
    if (manual) release.push(go);
    else go();
  });

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const f = (o: Partial<StoryForm> = {}): StoryForm => ({ ...emptyStory(), title: "T", ...o });

/** Holds the form the way EditorPage does: values the user types, a baseline the saves move. */
function setup(serverStatus: ServerStatus, start: StoryForm, postId?: number, extra: { hold?: boolean } = {}) {
  return renderHook(
    (props: { releaseKey?: unknown } = {}) => {
      const [values, setValues] = useState(start);
      const [saved, setSaved] = useState(serverStatus === "new" ? emptyStory() : start);
      const latest = { current: values };
      latest.current = values;
      const saver = useStorySaver({
        values,
        saved,
        setSaved,
        getLatest: () => latest.current,
        postId,
        serverStatus,
        ready: true,
        paused: false,
        hold: extra.hold,
        releaseKey: props.releaseKey,
        onCreated: () => {},
      });
      return { saver, values, saved, type: (b: string) => setValues((v) => ({ ...v, body: b })) };
    },
    { wrapper: wrap },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  release = [];
  manual = false;
  fail = false;
});
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("useStorySaver", () => {
  it("saves a draft 3 s after typing stops, not before", async () => {
    const h = setup("draft", f({ body: "a" }), 5);
    act(() => h.result.current.type("ab"));
    await tick(2900);
    expect(calls).toHaveLength(0);
    await tick(200);
    expect(calls).toEqual([{ kind: "update", id: 5, body: "ab", status: "draft" }]);
    expect(h.result.current.saver.dirty).toBe(false);
  });

  it("creates a new story only once it has a title, as a draft", async () => {
    const h = setup("new", emptyStory());
    act(() => h.result.current.type("body only"));
    await tick(10_000);
    expect(calls).toHaveLength(0);
    expect(localDraft.read(undefined)?.form.body).toBe("body only");
  });

  it("NEVER autosaves a published or scheduled story, but keeps a local copy", async () => {
    for (const s of ["published", "scheduled"] as const) {
      const h = setup(s, f({ body: "a", status: s }), 5);
      act(() => h.result.current.type("edited"));
      await tick(120_000);
      expect(calls).toHaveLength(0);
      expect(localDraft.read(5)?.form.body).toBe("edited");
      expect(h.result.current.saver.status.kind).toBe("local");
      h.unmount();
      localStorage.clear();
    }
  });

  it("typing during a save is not lost: one save in flight, then the newest", async () => {
    manual = true;
    const h = setup("draft", f({ body: "a" }), 5);
    act(() => h.result.current.type("one"));
    await tick(3100);
    expect(calls.map((c) => c.body)).toEqual(["one"]);
    act(() => h.result.current.type("one two")); // typed while the request is out
    await tick(5000);
    expect(calls).toHaveLength(1); // no overlapping save
    await act(async () => release.shift()?.());
    await tick(0);
    expect(h.result.current.values.body).toBe("one two"); // not reset to the server copy
    expect(h.result.current.saved.body).toBe("one");
    expect(h.result.current.saver.dirty).toBe(true);
    expect(localDraft.read(5)?.form.body).toBe("one two");
    await tick(3100);
    expect(calls.map((c) => c.body)).toEqual(["one", "one two"]);
    await act(async () => release.shift()?.());
    await tick(0);
    expect(h.result.current.saver.dirty).toBe(false);
    expect(localDraft.read(5)).toBeNull();
  });

  it("a failed autosave shows status only and retries on the next change", async () => {
    fail = true;
    const h = setup("draft", f({ body: "a" }), 5);
    act(() => h.result.current.type("b"));
    await tick(3100);
    expect(h.result.current.saver.status.kind).toBe("failed");
    await tick(60_000);
    expect(calls).toHaveLength(1); // no retry loop on an unchanged story
    fail = false;
    act(() => h.result.current.type("bc"));
    await tick(3100);
    expect(calls).toHaveLength(2);
    expect(h.result.current.saver.status.kind).toBe("saved");
    expect(sameStory(h.result.current.saved, h.result.current.values)).toBe(true);
  });

  it("retries when the connection comes back", async () => {
    fail = true;
    const h = setup("draft", f({ body: "a" }), 5);
    act(() => h.result.current.type("b"));
    await tick(3100);
    fail = false;
    act(() => void window.dispatchEvent(new Event("online")));
    await tick(3100);
    expect(calls).toHaveLength(2);
    expect(h.result.current.saver.dirty).toBe(false);
  });

  const unverified = () => new ApiError(403, { code: "EMAIL_NOT_VERIFIED", detail: "Confirm your email first" }, { method: "POST", path: "/api/posts" });

  it("an unverified account: one refusal, then no more attempts while the author keeps typing, and the text stays on this device", async () => {
    fail = unverified();
    const h = setup("new", f({ body: "a" }));
    act(() => h.result.current.type("ab"));
    await tick(3100);
    expect(calls).toHaveLength(1);
    expect(h.result.current.saver.status.kind).toBe("failed");
    expect(h.result.current.saver.error).toBeInstanceOf(ApiError);
    expect((h.result.current.saver.error as ApiError).code).toBe("EMAIL_NOT_VERIFIED");
    for (const text of ["abc", "abcd", "abcde"]) {
      act(() => h.result.current.type(text));
      await tick(10_000);
    }
    expect(calls).toHaveLength(1);
    expect(localDraft.read(undefined)?.form.body).toBe("abcde");
    // the account gets verified: the next change is sent
    fail = false;
    h.rerender({ releaseKey: true });
    await tick(3100);
    expect(calls.map((c) => c.body)).toEqual(["ab", "abcde"]);
    expect(h.result.current.saver.status.kind).toBe("saved");
    expect(h.result.current.saver.error).toBeNull();
  });

  it("a refusal for good is tried again when the tab comes back into view", async () => {
    fail = unverified();
    const h = setup("new", f({ body: "a" }));
    act(() => h.result.current.type("ab"));
    await tick(3100);
    expect(calls).toHaveLength(1);
    fail = false;
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    await tick(3100);
    expect(calls).toHaveLength(2);
  });

  it("a validation error keeps the server's message and is retried only after the text changes", async () => {
    fail = new ApiError(422, { detail: "title is too long" }, { method: "POST", path: "/api/posts" });
    const h = setup("draft", f({ body: "a" }), 5);
    act(() => h.result.current.type("ab"));
    await tick(3100);
    expect(calls).toHaveLength(1);
    expect((h.result.current.saver.error as ApiError).message).toBe("title is too long");
    await tick(60_000);
    expect(calls).toHaveLength(1);
    act(() => h.result.current.type("abc"));
    await tick(3100);
    expect(calls).toHaveLength(2);
  });

  it("while held, nothing is sent on its own but the local copy follows every change", async () => {
    const h = setup("draft", f({ body: "a" }), 5, { hold: true });
    act(() => h.result.current.type("ab"));
    await tick(30_000);
    act(() => h.result.current.type("abc"));
    await tick(30_000);
    expect(calls).toHaveLength(0);
    expect(localDraft.read(5)?.form.body).toBe("abc");
  });
});
