import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { safeHtml } from "@/contexts/reading/domain/sanitize";
import { ArticleBody } from "@/contexts/reading/ui/ArticleBody";
import { useT } from "@/shared/i18n";
import { previewBody } from "../infrastructure/storyRepository";

const DEBOUNCE_MS = 500;

/** The story as readers get it: the server renders the Markdown, the client sanitizes it and swaps live blocks for sandboxed frames. */
export function StoryPreview({ body }: { body: string }) {
  const t = useT();
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
          <ArticleBody html={safeHtml(q.data)} />
        ) : (
          <p className="text-muted">{t("editor.preview.loading")}</p>
        )}
      </div>
    </section>
  );
}
