import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/contexts/reading/domain/post";
import { ApiError } from "@/shared/http";
import { autosaveDelay, hasAnyContent, hasServerContent, reconcileSave, type ServerStatus, sameStory, saveStatus } from "../domain/autosave";
import { localDraft } from "../domain/localDraft";
import { type StoryForm, storyFormSchema, storyToForm } from "../domain/story";
import { useSaveStory } from "./hooks";

const LOCAL_WRITE_MS = 400;

export type SaveMode = "auto" | "manual";

/** A refusal that waiting or typing more will not fix: the session, the permission, the account. Autosave stops until something changes. */
export const refusedForGood = (e: unknown): boolean => e instanceof ApiError && (e.status === 401 || e.status === 403);

export type StorySaverOptions = {
  /** All the form's current values (from useWatch). */
  values: StoryForm;
  /** What the server holds (after the last load or successful save). */
  saved: StoryForm;
  setSaved: (f: StoryForm) => void;
  /** Reads the form right now, not as of the last render. */
  getLatest: () => StoryForm;
  postId: number | undefined;
  serverStatus: ServerStatus;
  /** An existing story is in the form (it must not be saved over before that). */
  ready: boolean;
  /** A restore choice is pending: write nothing, save nothing. */
  paused: boolean;
  /** Keep the local copy but send nothing to the server on its own (the text in the form is not exactly what the author sees). */
  hold?: boolean;
  /** Changes when the reason a save was refused may be gone (for example the account got verified): the next change tries again. */
  releaseKey?: unknown;
  /** A story was created on the server by this session. */
  onCreated: (post: Post) => void;
};

/**
 * Saves for the story editor: autosave of drafts, one save in flight at a time, and a local copy of unsaved text.
 *
 * It never resets the form. A save only moves the baseline (`saved`) to what it sent, so text typed while the request was out
 * stays in the form and stays unsaved; the next save sends it.
 */
export function useStorySaver(o: StorySaverOptions) {
  const idRef = useRef(o.postId);
  if (o.postId) idRef.current = o.postId;
  const mutation = useSaveStory(() => idRef.current);
  const inflight = useRef<Promise<unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // set by a 401/403: no more automatic attempts until the tab is back in focus, the connection returns or `releaseKey` changes
  const refused = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [localCopy, setLocalCopy] = useState(false);
  const [retry, setRetry] = useState(0);
  const failedOn = useRef<StoryForm | null>(null);
  const editAt = useRef(Date.now());
  const dirtySince = useRef<number | null>(null);
  const opts = useRef(o);
  opts.current = o;
  // what the server holds, updated the moment a save lands (state would lag a render behind: a flush on unmount must not see the old one)
  const baseline = useRef(o.saved);
  baseline.current = o.saved;

  const dirty = !sameStory(o.values, o.saved);
  const saveable = (f: StoryForm) => hasServerContent(f) && storyFormSchema.safeParse({ ...f, status: "draft" }).success;

  /** Sends `values` to the server, after any save already in flight. Auto saves skip instead of waiting (the scheduler comes back). */
  const run = useCallback(
    async (values: StoryForm, status: StoryForm["status"], mode: SaveMode): Promise<Post | null> => {
      while (inflight.current) {
        if (mode === "auto") return null;
        await inflight.current.catch(() => {});
      }
      const wasNew = !idRef.current;
      const p = mutation.mutateAsync({ ...values, status });
      inflight.current = p;
      setSaving(true);
      try {
        const post = await p;
        idRef.current = post.id;
        const now = opts.current.getLatest();
        const r = reconcileSave(values, now);
        baseline.current = { ...values, status: storyToForm(post).status };
        opts.current.setSaved(baseline.current);
        failedOn.current = null;
        refused.current = false;
        setFailed(false);
        setError(null);
        setLastSavedAt(Date.now());
        if (r.dirty) dirtySince.current = Date.now();
        if (wasNew) localDraft.clear(undefined);
        if (r.clearLocal) {
          localDraft.clear(post.id);
          setLocalCopy(false);
        }
        if (wasNew) opts.current.onCreated(post);
        return post;
      } catch (e) {
        failedOn.current = values;
        refused.current = refusedForGood(e);
        setFailed(true);
        setError(e);
        if (mode === "manual") throw e;
        return null;
      } finally {
        inflight.current = null;
        setSaving(false);
      }
    },
    [mutation.mutateAsync],
  );

  // note when edits happened
  // biome-ignore lint/correctness/useExhaustiveDependencies: values identity is the change signal
  useEffect(() => {
    if (!dirty) {
      dirtySince.current = null;
      return;
    }
    editAt.current = Date.now();
    dirtySince.current ??= Date.now();
  }, [o.values]);

  // autosave drafts
  // biome-ignore lint/correctness/useExhaustiveDependencies: run is stable enough; values/saving/retry drive the schedule
  useEffect(() => {
    const blocked = o.paused || !!o.hold || refused.current || (failedOn.current !== null && sameStory(failedOn.current, o.values));
    const now = Date.now();
    const delay = autosaveDelay({
      serverStatus: o.serverStatus,
      ready: o.ready,
      dirty,
      saveable: dirty && saveable(o.values),
      inFlight: saving,
      blocked,
      sinceEdit: now - editAt.current,
      sinceDirty: now - (dirtySince.current ?? now),
    });
    if (delay === null) return;
    const t = setTimeout(() => void run(opts.current.getLatest(), "draft", "auto"), delay);
    return () => clearTimeout(t);
  }, [o.values, o.saved, o.serverStatus, o.ready, o.paused, o.hold, saving, retry]);

  /** One more automatic attempt is allowed (the connection is back, the tab is in view again, the account changed). */
  const release = useCallback(() => {
    failedOn.current = null;
    refused.current = false;
    setRetry((n) => n + 1);
  }, []);
  useEffect(() => {
    const back = () => release();
    const visible = () => document.visibilityState === "visible" && refused.current && back();
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [release]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed key is the signal
  useEffect(() => {
    if (refused.current) release();
  }, [o.releaseKey]);

  /** Writes the local copy now (or clears it when there is nothing unsaved). */
  const flushLocal = useCallback(() => {
    const c = opts.current;
    if (c.paused) return;
    const latest = c.getLatest();
    const key = idRef.current ?? c.postId;
    if (sameStory(latest, baseline.current) || !hasAnyContent(latest)) {
      localDraft.clear(key);
      setLocalCopy(false);
    } else setLocalCopy(localDraft.write(key, latest));
  }, []);
  const flushRef = useRef(flushLocal);
  flushRef.current = flushLocal;

  // biome-ignore lint/correctness/useExhaustiveDependencies: values/saved/paused are the triggers
  useEffect(() => {
    const t = setTimeout(flushLocal, LOCAL_WRITE_MS);
    return () => clearTimeout(t);
  }, [o.values, o.saved, o.paused, flushLocal]);

  useEffect(() => {
    const hide = () => flushRef.current();
    const vis = () => document.visibilityState === "hidden" && hide();
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", vis);
      hide();
    };
  }, []);

  const serverAutosave = (o.serverStatus === "new" || o.serverStatus === "draft") && saveable(o.values);
  const status = saveStatus({ saving, failed, dirty, serverAutosave, localCopy, lastSavedAt });
  return { run, flushLocal, status, saving, dirty, serverAutosave, error: failed ? error : null, saveable: () => saveable(opts.current.getLatest()) };
}
