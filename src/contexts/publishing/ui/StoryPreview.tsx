import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { glossaryQuery } from "@/contexts/reading/application/queries";
import { mergeTerms } from "@/contexts/reading/domain/glossary";
import { safeHtml } from "@/contexts/reading/domain/sanitize";
import { ArticleBody } from "@/contexts/reading/ui/ArticleBody";
import { useLang, useT } from "@/shared/i18n";
import type { GlossaryEntry } from "../domain/glossary";
import { previewBody } from "../infrastructure/storyRepository";

const DEBOUNCE_MS = 500;
/** Stable default, so the terms are not rebuilt (and the preview re-marked) on every render. */
const NO_TERMS: readonly GlossaryEntry[] = [];

/**
 * The story as readers get it: the server renders the Markdown, the client sanitizes it and swaps live blocks for sandboxed frames.
 * Glossary terms (the story's own, then the site's for the UI language) are underlined with tooltips, as on the article page.
 */
export function StoryPreview({ body, glossary = NO_TERMS }: { body: string; glossary?: readonly GlossaryEntry[] }) {
  const t = useT();
  const lang = useLang();
  const [settled, setSettled] = useState(body);
  useEffect(() => {
    const id = setTimeout(() => setSettled(body), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [body]);
  const empty = !settled.trim();
  const q = useQuery({
    queryKey: ["preview", settled],
    queryFn: ({ signal }) => previewBody(settled, signal),
    enabled: !empty,
    staleTime: 60_000,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const site = useQuery({ ...glossaryQuery(lang), enabled: !empty });
  const terms = useMemo(() => mergeTerms(glossary, site.data ?? []), [glossary, site.data]);
  return (
    <section className="tile mt-6 overflow-hidden" aria-label="Preview" aria-busy={q.isFetching}>
      <p className="tile-head">{t("editor.preview.head")}</p>
      <div className="min-h-[60vh] p-5">
        {empty ? (
          <p className="text-muted">{t("editor.preview.empty")}</p>
        ) : q.isError && !q.data ? (
          <p role="alert" className="text-danger">
            {t("editor.preview.error")}
          </p>
        ) : q.data !== undefined ? (
          <ArticleBody html={safeHtml(q.data)} terms={terms} />
        ) : (
          <p className="text-muted">{t("editor.preview.loading")}</p>
        )}
      </div>
    </section>
  );
}
