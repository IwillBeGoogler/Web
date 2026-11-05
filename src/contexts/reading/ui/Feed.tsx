import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertCircleIcon, type LucideIcon, NewspaperIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { EmptyState, Loading, PostCardSkeleton } from "@/shared/ui/states";
import { FEED_PAGE_SIZE, feedQuery } from "../application/queries";
import type { FeedSource } from "../infrastructure/readingRepository";
import { PostCard } from "./PostCard";

/** Infinite list of PostCards; loads the next page when the end scrolls into view. */
export function Feed({
  source,
  empty,
}: {
  source: FeedSource;
  empty?: { icon?: LucideIcon; code?: string; title: string; body?: string; action?: ReactNode };
}) {
  const q = useInfiniteQuery(feedQuery(source));
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = end.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isPending)
    return (
      <Loading>
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </Loading>
    );
  if (q.isError)
    return (
      <EmptyState
        icon={AlertCircleIcon}
        code="err · fetch failed"
        title="Something went wrong loading stories."
        action={
          <Button variant="outline" onClick={() => q.refetch()}>
            Try again
          </Button>
        }
      />
    );
  const posts = q.data.pages.flatMap((p) => p.items);
  if (!posts.length)
    return (
      <EmptyState icon={empty?.icon ?? NewspaperIcon} code={empty?.code} title={empty?.title ?? "No stories yet."} body={empty?.body} action={empty?.action} />
    );
  return (
    <div>
      <ol className="grid gap-3" aria-label="Stories">
        {posts.map((p, i) => (
          <li key={p.id}>
            <PostCard post={p} index={i} />
          </li>
        ))}
      </ol>
      <div ref={end} />
      {hasNextPage ? (
        <div className="py-6 text-center">
          <Button variant="outline" size="sm" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Show more
            <span className="idx text-[11px] text-current" aria-hidden>
              +{FEED_PAGE_SIZE}
            </span>
          </Button>
        </div>
      ) : (
        <p className="mt-6 flex items-center gap-3 py-4 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          <span aria-hidden className="h-px flex-1 bg-line" />
          EOF · {posts.length} loaded
          <span aria-hidden className="h-px flex-1 bg-line" />
        </p>
      )}
    </div>
  );
}
