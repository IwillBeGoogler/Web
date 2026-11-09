import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, HistoryIcon, ImageIcon, MaximizeIcon, SaveIcon, ShapesIcon, SparklesIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { accountSecurityRepository } from "@/contexts/account/infrastructure/accountSecurityRepository";
import { myPublicationsQuery } from "@/contexts/collections/application/hooks";
import { DiagramPicker } from "@/contexts/diagrams/ui/DiagramPicker";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { adopted } from "@/contexts/publishing/application/adopted";
import { useStorySaver } from "@/contexts/publishing/application/useStorySaver";
import { canAutosave, clockTime, type ServerStatus, sameStory } from "@/contexts/publishing/domain/autosave";
import { insertBlock, LIVE_STARTER } from "@/contexts/publishing/domain/insert";
import { type LocalCopy, localDraft, shouldOfferRestore } from "@/contexts/publishing/domain/localDraft";
import { diffStats } from "@/contexts/publishing/domain/revision";
import { emptyStory, normTags, type StoryForm, storyFormSchema, storyToForm } from "@/contexts/publishing/domain/story";
import { type ImageResult, imageFiles, settlePlaceholder, shiftCaret, uploadImages } from "@/contexts/publishing/domain/uploadImages";
import { studioRepository } from "@/contexts/publishing/infrastructure/storyRepository";
import type { RichProblem } from "@/contexts/publishing/rich/markdown";
import type { RichHandle } from "@/contexts/publishing/rich/RichEditor";
import { StoryPreview } from "@/contexts/publishing/ui/StoryPreview";
import { postByIdQuery } from "@/contexts/reading/application/queries";
import { postPath, readTime } from "@/contexts/reading/domain/post";
import { ApiError, explainError } from "@/shared/http";
import { type MessageKey, useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { shortDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Galaxy } from "@/shared/ui/galaxy";
import { Lens, Modal } from "@/shared/ui/modal";
import { Bone } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";

// the visual editor (Tiptap, ProseMirror, marked) is its own chunk: it loads only when a story is opened in visual mode
const loadRichEditor = () => import("@/contexts/publishing/rich/RichEditor");
const loadRichMarkdown = () => import("@/contexts/publishing/rich/markdown");
const RichEditor = lazy(loadRichEditor);

const MODE_KEY = "iwillbegoogler.editor.mode";
const FOCUS_KEY = "iwillbegoogler.editor.focus";
const readPref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};

const MAX_COVER = 5 * 1024 * 1024;
const grow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

function TopicsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const next = normTags([...value, draft]);
    if (next.length > 5) return;
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-card p-2 focus-within:border-fg focus-within:shadow-[2px_2px_0_0_var(--fg)]">
      {value.map((t) => (
        <span key={t} className="tag">
          <span className="min-w-0 truncate">#{t}</span>
          <button
            type="button"
            aria-label={`Remove ${t}`}
            className="grid size-5 place-items-center rounded-[2px] hover:bg-inverse hover:text-on-inverse"
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            <XIcon className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {value.length < 5 ? (
        <input
          value={draft}
          aria-label="Add a topic"
          placeholder="Add a topic…"
          className="min-w-24 flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => setDraft(e.target.value.replace(",", ""))}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
        />
      ) : (
        <span className="self-center font-mono text-[11px] text-muted">Up to 5 topics</span>
      )}
      <span className="idx ml-auto self-center text-[11px]">{value.length}/5</span>
    </div>
  );
}

function PublishDialog({
  open,
  onOpenChange,
  form,
  onPublish,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: ReturnType<typeof useForm<StoryForm>>;
  onPublish: (when: "now" | "later") => void;
  pending: boolean;
}) {
  const { me } = useMe();
  const pubs = useQuery({ ...myPublicationsQuery(), enabled: open });
  const publicationId = useWatch({ control: form.control, name: "publicationId" });
  const publishAt = useWatch({ control: form.control, name: "publishAt" });
  const [later, setLater] = useState(!!publishAt);
  const cover = useWatch({ control: form.control, name: "coverUrl" });
  const tags = useWatch({ control: form.control, name: "tags" });
  const title = useWatch({ control: form.control, name: "title" });
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const step = "tile overflow-hidden";
  const stepHead = "tile-head";
  const stepBody = "p-3";
  const status = (done: boolean | "optional") => (
    <span className="ml-auto">
      <span aria-hidden>{done === true ? "✓" : "—"}</span>
      <span className="sr-only">{done === true ? "complete" : "optional"}</span>
    </span>
  );
  const timeOk = !later || (!!publishAt && !form.formState.errors.publishAt);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-[440px] overflow-y-auto border-l border-line-strong bg-card p-6 md:p-8">
          <Dialog.Close asChild>
            <Button variant="ghost-icon" aria-label="Close" className="absolute top-4 right-4">
              <XIcon aria-hidden />
            </Button>
          </Dialog.Close>
          <Dialog.Title className="font-display text-2xl font-extrabold tracking-[-0.02em]">Ready to ship</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">Check these before it goes live.</Dialog.Description>
          <ol className="mt-6 space-y-3">
            <li className={step}>
              <div className={stepHead}>
                <span className="idx text-fg">01</span>
                <h3>Cover</h3>
                {status(!!cover)}
              </div>
              <div className={stepBody}>
                <label
                  className={`flex aspect-[16/9] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-dashed border-line-strong p-6 text-center font-mono text-[12px] text-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${cover ? "" : "hatch"}`}
                >
                  {cover ? (
                    <img src={cover} alt="Cover" className="size-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="mb-2 size-6" aria-hidden />
                      {uploading ? "Uploading…" : "Drop a cover image (PNG, JPG, WebP, GIF · max 5 MB)"}
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > MAX_COVER) return setErr("Image must be 5 MB or smaller.");
                      setErr("");
                      setUploading(true);
                      try {
                        form.setValue("coverUrl", await engagementRepository.upload(f), { shouldDirty: true });
                      } catch (x) {
                        toast.error(x);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
                {cover ? (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => form.setValue("coverUrl", "", { shouldDirty: true })}>
                    Remove cover
                  </Button>
                ) : null}
                {err ? <p className="mt-2 font-mono text-[12px] text-danger">{err}</p> : null}
                <div aria-hidden className="mt-3 grid grid-cols-[1fr_auto] gap-3 border-t border-line pt-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-display text-[15px] leading-5 font-bold">{title || "Untitled"}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {me ? `@${me.username}` : ""}
                      {tags[0] ? ` · #${tags[0]}` : ""}
                    </p>
                  </div>
                  {cover ? <img src={cover} alt="" className="h-12 w-16 rounded-[var(--radius-xs)] border border-line object-cover grayscale" /> : null}
                </div>
              </div>
            </li>
            <li className={step}>
              <div className={stepHead}>
                <span className="idx text-fg">02</span>
                <h3>Topics</h3>
                {status(tags.length > 0)}
              </div>
              <div className={stepBody}>
                <p className="font-mono text-[11px] text-muted">Up to 5 topics.</p>
                <div className="mt-2">
                  <TopicsInput value={tags} onChange={(v) => form.setValue("tags", v, { shouldDirty: true })} />
                </div>
              </div>
            </li>
            <li className={step}>
              <div className={stepHead}>
                <span className="idx text-fg">03</span>
                <h3>Byline</h3>
                {status(true)}
              </div>
              <div className={stepBody}>
                <label className="block font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                  Post as
                  <select
                    className={cn(inputBoxCls, "mt-1 font-sans normal-case tracking-normal text-fg")}
                    value={publicationId}
                    onChange={(e) => form.setValue("publicationId", Number(e.target.value), { shouldDirty: true })}
                  >
                    <option value={0}>{me ? displayName(me) : "Your profile"}</option>
                    {pubs.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
            <li className={step}>
              <div className={stepHead}>
                <span className="idx text-fg">04</span>
                <h3>When</h3>
                {status(timeOk)}
              </div>
              <div className={stepBody}>
                <Lens
                  label="When to ship"
                  value={later ? "later" : "now"}
                  onChange={(v) => setLater(v === "later")}
                  items={[
                    ["now", "Now"],
                    ["later", "Schedule"],
                  ]}
                />
                {later ? (
                  <label className="mt-3 block font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                    Go live at
                    <input
                      type="datetime-local"
                      className={cn(inputBoxCls, "mt-1 font-sans normal-case tracking-normal text-fg")}
                      value={publishAt}
                      min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                      onChange={(e) => form.setValue("publishAt", e.target.value, { shouldDirty: true })}
                    />
                    {form.formState.errors.publishAt ? (
                      <span className="mt-1 block normal-case tracking-normal text-danger">{form.formState.errors.publishAt.message}</span>
                    ) : null}
                  </label>
                ) : null}
              </div>
            </li>
          </ol>
          <div className="sticky bottom-0 -mx-6 mt-8 border-t border-line-strong bg-card px-6 py-4 md:-mx-8 md:px-8">
            <Button variant="accent" className="w-full" loading={pending} disabled={later && !publishAt} onClick={() => onPublish(later ? "later" : "now")}>
              {later ? "Schedule" : "Ship now"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Revisions({
  id,
  open,
  onOpenChange,
  onRestored,
}: {
  id: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRestored: (p: import("@/contexts/reading/domain/post").Post) => void;
}) {
  const list = useQuery({ queryKey: ["revisions", id], queryFn: ({ signal }) => studioRepository.revisions(id, signal), enabled: open });
  const [v, setV] = useState<number | null>(null);
  const detail = useQuery({ queryKey: ["revisions", id, v], queryFn: ({ signal }) => studioRepository.revision(id, v as number, signal), enabled: v !== null });
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: (version: number) => studioRepository.restore(id, version),
    onSuccess: async () => {
      const p = await qc.fetchQuery({ ...postByIdQuery(id), staleTime: 0 });
      toast.ok("Version restored");
      onRestored(p);
    },
    onError: toast.error,
  });
  const ops = detail.data?.diff.body ?? [];
  const st = diffStats(ops);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Revision history" className="md:w-[720px]">
      {list.isPending ? (
        <Bone className="h-24 w-full" />
      ) : !list.data?.length ? (
        <p className="text-sm text-muted">No earlier versions yet. Every save that changes the text keeps the previous version here.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <ul className="space-y-1">
            {list.data.map((r) => (
              <li key={r.version}>
                <button
                  type="button"
                  onClick={() => setV(r.version)}
                  aria-current={v === r.version || undefined}
                  className="w-full rounded-[var(--radius-xs)] px-3 py-2 text-left font-mono text-[12px] hover:bg-surface-2 aria-[current=true]:bg-inverse aria-[current=true]:text-on-inverse"
                >
                  Version {r.version}
                  <span className="block text-[11px] opacity-70">{shortDate(r.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            {v === null ? (
              <p className="text-sm text-muted">Pick a version to compare with the current text.</p>
            ) : detail.isPending ? (
              <Bone className="h-40 w-full" />
            ) : (
              <>
                <p className="font-mono text-[11px] text-muted">
                  +{st.added} / −{st.removed} lines vs. now
                </p>
                <pre className="mt-2 max-h-80 overflow-auto rounded-[var(--radius-sm)] border border-line-strong bg-card py-2 font-mono text-xs whitespace-pre-wrap">
                  {ops
                    .map((o, n) => ({ ...o, line: n + 1 }))
                    .map((o) => (
                      <div
                        key={o.line}
                        className={cn(
                          "grid grid-cols-[2.5rem_1fr] pr-3",
                          o.op === "+" ? "bg-surface-2 font-medium" : o.op === "-" ? "text-muted line-through" : "",
                        )}
                      >
                        <span aria-hidden className="idx pr-2 text-right select-none">
                          {o.line}
                        </span>
                        <span>
                          {o.op === "=" ? " " : o.op} {o.text}
                        </span>
                      </div>
                    ))}
                </pre>
                <Button variant="outline" size="sm" className="mt-3" loading={restore.isPending} onClick={() => restore.mutate(v)}>
                  Restore this version
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

const toServerStatus = (s: string): ServerStatus => (s === "draft" ? "draft" : s === "scheduled" ? "scheduled" : "published");

export function EditorPage({ id: routeId }: { id?: number }) {
  // the id this editor opened with; the route's id changes once a new story is created, and nothing must reload then
  const [id] = useState(routeId);
  const nav = useNavigate();
  const existing = useQuery({ ...postByIdQuery(id ?? 0), enabled: !!id });
  const [postId, setPostId] = useState(id);
  const form = useForm<StoryForm>({ resolver: zodResolver(storyFormSchema), defaultValues: emptyStory() });
  // what the server holds; "unsaved" is values vs this, never the form's own dirty flag (a save must not reset typed text)
  const [saved, setSaved] = useState<StoryForm>(emptyStory);
  const [ready, setReady] = useState(!id);
  const [banner, setBanner] = useState<LocalCopy | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const [diagramPicker, setDiagramPicker] = useState(false);
  // why the visual editor's text is not exactly what the author sees (null: it is); while set, nothing is sent to the server on its own
  const [lossy, setLossy] = useState<RichProblem | null>(null);
  const t = useT();
  const { me } = useMe();
  const values = useWatch({ control: form.control }) as StoryForm;
  const body = values.body ?? "";
  const title = values.title ?? "";
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<{ start: number; end: number } | null>(null);
  const bodyField = form.register("body");
  const richRef = useRef<RichHandle | null>(null);
  // visual editing is the default; a story it cannot hold exactly opens in Markdown (`problem`) whatever was chosen
  const [wantRich, setWantRich] = useState(() => readPref(MODE_KEY) !== "md");
  const [problem, setProblem] = useState<RichProblem | null>(null);
  const [refused, setRefused] = useState<RichProblem | null>(null);
  const [checking, setChecking] = useState(!!id);
  const [epoch, setEpoch] = useState(0);
  const [focus, setFocus] = useState(() => readPref(FOCUS_KEY) === "1");
  const checkSeq = useRef(0);
  const mode: "rich" | "md" = wantRich && !problem ? "rich" : "md";
  const loaded = useRef(false);
  const leaving = useRef(false);

  const isPublished = existing.data?.status === "published";
  // a story loaded from the server is saved over only by the user's own action unless it is a draft
  const serverStatus: ServerStatus = !postId ? "new" : id ? (existing.data ? toServerStatus(existing.data.status) : "published") : "draft";

  /** Pending visual edits are written to the form first, so a save or a leave never misses the last keystrokes. */
  const getLatest = useCallback(() => {
    richRef.current?.flush();
    return form.getValues();
  }, [form]);

  /** New content arrived from outside the editor (load, restore, revision): is it safe to show visually? */
  const evaluate = useCallback(async (text: string) => {
    const seq = ++checkSeq.current;
    setLossy(null);
    if (readPref(MODE_KEY) === "md") {
      setProblem(null);
      setChecking(false);
      setEpoch((n) => n + 1);
      return;
    }
    setChecking(true);
    let p: RichProblem | null = null;
    try {
      const [m] = await Promise.all([loadRichMarkdown(), loadRichEditor()]);
      const r = m.canRoundTrip(text);
      p = r.ok ? null : r.problem;
    } catch {
      p = "error";
    }
    if (seq !== checkSeq.current) return;
    setRefused(null);
    setProblem(p);
    setEpoch((n) => n + 1);
    setChecking(false);
  }, []);

  const saver = useStorySaver({
    values,
    saved,
    setSaved,
    getLatest,
    postId,
    serverStatus,
    ready,
    paused: !!banner,
    hold: lossy !== null,
    releaseKey: me?.email_verified,
    onCreated: (p) => {
      setPostId(p.id);
      // same editor, new address: the route keeps this editor mounted, so the caret, the focus and the text stay
      adopted.id = p.id;
      leaving.current = true; // this move is not leaving: skip the unsaved-changes prompt
      void nav({ to: "/p/$id/edit", params: { id: String(p.id) }, replace: true }).finally(() => {
        leaving.current = false;
      });
    },
  });

  useEffect(() => {
    if (existing.data && !loaded.current) {
      loaded.current = true;
      const f = storyToForm(existing.data);
      form.reset(f);
      setSaved(f);
      setReady(true);
      void evaluate(f.body);
      const c = localDraft.read(id);
      if (shouldOfferRestore(c, { form: f, updatedAt: Date.parse(existing.data.updated_at) })) setBanner(c);
    }
  }, [existing.data, form, id, evaluate]);
  useEffect(() => {
    if (id) return;
    const c = localDraft.read(undefined);
    if (shouldOfferRestore(c, null)) setBanner(c);
  }, [id]);

  const restore = () => {
    if (!banner) return;
    form.reset({ ...banner.form, status: saved.status });
    setBanner(null);
    void evaluate(banner.form.body);
  };
  const discard = () => {
    localDraft.clear(postId);
    setBanner(null);
  };

  const st = saver.status;
  const chip =
    st.kind === "saving"
      ? t("editor.saving")
      : st.kind === "failed"
        ? t("editor.saveFailed")
        : st.kind === "local"
          ? t("editor.savedLocal")
          : st.kind === "saved" && !isPublished
            ? t("editor.savedAt", { time: clockTime(st.at ?? Date.now()) })
            : isPublished
              ? "Live"
              : ready && (id || postId)
                ? "Saved"
                : "Draft";
  const failedChip = st.kind === "failed";
  // why a save failed, in words; a refusal that waiting will not fix (not verified, signed out) stays on screen
  const failure = st.kind === "failed" ? saver.error : null;
  const notVerified = (failure instanceof ApiError && failure.code === "EMAIL_NOT_VERIFIED") || (!!me && !me.email_verified);
  const refusedText = failure ? explainError(failure, t).text : "";
  const permanent = failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 408 && failure.status !== 429;
  const resend = useMutation({
    mutationFn: accountSecurityRepository.resendVerification,
    onSuccess: () => toast.ok(t("editor.verify.sent")),
    onError: toast.error,
  });
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  // the form is read after flushing the visual editor: an edit typed a moment ago still counts
  const unsaved = () => !sameStory(getLatest(), saved);
  useBlocker({
    shouldBlockFn: () => !leaving.current && unsaved() && !confirm("You have unsaved changes. Leave anyway?"),
    enableBeforeUnload: () => unsaved(),
  });

  // Cmd/Ctrl+S saves now. It only ever saves a draft; published and scheduled stories keep a copy on this device until "Update".
  const saveNow = useRef(() => {});
  saveNow.current = () => {
    richRef.current?.flush();
    saver.flushLocal();
    if (banner || lossy || !canAutosave(serverStatus) || !saver.saveable()) return;
    saver.run(form.getValues(), "draft", "manual").catch(toast.error);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (s: "draft" | "published" | "scheduled") => {
    const target = isPublished && s === "draft" ? "published" : s;
    richRef.current?.flush();
    if (lossy) {
      toast.error(t("rich.lossy.saveBlocked"));
      setPublishing(false);
      return;
    }
    form.setValue("status", target);
    return form.handleSubmit(
      async (v) => {
        try {
          const p = await saver.run(v, target, "manual");
          if (!p) return;
          if (target === "scheduled") {
            leaving.current = true;
            toast.ok(`Scheduled for ${shortDate(v.publishAt)}`);
            void nav({ to: "/me/stories" });
          } else if (target === "published") {
            leaving.current = true;
            toast.ok(isPublished ? "Your story is updated" : "Your story is live");
            void nav({ to: postPath(p) as "/" });
          }
        } catch (e) {
          toast.error(e);
        }
      },
      (errs) => toast.error(Object.values(errs)[0]?.message ?? "Check the story"),
    )();
  };

  /** Visual or Markdown. Going visual re-checks the text as it is now, and is refused (with the reason) when the editor could not keep it exactly. */
  const chooseMode = async (to: "rich" | "md") => {
    if (to === "md") {
      richRef.current?.flush();
      setLossy(null);
      setWantRich(false);
      setRefused(null);
      writePref(MODE_KEY, "md");
      return;
    }
    if (mode === "rich") return;
    try {
      const [m] = await Promise.all([loadRichMarkdown(), loadRichEditor()]);
      const r = m.canRoundTrip(form.getValues("body") ?? "");
      if (!r.ok) {
        setRefused(r.problem);
        setProblem(r.problem);
        setWantRich(true);
        return;
      }
    } catch {
      setRefused("error");
      setProblem("error");
      setWantRich(true);
      return;
    }
    setRefused(null);
    setProblem(null);
    setWantRich(true);
    setEpoch((n) => n + 1);
    writePref(MODE_KEY, "rich");
  };

  /** Pasted or dropped images: a placeholder at the caret now, the real link when the upload lands. */
  const addImages = (files: File[]) => {
    const el = bodyRef.current;
    let at = el ? { start: el.selectionStart, end: el.selectionEnd } : null;
    const setBody = (next: string, caretAt?: number) => {
      form.setValue("body", next, { shouldDirty: true });
      if (el && caretAt !== undefined && document.activeElement === el) requestAnimationFrame(() => el.setSelectionRange(caretAt, caretAt));
    };
    void uploadImages(files, engagementRepository.upload, {
      place: (_id, ph) => {
        const next = insertBlock(form.getValues("body") ?? "", ph, at);
        const end = next.indexOf(ph) + ph.length;
        at = { start: end, end };
        setBody(next, end + 2);
      },
      settle: (uid, md) => {
        const cur = form.getValues("body") ?? "";
        const next = settlePlaceholder(cur, uid, md);
        if (next === cur) return;
        const ph = `![Uploading…](#upload-${uid})`;
        const idx = cur.indexOf(ph);
        const pos = el?.selectionStart ?? cur.length;
        setBody(next, shiftCaret(pos, idx, ph.length, md === null ? 0 : md.length));
      },
    }).then((results) => {
      const names = (p: ImageResult["problem"]) =>
        results
          .filter((r) => r.problem === p)
          .map((r) => r.file.name || "image")
          .join(", ");
      if (names("type")) toast.error(t("editor.img.type", { names: names("type") }));
      if (names("size")) toast.error(t("editor.img.size", { names: names("size") }));
      if (names("failed")) toast.error(t("editor.img.failed", { names: names("failed") }));
    });
  };

  return (
    <div className="min-h-dvh" data-focus-mode={focus || undefined}>
      <Galaxy planet={false} still />
      <header className="focus-dim sticky top-0 z-40 border-b sm:h-12 border-line-strong bg-card">
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-x-2 px-4 max-sm:py-1.5 max-sm:gap-y-1.5 sm:h-full sm:flex-nowrap sm:gap-3">
          <Link
            to="/me/stories"
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px] tracking-[0.12em] text-muted uppercase hover:text-fg"
          >
            <ArrowLeftIcon className="size-4" aria-hidden /> <span className="max-sm:sr-only">{t("editor.stories")}</span>
          </Link>
          <span
            title={chip}
            className={cn(
              "inline-flex h-7 min-w-0 shrink-0 overflow-hidden whitespace-nowrap max-sm:max-w-24 max-sm:shrink divide-x divide-line rounded-[var(--radius-xs)] border border-line-strong font-mono text-[11px] text-muted uppercase [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:px-2",
              failedChip && "border-danger",
            )}
          >
            <span aria-live="polite" className={failedChip ? "text-danger" : undefined}>
              {st.kind === "saved" || chip === "Saved" || chip === "Live" ? <span aria-hidden className="size-1.5 bg-fg" /> : null}
              {st.kind === "saving" ? <span aria-hidden className="size-1.5 animate-pulse bg-fg" /> : null}
              {chip}
            </span>
            <span className="hidden! sm:flex!">{words} words</span>
            <span className="hidden! sm:flex!">{readTime(Math.ceil(words / 200))}</span>
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3 overflow-x-auto max-sm:order-last max-sm:basis-full max-sm:justify-start [&>*]:shrink-0">
            {postId ? (
              <Button variant="ghost-icon" aria-label="Revision history" onClick={() => setHistory(true)}>
                <HistoryIcon aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const el = mode === "md" ? bodyRef.current : null;
                caret.current = el ? { start: el.selectionStart, end: el.selectionEnd } : null;
                setDiagramPicker(true);
              }}
              aria-haspopup="dialog"
            >
              <ShapesIcon className="size-3.5" aria-hidden /> {t("dg.insert")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (mode === "rich" && !preview) return richRef.current?.insertLive();
                const el = bodyRef.current;
                const sel = el ? { start: el.selectionStart, end: el.selectionEnd } : null;
                form.setValue("body", insertBlock(form.getValues("body") ?? "", LIVE_STARTER, sel), { shouldDirty: true });
              }}
            >
              <SparklesIcon className="size-3.5" aria-hidden /> {t("live.insert")}
            </Button>
            <span className="seg">
              <button
                type="button"
                className="seg-item h-7"
                onClick={() => {
                  richRef.current?.flush();
                  setPreview(!preview);
                }}
                aria-pressed={preview}
              >
                {preview ? t("editor.edit") : t("editor.preview")}
              </button>
            </span>
          </div>
          {/* outside the row that scrolls sideways: Save and publish are always in reach */}
          <div className="flex shrink-0 items-center gap-2 max-sm:ml-auto">
            {!isPublished ? (
              <Button variant="outline" size="sm" disabled={!title.trim()} loading={saver.saving && !publishing} onClick={() => submit("draft")}>
                <SaveIcon className="size-3.5 sm:hidden" aria-hidden />
                <span className="max-sm:sr-only">{t("editor.saveDraft")}</span>
              </Button>
            ) : null}
            <Button variant="accent" size="sm" disabled={!title.trim() || !body.trim()} onClick={() => setPublishing(true)}>
              {isPublished ? t("editor.update") : t("editor.ship")}
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1040px] gap-8 px-4">
        <p
          aria-hidden
          className="focus-hide sticky top-20 hidden h-fit w-20 shrink-0 space-y-2 pt-12 font-mono text-[10.5px] tracking-[0.1em] text-muted uppercase lg:block"
        >
          <span className="block">01 Title</span>
          <span className="block">02 Dek</span>
          <span className="block">03 Body</span>
        </p>
        <main id="main" className="reading-glass mx-auto w-full max-w-feed min-w-0 px-4 pt-10 pb-24">
          {banner ? (
            <section
              aria-label={t("editor.restore.title")}
              className="tile sticky top-14 z-30 mb-6 max-sm:top-24 flex flex-wrap items-center gap-3 bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t("editor.restore.title")}</p>
                <p className="font-mono text-[11px] text-muted">{t("editor.restore.body")}</p>
              </div>
              <Button variant="accent" size="sm" onClick={restore}>
                {t("editor.restore.yes")}
              </Button>
              <Button variant="ghost" size="sm" onClick={discard}>
                {t("editor.restore.no")}
              </Button>
            </section>
          ) : null}
          {notVerified || (failure && permanent) ? (
            <section role="status" className="mb-6 flex flex-wrap items-center gap-3 border-l-[3px] border-fg pl-3 text-sm" data-testid="save-notice">
              <p className="min-w-0 flex-1">{notVerified ? t("editor.verify.needed") : `${refusedText} ${t("editor.keptLocal")}`}</p>
              {notVerified ? (
                <Button variant="outline" size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                  {t("editor.verify.resend")}
                </Button>
              ) : null}
            </section>
          ) : null}
          <textarea
            rows={1}
            aria-label="Title"
            placeholder={t("editor.titlePh")}
            className="w-full resize-none overflow-hidden bg-transparent font-display text-[40px] leading-[48px] font-bold tracking-tight outline-none placeholder:text-muted/60"
            {...form.register("title", { onChange: (e) => grow(e.target) })}
          />
          <textarea
            rows={1}
            aria-label="Subtitle"
            placeholder={t("editor.subtitlePh")}
            className="mt-2 w-full resize-none overflow-hidden bg-transparent font-sans text-[22px] leading-8 text-muted outline-none placeholder:text-muted/60"
            {...form.register("subtitle", { onChange: (e) => grow(e.target) })}
          />
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="seg" role="group" aria-label={t("rich.mode.label")}>
              <button type="button" className="seg-item h-7" aria-pressed={mode === "rich"} onClick={() => void chooseMode("rich")}>
                {t("rich.mode.visual")}
              </button>
              <button type="button" className="seg-item h-7" aria-pressed={mode === "md"} onClick={() => void chooseMode("md")}>
                {t("rich.mode.md")}
              </button>
            </span>
            <button
              type="button"
              className="seg-item ml-auto inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-xs)] border border-line-strong px-2 font-mono text-[11px] uppercase aria-pressed:bg-inverse aria-pressed:text-on-inverse"
              aria-pressed={focus}
              onClick={() => {
                setFocus(!focus);
                writePref(FOCUS_KEY, focus ? "0" : "1");
              }}
            >
              <MaximizeIcon className="size-3.5" aria-hidden /> {t("rich.focus")}
            </button>
          </div>
          {problem && wantRich ? (
            <p role={refused ? "alert" : "status"} className="mt-3 border-l-[3px] border-fg pl-3 text-sm text-muted">
              {t(refused ? "rich.md.refuse" : "rich.md.notice", { why: t(`rich.why.${problem}` as MessageKey) })}
            </p>
          ) : null}
          {lossy && mode === "rich" ? (
            <section role="status" className="mt-3 flex flex-wrap items-center gap-3 border-l-[3px] border-danger pl-3 text-sm" data-testid="lossy-notice">
              <p className="min-w-0 flex-1">{t("rich.lossy.notice", { why: t(`rich.why.${lossy}` as MessageKey) })}</p>
              <Button variant="outline" size="sm" onClick={() => void chooseMode("md")}>
                {t("rich.lossy.open")}
              </Button>
            </section>
          ) : null}
          {preview ? <StoryPreview body={body} /> : null}
          {mode === "rich" ? (
            checking || !ready ? (
              <Bone className="mt-6 h-64 w-full" />
            ) : (
              <div hidden={preview}>
                <Suspense fallback={<Bone className="mt-6 h-64 w-full" />}>
                  <RichEditor
                    ref={richRef}
                    value={body}
                    epoch={epoch}
                    onChange={(md) => form.setValue("body", md, { shouldDirty: true })}
                    onLossy={setLossy}
                    onDiagram={() => setDiagramPicker(true)}
                  />
                </Suspense>
              </div>
            )
          ) : preview ? null : (
            <textarea
              aria-label="Story body (Markdown)"
              placeholder="Start writing — Markdown supported"
              className="mt-6 min-h-[60vh] w-full resize-none bg-transparent font-mono text-[16px] leading-7 outline-none placeholder:text-muted/60"
              {...bodyField}
              onPaste={(e) => {
                const files = imageFiles(e.clipboardData.files);
                if (!files.length) return; // plain text pastes as usual
                e.preventDefault();
                addImages(files);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) e.preventDefault();
              }}
              onDrop={(e) => {
                const files = imageFiles(e.dataTransfer.files);
                if (!files.length) return;
                e.preventDefault();
                addImages(files);
              }}
              ref={(el) => {
                bodyField.ref(el);
                bodyRef.current = el;
              }}
            />
          )}
          {mode === "md" ? (
            <p className="focus-hide mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
              Markdown:
              {["**bold**", "_italic_", "# heading", "> quote", "``` code", "[link](url)"].map((k) => (
                <kbd key={k} className="kbd">
                  {k}
                </kbd>
              ))}
            </p>
          ) : null}
        </main>
      </div>
      <DiagramPicker
        open={diagramPicker}
        onOpenChange={setDiagramPicker}
        onPick={(line) => {
          if (mode === "rich") return richRef.current?.insertDiagram(line);
          const cur = form.getValues("body") ?? "";
          form.setValue("body", insertBlock(cur, line, caret.current), { shouldDirty: true });
          caret.current = null;
        }}
      />
      <PublishDialog
        open={publishing}
        onOpenChange={setPublishing}
        form={form}
        pending={saver.saving}
        onPublish={(when) => submit(when === "later" ? "scheduled" : "published")}
      />
      {postId ? (
        <Revisions
          id={postId}
          open={history}
          onOpenChange={setHistory}
          onRestored={(p) => {
            const f = storyToForm(p);
            form.reset(f);
            setSaved(f);
            setHistory(false);
            void evaluate(f.body);
          }}
        />
      ) : null}
    </div>
  );
}
