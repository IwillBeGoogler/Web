import { Link } from "@tanstack/react-router";
import { cn } from "@/shared/lib/cn";
import { compact } from "@/shared/lib/format";

/** Bracketed hash tags with optional count wells. */
export function TopicChips({ tags, current, wrap, counts }: { tags: string[]; current?: string | undefined; wrap?: boolean; counts?: Record<string, number> }) {
  if (!tags.length) return null;
  return (
    <nav
      aria-label="Topics"
      className={cn(
        "relative",
        !wrap && "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-surface",
      )}
    >
      <ul className={cn("flex gap-2 py-3 [scrollbar-width:none]", wrap ? "flex-wrap" : "snap-x overflow-x-auto")}>
        {tags.map((t) => {
          const n = counts?.[t];
          return (
            <li key={t} className="shrink-0 snap-start">
              <Link to="/tag/$tag" params={{ tag: t }} className="tag" aria-current={t === current ? "page" : undefined}>
                <span className="min-w-0 truncate">
                  <span className="text-muted" aria-hidden>
                    #
                  </span>
                  {t}
                </span>
                {n ? (
                  <span className="tag-count">
                    {compact(n)}
                    <span className="sr-only"> stories</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
