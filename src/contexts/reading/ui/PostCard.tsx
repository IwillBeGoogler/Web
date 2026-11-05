import { Link } from "@tanstack/react-router";
import { MessageSquareIcon, ZapIcon } from "lucide-react";
import { BookmarkButton } from "@/contexts/engagement/ui/actions";
import { PostMenu } from "@/contexts/engagement/ui/PostMenu";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { cn } from "@/shared/lib/cn";
import { compact, shortDate } from "@/shared/lib/format";
import { Reveal } from "@/shared/motion";
import { excerpt, type Post, postPath, readTime } from "../domain/post";

const stat = "key h-7 cursor-default px-2 hover:bg-transparent hover:text-muted";

/** Bento tile: mono header strip, split (cover) or hatched text-only body, action strip. */
export function PostCard({ post, index }: { post: Post; index?: number }) {
  const href = postPath(post);
  const text = post.subtitle || excerpt(post.body, 180);
  const at = post.published_at ?? post.created_at;
  const cover = !!post.cover_url;
  const byline = post.author ? (
    post.user_id ? (
      <Link to="/@{$username}" params={{ username: post.author }} className="block max-w-full truncate font-mono text-[12px] text-muted hover:text-fg">
        @{post.author}
      </Link>
    ) : (
      <span className="block max-w-full truncate font-mono text-[12px] text-muted">@{post.author}</span>
    )
  ) : null;
  return (
    <Reveal as="div" y={10}>
      <article className="tile tile-hover group relative overflow-hidden">
        <header className="tile-head">
          {index !== undefined ? <span className="idx text-fg">{String(index + 1).padStart(2, "0")}</span> : null}
          {post.tags[0] ? <span className="min-w-0 truncate">#{post.tags[0]}</span> : <span>Story</span>}
          <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
            <time dateTime={at}>{shortDate(at)}</time>
            <span aria-hidden>·</span>
            <span>{readTime(post.reading_time)}</span>
          </span>
        </header>
        <div className={cn("grid", cover && "sm:grid-cols-[1fr_11rem]")}>
          <div
            className={cn(
              "min-w-0 p-4 md:p-5",
              !cover && "border-l-[6px] border-l-transparent [border-image:repeating-linear-gradient(-45deg,var(--line)_0_4px,transparent_4px_8px)_1]",
            )}
          >
            <a href={href} className="block after:absolute after:inset-0 after:z-0">
              <h2 className="line-clamp-3 font-display text-[19px] leading-6 font-bold tracking-[-0.02em] md:line-clamp-2 md:text-[22px] md:leading-7">
                <Bio>{post.title}</Bio>
              </h2>
              {text ? (
                <p className="mt-2 line-clamp-2 text-[14px] leading-[22px] text-muted">
                  <Bio>{text}</Bio>
                </p>
              ) : null}
            </a>
            {byline ? <div className="relative z-10 mt-3 w-fit max-w-full">{byline}</div> : null}
          </div>
          {cover ? (
            <div
              data-cover
              className="relative order-first aspect-[16/9] border-b border-line bg-surface-2 sm:order-none sm:aspect-auto sm:border-b-0 sm:border-l"
            >
              <img
                src={post.cover_url}
                alt=""
                loading="lazy"
                width={176}
                height={132}
                onError={(e) => {
                  const cell = e.currentTarget.closest("[data-cover]") as HTMLElement | null;
                  if (cell) cell.hidden = true;
                }}
                className="absolute inset-0 size-full object-cover contrast-[1.05] grayscale"
              />
            </div>
          ) : null}
        </div>
        <footer className="relative z-10 flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5">
          {post.tags.slice(0, 2).map((t) => (
            <Link key={t} to="/tag/$tag" params={{ tag: t }} className="tag">
              <span className="truncate">#{t}</span>
            </Link>
          ))}
          {post.claps ? (
            <span className={stat}>
              <ZapIcon className="size-3.5" aria-hidden />
              {compact(post.claps)}
              <span className="sr-only"> sparks</span>
            </span>
          ) : null}
          {post.comments_count ? (
            <span className={stat}>
              <MessageSquareIcon className="size-3.5" aria-hidden />
              {compact(post.comments_count)}
              <span className="sr-only"> responses</span>
            </span>
          ) : null}
          <div className="ml-auto flex items-center rounded-[var(--radius-sm)] border border-line-strong bg-card">
            <BookmarkButton post={post} compact />
            <span aria-hidden className="h-6 w-px bg-line" />
            <PostMenu post={post} />
          </div>
        </footer>
      </article>
    </Reveal>
  );
}
