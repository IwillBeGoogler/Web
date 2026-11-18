import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useState } from "react";
import { deleteTranslation, previewBody, saveTranslation } from "@/contexts/publishing/infrastructure/storyRepository";
import type { RichProblem } from "@/contexts/publishing/rich/markdown";
import { postByIdQuery, translationQuery } from "@/contexts/reading/application/queries";
import { postPath } from "@/contexts/reading/domain/post";
import { safeHtml } from "@/contexts/reading/domain/sanitize";
import { reportError } from "@/shared/errorReporting";
import { isApiError } from "@/shared/http";
import { LANGS } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Bone, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";

// the visual editor is its own chunk, as in the story editor
const RichEditor = lazy(() => import("@/contexts/publishing/rich/RichEditor"));
type Mode = "rich" | "md";
const MODE_KEY = "translate-mode";
const readMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === "md" ? "md" : "rich";
  } catch {
    return "rich";
  }
};

/** A crash in the visual editor falls back to Markdown instead of the error screen. */
class RichGuard extends Component<{ onFail: (e: unknown) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.onFail(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// field-sizing: content grows each box with its text, also when a stored translation loads
const bare = "block w-full resize-none overflow-hidden bg-transparent outline-none [field-sizing:content] placeholder:text-muted/60 disabled:opacity-60";

/** Write, edit or remove one translation of a story, next to its original text. */
export function TranslatePage({ id, lang: wanted }: { id: number; lang?: string | undefined }) {
  const qc = useQueryClient();
  const postQ = useQuery(postByIdQuery(id));
  const post = postQ.data;
  const options = LANGS.filter((l) => l.id !== post?.lang);
  const [pick, setPick] = useState<string | undefined>(wanted);
  const lang = options.find((o) => o.id === pick)?.id ?? options.find((o) => !post?.languages.includes(o.id))?.id ?? options[0]?.id ?? "";
  const exists = !!post?.languages.includes(lang);
  const trQ = useQuery({ ...translationQuery(id, lang), enabled: !!post && !!lang && exists });
  const [form, setForm] = useState({ title: "", subtitle: "", body: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  // bumped whenever the body is replaced from outside, so the visual editor reloads instead of treating it as an echo
  const [epoch, setEpoch] = useState(0);
  const [lossy, setLossy] = useState<RichProblem | null>(null);
  const setMode = (m: Mode) => {
    setModeState(m);
    setLossy(null);
    setEpoch((n) => n + 1);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // per-viewer convenience only
    }
  };
  const load = (f: { title: string; subtitle: string; body: string }) => {
    setForm(f);
    setEpoch((n) => n + 1);
  };

  // load the stored translation (or an empty form) whenever the language changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on language switch and on first load only
  useEffect(() => {
    if (!exists) load({ title: "", subtitle: "", body: "" });
    else if (trQ.data) load({ title: trQ.data.title, subtitle: trQ.data.subtitle, body: trQ.data.body });
    setConfirmDelete(false);
    setPreview(null);
  }, [lang, exists, trQ.data]);

  const refresh = () => {
    if (post) void qc.invalidateQueries({ queryKey: ["post", post.slug] });
    void qc.invalidateQueries({ queryKey: ["post-id", id] });
    void qc.invalidateQueries({ queryKey: ["post-translation", id, lang] });
  };
  const save = useMutation({
    mutationFn: () => saveTranslation(id, lang, form),
    onSuccess: () => {
      toast.ok("Translation saved");
      refresh();
    },
    onError: toast.error,
  });
  const del = useMutation({
    mutationFn: () => deleteTranslation(id, lang),
    onSuccess: () => {
      toast.ok("Translation deleted");
      setConfirmDelete(false);
      refresh();
    },
    onError: toast.error,
  });
  const prev = useMutation({ mutationFn: () => previewBody(form.body), onSuccess: setPreview, onError: toast.error });

  if (postQ.isPending) return <Loading>Loading…</Loading>;
  if (postQ.isError || !post) {
    return (
      <main id="main" className="mx-auto max-w-feed px-4 py-12 md:px-6">
        <p>{isApiError(postQ.error) && postQ.error.isForbidden ? "You don't have access to this story." : "This story doesn't exist or was removed."}</p>
      </main>
    );
  }
  const loadingExisting = exists && trQ.isPending;
  const canSave = !!form.title.trim() && !loadingExisting && !save.isPending && !(mode === "rich" && lossy);
  const empty = !form.title && !form.subtitle && !form.body;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (canSave) save.mutate();
    }
  };
  const field = (k: "title" | "subtitle" | "body") => ({
    value: form[k],
    disabled: loadingExisting,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });
  return (
    <main id="main" className="mx-auto max-w-[1600px] px-4 pb-12 md:px-6" onKeyDown={onKeyDown}>
      <header className="glass sticky top-14 z-30 -mx-4 mt-4 flex flex-wrap items-center gap-3 px-4 py-3 md:-mx-6 md:px-6">
        <Link to={postPath(post)} aria-label="Back to story" className="grid size-8 place-items-center text-muted hover:text-fg">
          <ArrowLeftIcon className="size-4" aria-hidden />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-[-0.03em]">Translate</h1>
        <span className="font-mono text-[11px] text-muted uppercase">{post.lang} →</span>
        <div role="group" aria-label="Translation language" className="seg">
          {options.map((o) => (
            <button key={o.id} type="button" aria-pressed={o.id === lang} onClick={() => setPick(o.id)} className="seg-item h-7 px-2.5">
              {o.id}
              {post.languages.includes(o.id) ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Editor mode" className="seg">
          <button type="button" aria-pressed={mode === "rich"} onClick={() => setMode("rich")} className="seg-item h-7 px-2.5">
            Visual
          </button>
          <button type="button" aria-pressed={mode === "md"} onClick={() => setMode("md")} className="seg-item h-7 px-2.5">
            Markdown
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {exists ? (
            confirmDelete ? (
              <>
                <span className="text-sm">Delete this translation?</span>
                <Button variant="outline" size="sm" loading={del.isPending} onClick={() => del.mutate()}>
                  Yes, delete
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete translation
              </Button>
            )
          ) : null}
          <Button variant="outline" size="sm" loading={prev.isPending} onClick={() => (preview === null ? prev.mutate() : setPreview(null))}>
            {preview === null ? "Preview" : "Hide preview"}
          </Button>
          <Button size="sm" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()} title="Save (⌘S / Ctrl+S)">
            Save
          </Button>
        </div>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label={`Original (${post.lang})`} className="reading-glass min-w-0 rounded-[var(--radius-md)] px-4 py-6 md:px-6">
          <p className="kicker mb-3">Original · {post.lang}</p>
          <h2 className="font-display text-[32px] leading-10 font-bold tracking-tight">{post.title}</h2>
          {post.subtitle ? <p className="mt-2 font-sans text-[20px] leading-7 text-muted">{post.subtitle}</p> : null}
          {post.body_html ? (
            <div className="prose-article mt-6">
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered and sanitized, then sanitized again */}
              <div dangerouslySetInnerHTML={{ __html: safeHtml(post.body_html) }} />
            </div>
          ) : (
            <pre className="mt-6 font-mono text-[14px] leading-6 whitespace-pre-wrap">{post.body}</pre>
          )}
        </section>
        <section aria-label={`Translation (${lang})`} className="reading-glass min-w-0 rounded-[var(--radius-md)] px-4 py-6 md:px-6">
          <div className="mb-3 flex items-center gap-2">
            <p className="kicker">Translation · {lang}</p>
            {empty && !loadingExisting ? (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => load({ title: post.title, subtitle: post.subtitle, body: post.body })}>
                Start from original
              </Button>
            ) : null}
          </div>
          {preview !== null ? (
            <div className="prose-article">
              <h2>{form.title}</h2>
              {form.subtitle ? <p className="text-muted">{form.subtitle}</p> : null}
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered and sanitized, then sanitized again */}
              <div dangerouslySetInnerHTML={{ __html: safeHtml(preview) }} />
            </div>
          ) : (
            <>
              <textarea
                rows={1}
                aria-label="Title"
                placeholder="Title"
                maxLength={200}
                className={cn(bare, "font-display text-[32px] leading-10 font-bold tracking-tight")}
                {...field("title")}
              />
              <textarea
                rows={1}
                aria-label="Subtitle"
                placeholder="Subtitle"
                maxLength={300}
                className={cn(bare, "mt-2 font-sans text-[20px] leading-7 text-muted")}
                {...field("subtitle")}
              />
              {mode === "rich" && !loadingExisting ? (
                <div className="mt-6">
                  {lossy ? (
                    <p role="status" className="mb-3 border-l-[3px] border-danger pl-3 text-sm">
                      Visual mode can't keep part of this text exactly. Switch to Markdown to save it.
                    </p>
                  ) : null}
                  <RichGuard
                    onFail={(e) => {
                      reportError(e);
                      toast.error("The visual editor crashed; opened in Markdown.");
                      setMode("md");
                    }}
                  >
                    <Suspense fallback={<Bone className="h-64 w-full" />}>
                      <RichEditor
                        value={form.body}
                        epoch={epoch}
                        onChange={(md) => setForm((f) => ({ ...f, body: md }))}
                        onLossy={setLossy}
                        onDiagram={() => toast.error("Add diagrams in the original story; they carry over in Markdown.")}
                      />
                    </Suspense>
                  </RichGuard>
                </div>
              ) : (
                <textarea
                  aria-label="Body (Markdown)"
                  placeholder="Translate the story — Markdown supported"
                  className={cn(bare, "mt-6 min-h-[60vh] font-mono text-[14px] leading-6")}
                  {...field("body")}
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
