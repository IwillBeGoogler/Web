import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOffIcon, FileQuestionIcon, LinkIcon, MessageSquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Highlighter, HighlightsPanel } from "@/contexts/collections/ui/Highlights";
import { SaveToList } from "@/contexts/collections/ui/Lists";
import { SeriesNav } from "@/contexts/collections/ui/Series";
import { BookmarkButton, ClapButton, FollowButton } from "@/contexts/engagement/ui/actions";
import { PostMenu } from "@/contexts/engagement/ui/PostMenu";
import { Responses } from "@/contexts/engagement/ui/Responses";
import { useMe } from "@/contexts/identity/application/session";
import { useReadingPrefs } from "@/contexts/preferences/application/store";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { bionicHtml } from "@/contexts/preferences/ui/bionic";
import { postQuery, profileQuery, relatedQuery } from "@/contexts/reading/application/queries";
import { excerpt, type Post, postPath, readTime } from "@/contexts/reading/domain/post";
import { safeHtml } from "@/contexts/reading/domain/sanitize";
import { readingRepository } from "@/contexts/reading/infrastructure/readingRepository";
import { ArticleBody } from "@/contexts/reading/ui/ArticleBody";
import { TopicChips } from "@/contexts/reading/ui/TopicChips";
import { useReadTime } from "@/shared/analytics";
import { useHead } from "@/shared/head";
import { isApiError } from "@/shared/http";
import { compact, shortDate } from "@/shared/lib/format";
import { ease, motion, ReadingProgress, useReducedMotion } from "@/shared/motion";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Carousel } from "@/shared/ui/carousel";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";

/** "ActionDeck": one segmented toolbar of labelled keys with counts. Rides the bottom edge while reading, docks at the end. */
function ActionDeck({ post, onResponses }: { post: Post; onResponses: () => void }) {
  return (
    <div
      role="toolbar"
      aria-label="Post actions"
      data-chrome=""
      className="sticky bottom-[calc(5rem+var(--cookie-h,0px))] z-30 mx-auto mt-10 flex w-fit max-w-full items-stretch divide-x divide-line overflow-x-auto rounded-[var(--radius-md)] border border-line-strong bg-card shadow-[3px_3px_0_0_var(--fg)] [scrollbar-width:none] md:bottom-[calc(1rem+var(--cookie-h,0px))]"
    >
      <ClapButton post={post} />
      <button type="button" onClick={onResponses} className="key" aria-label={`Discussion, ${post.comments_count}`}>
        <MessageSquareIcon className="size-4" aria-hidden strokeWidth={1.5} />
        <span aria-hidden className="hidden tracking-[0.08em] uppercase sm:inline">
          Discuss
        </span>
        <span aria-hidden className="tag-count">
          {post.comments_count}
        </span>
      </button>
      <BookmarkButton post={post} />
      <SaveToList postId={post.id} />
      <button
        type="button"
        className="key"
        aria-label="Copy link"
        onClick={() => navigator.clipboard?.writeText(location.href).then(() => toast.ok("Link copied"), toast.error)}
      >
        <LinkIcon className="size-4" aria-hidden strokeWidth={1.5} />
        <span aria-hidden className="hidden tracking-[0.08em] uppercase sm:inline">
          Copy link
        </span>
      </button>
      <span className="grid place-items-center px-0.5 empty:hidden">
        <PostMenu post={post} />
      </span>
    </div>
  );
}

/** Counts a view on open and a read once 60% of the story scrolled past. */
function useReadTracking(id: number | undefined) {
  const sent = useRef(false);
  useEffect(() => {
    if (!id) return;
    sent.current = false;
    void readingRepository.view(id);
    const onScroll = () => {
      const h = document.documentElement;
      const progress = (h.scrollTop + innerHeight) / h.scrollHeight;
      if (!sent.current && progress >= 0.6) {
        sent.current = true;
        void readingRepository.read(id, Math.min(1, progress));
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [id]);
}

function ArticleSkeleton() {
  return (
    <Loading>
      <div className="space-y-4">
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-2/3" />
        <div className="flex items-center gap-3 py-6">
          <Bone className="size-11 rounded-[var(--radius-sm)]" />
          <Bone className="h-4 w-40" />
        </div>
        {[90, 100, 95, 80, 100, 70, 85, 60].map((w) => (
          <Bone key={w} className="h-5" />
        ))}
      </div>
    </Loading>
  );
}

export function ArticlePage({ slug }: { slug: string }) {
  const q = useQuery(postQuery(slug));
  const post = q.data;
  const { me } = useMe();
  const author = useQuery({ ...profileQuery(post?.author ?? ""), enabled: !!post?.author && !!post?.user_id });
  const related = useQuery({ ...relatedQuery(post?.id ?? 0), enabled: !!post });
  useReadTime(post?.id);
  useHead({
    title: post?.title,
    description: post ? post.subtitle || excerpt(post.body, 160) : undefined,
    canonical: post ? post.canonical_url || postPath(post) : undefined,
    image: post?.cover_url || undefined,
    type: post ? "article" : undefined,
    noindex: post ? post.status !== "published" : undefined,
  });
  const [responses, setResponses] = useState(false);
  const nav = useNavigate();
  const bodyRef = useRef<HTMLDivElement>(null);
  const prefs = useReadingPrefs();
  const articleRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  useReadTracking(post?.id);
  // a ::diagram embed opens the viewer without reloading the site (the figure's link is plain HTML from the server)
  const hasBody = !!post?.body_html;
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !hasBody) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("figure.diagram-embed a[href^='/d/v/']");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      void nav({ to: "/d/v/$slug", params: { slug: decodeURIComponent(a.getAttribute("href")?.slice("/d/v/".length) ?? "") } });
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [hasBody, nav]);
  useEffect(() => {
    if (post) document.title = `${post.title} | IWillBeGoogler`;
  }, [post]);

  return (
    <main id="main">
      <article ref={articleRef} className="article-column reading-glass mx-auto px-4 pt-8 pb-24 md:px-6 md:pt-12">
        {q.isPending ? (
          <ArticleSkeleton />
        ) : q.isError && !(isApiError(q.error) && q.error.status >= 400 && q.error.status < 500) ? (
          <EmptyState
            icon={CloudOffIcon}
            code="err · offline"
            title="Couldn't load this story."
            body="Check your connection and try again."
            action={
              <Button variant="outline" loading={q.isFetching} onClick={() => q.refetch()}>
                Try again
              </Button>
            }
          />
        ) : q.isError || !post ? (
          <EmptyState
            icon={FileQuestionIcon}
            code={isApiError(q.error) && q.error.isForbidden ? "403 · no access" : "404 · not found"}
            title={isApiError(q.error) && q.error.isForbidden ? "You don't have access to this story." : "This story doesn't exist or was removed."}
            action={
              <Button asChild>
                <Link to="/">Back to home</Link>
              </Button>
            }
          />
        ) : (
          <>
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              <Link to="/" className="hover:text-fg">
                Stream
              </Link>
              {post.tags[0] ? (
                <>
                  <span aria-hidden>/</span>
                  <Link to="/tag/$tag" params={{ tag: post.tags[0] }} className="hover:text-fg">
                    #{post.tags[0]}
                  </Link>
                </>
              ) : null}
            </nav>
            <motion.header initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
              <h1 className="font-display text-[34px] leading-[38px] font-extrabold tracking-[-0.04em] text-balance md:text-[56px] md:leading-[60px]">
                <Bio>{post.title}</Bio>
              </h1>
              {post.subtitle ? (
                <h2 className="mt-4 font-sans text-lg leading-7 font-normal tracking-normal text-muted md:text-[22px] md:leading-8">
                  <Bio>{post.subtitle}</Bio>
                </h2>
              ) : null}
              <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-line md:grid-cols-4">
                <div className="bg-card px-4 py-3">
                  <dt className="kicker">
                    <span aria-hidden className="mr-1.5">
                      01
                    </span>
                    Writer
                  </dt>
                  <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium">
                    {post.author && post.user_id ? <Avatar name={author.data?.display_name || post.author} src={author.data?.avatar_url} size="xs" /> : null}
                    {post.author && post.user_id ? (
                      <Link to="/@{$username}" params={{ username: post.author }} className="truncate hover:underline">
                        @{post.author}
                      </Link>
                    ) : (
                      "Anonymous"
                    )}
                  </dd>
                </div>
                <div className="bg-card px-4 py-3">
                  <dt className="kicker">
                    <span aria-hidden className="mr-1.5">
                      02
                    </span>
                    {post.status === "published" ? "Published" : "Status"}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {post.status === "published" ? (
                      <time dateTime={post.published_at ?? post.created_at}>{shortDate(post.published_at ?? post.created_at)}</time>
                    ) : (
                      <span className="font-mono text-[12px] uppercase">{post.status}</span>
                    )}
                  </dd>
                </div>
                <div className="bg-card px-4 py-3">
                  <dt className="kicker">
                    <span aria-hidden className="mr-1.5">
                      03
                    </span>
                    Length
                  </dt>
                  <dd className="mt-1 text-sm font-medium">{readTime(post.reading_time)}</dd>
                </div>
                <div className="bg-card px-4 py-3">
                  <dt className="kicker">
                    <span aria-hidden className="mr-1.5">
                      04
                    </span>
                    Topic
                  </dt>
                  <dd className="mt-1 truncate text-sm font-medium">
                    {post.tags[0] ? (
                      <Link to="/tag/$tag" params={{ tag: post.tags[0] }} className="hover:underline">
                        #{post.tags[0]}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </motion.header>
            {post.cover_url ? (
              <figure className="mt-10">
                <motion.img
                  src={post.cover_url}
                  alt=""
                  className="h-auto w-full rounded-[var(--radius-md)] border border-line-strong"
                  initial={reduce ? false : { opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease }}
                />
                <figcaption aria-hidden className="mt-2 font-mono text-[11px] text-muted uppercase">
                  Fig. 01 — cover
                </figcaption>
              </figure>
            ) : null}
            {post.body_html ? (
              <ArticleBody html={prefs.bionic ? bionicHtml(safeHtml(post.body_html)) : safeHtml(post.body_html)} bodyRef={bodyRef} />
            ) : (
              <div ref={bodyRef} className="prose-article mt-10 whitespace-pre-wrap">
                {post.body}
              </div>
            )}
            {/* Sticky-bottom only holds an element whose flow position is below the viewport, so the floating
                toolbar sits after the body: it rides the bottom edge while reading and docks at the end. */}
            <ActionDeck post={post} onResponses={() => setResponses(true)} />
            <Highlighter postId={post.id} body={post.body} container={bodyRef} />
            <HighlightsPanel postId={post.id} />
            <SeriesNav postId={post.id} author={post.author} />
            {post.tags.length ? (
              <section aria-labelledby="filed-under" className="tile mt-12">
                <h2 id="filed-under" className="tile-head">
                  Filed under
                </h2>
                <div className="px-3">
                  <TopicChips tags={post.tags} wrap />
                </div>
              </section>
            ) : null}
            {post.author && post.user_id ? (
              <section aria-label="About the writer" className="tile mt-16 overflow-hidden">
                <p className="tile-head">Written by</p>
                <div className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <Avatar name={author.data?.display_name || post.author} src={author.data?.avatar_url} size="xl" />
                  <div className="min-w-0">
                    <Link to="/@{$username}" params={{ username: post.author }} className="block truncate font-display text-xl font-bold hover:underline">
                      <Bio>{author.data?.display_name || post.author}</Bio>
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-muted">
                      @{post.author}
                      {author.data ? ` · ${compact(author.data.followers)} readers` : ""}
                    </p>
                    {author.data?.bio ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        <Bio>{author.data.bio}</Bio>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {me?.username !== post.author && author.data ? <FollowButton username={post.author} following={author.data.is_following} /> : null}
                    {me && me.id === post.user_id ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/p/$id/edit" params={{ id: String(post.id) }}>
                          Edit
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
            <div className="mt-12">
              <Responses postId={post.id} count={post.comments_count} open={responses} onOpenChange={setResponses} />
            </div>
          </>
        )}
      </article>
      {post ? <ReadingProgress target={articleRef} /> : null}
      {related.data?.length ? (
        <section data-chrome className="py-12">
          <div className="mx-auto max-w-feed border-t border-line px-4 pt-12 md:px-6">
            <h2 className="kicker mb-4">Next up</h2>
            <Carousel label="Next up" slide="basis-[85%] sm:basis-1/2">
              {related.data.slice(0, 8).map((p, i) => (
                <div key={p.id} className="h-full p-[3px]">
                  <a href={postPath(p)} className="tile tile-hover flex h-full flex-col overflow-hidden">
                    <span className="tile-head" aria-hidden>
                      <span className="idx text-fg">{String(i + 1).padStart(2, "0")}</span>
                      <span className="ml-auto">{readTime(p.reading_time)}</span>
                    </span>
                    <span className="block min-w-0 p-4">
                      <span className="line-clamp-2 block font-display text-[15px] leading-5 font-bold">
                        <Bio>{p.title}</Bio>
                      </span>
                      <span className="mt-2 block truncate font-mono text-[11px] text-muted">@{p.author}</span>
                    </span>
                  </a>
                </div>
              ))}
            </Carousel>
          </div>
        </section>
      ) : null}
    </main>
  );
}
