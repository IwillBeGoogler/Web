import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteTranslation, previewBody, saveTranslation } from "@/contexts/publishing/infrastructure/storyRepository";
import { postByIdQuery, translationQuery } from "@/contexts/reading/application/queries";
import { postPath } from "@/contexts/reading/domain/post";
import { safeHtml } from "@/contexts/reading/domain/sanitize";
import { isApiError } from "@/shared/http";
import { LANGS } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";

const areaCls = cn(inputBoxCls, "h-auto min-h-[28rem] py-2 font-mono text-[13px] leading-5");

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

  // load the stored translation (or an empty form) whenever the language changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on language switch and on first load only
  useEffect(() => {
    if (!exists) setForm({ title: "", subtitle: "", body: "" });
    else if (trQ.data) setForm({ title: trQ.data.title, subtitle: trQ.data.subtitle, body: trQ.data.body });
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
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <Link to={postPath(post)} className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] text-muted uppercase hover:text-fg">
        <ArrowLeftIcon className="size-3" aria-hidden /> Back to story
      </Link>
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.03em]">Translate</h1>
      <div
        role="group"
        aria-label="Translation language"
        className="mt-4 inline-flex divide-x divide-line-strong overflow-hidden rounded-[var(--radius-sm)] border border-line-strong font-mono text-[11px] tracking-[0.12em] uppercase"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === lang}
            onClick={() => setPick(o.id)}
            className={cn("px-3 py-1.5", o.id === lang ? "bg-fg text-bg" : "text-muted hover:text-fg")}
          >
            {o.id}
            {post.languages.includes(o.id) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section aria-label={`Original (${post.lang})`} className="min-w-0">
          <p className="kicker mb-2">Original · {post.lang}</p>
          <pre className="font-mono text-[13px] font-bold whitespace-pre-wrap">{post.title}</pre>
          {post.subtitle ? <pre className="mt-2 font-mono text-[13px] whitespace-pre-wrap text-muted">{post.subtitle}</pre> : null}
          <pre className="mt-4 font-mono text-[13px] leading-5 whitespace-pre-wrap">{post.body}</pre>
        </section>
        <section aria-label={`Translation (${lang})`} className="min-w-0 space-y-3">
          <p className="kicker">Translation · {lang}</p>
          <label className="block">
            <span className="kicker">Title</span>
            <input
              className={cn(inputBoxCls, "mt-1")}
              value={form.title}
              maxLength={200}
              disabled={loadingExisting}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="kicker">Subtitle</span>
            <input
              className={cn(inputBoxCls, "mt-1")}
              value={form.subtitle}
              maxLength={300}
              disabled={loadingExisting}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="kicker">Body (Markdown)</span>
            <textarea
              className={cn(areaCls, "mt-1")}
              value={form.body}
              disabled={loadingExisting}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={save.isPending} disabled={!form.title.trim() || loadingExisting} onClick={() => save.mutate()}>
              Save
            </Button>
            <Button variant="outline" loading={prev.isPending} onClick={() => (preview === null ? prev.mutate() : setPreview(null))}>
              {preview === null ? "Preview" : "Hide preview"}
            </Button>
            {exists ? (
              confirmDelete ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm">Delete this translation?</span>
                  <Button variant="outline" size="sm" loading={del.isPending} onClick={() => del.mutate()}>
                    Yes, delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  Delete translation
                </Button>
              )
            ) : null}
          </div>
          {preview !== null ? (
            <div className="prose-article rounded-[var(--radius-md)] border border-line-strong p-4">
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered and sanitized, then sanitized again */}
              <div dangerouslySetInnerHTML={{ __html: safeHtml(preview) }} />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
