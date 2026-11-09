import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ListIcon, LockIcon, PenLineIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { myListsQuery, userSeriesQuery } from "@/contexts/collections/application/hooks";
import type { Series } from "@/contexts/collections/domain/collections";
import { FollowButton } from "@/contexts/engagement/ui/actions";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe, useToken } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { feedPreviewQuery, feedQuery, profileQuery, suggestionsQuery, tagsQuery, trendingQuery } from "@/contexts/reading/application/queries";
import { excerpt, type Post, postPath, readTime } from "@/contexts/reading/domain/post";
import type { FeedSource } from "@/contexts/reading/infrastructure/readingRepository";
import { Feed } from "@/contexts/reading/ui/Feed";
import { Sidebar } from "@/contexts/reading/ui/Sidebar";
import { SiteStats } from "@/contexts/reading/ui/SiteStats";
import { cn } from "@/shared/lib/cn";
import { compact, shortDate, timeAgo } from "@/shared/lib/format";
import { Reveal, Stagger, StaggerItem } from "@/shared/motion";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Carousel } from "@/shared/ui/carousel";
import { Lens } from "@/shared/ui/modal";
import { Ribbon } from "@/shared/ui/ribbon";
import { Bone } from "@/shared/ui/states";
import { HOME_REPLAY } from "../layout/Logo";
import { LandingPage } from "./LandingPage";

export type HomeTab = "for-you" | "following" | "latest";

/** Feed column + optional recommendations sidebar. Home renders its own hub layout and passes `aside={false}`. */
export function HomeGrid({ children, aside = true }: { children: React.ReactNode; aside?: boolean }) {
  if (!aside) return <div className="mx-auto max-w-shell px-4 pb-24 md:px-6">{children}</div>;
  return (
    <div className="mx-auto max-w-shell px-4 md:px-6 lg:grid lg:grid-cols-[minmax(0,var(--container-feed))_var(--container-sidebar)] lg:justify-center lg:gap-10 xl:gap-14">
      <div className="mx-auto min-w-0 max-w-feed py-6 lg:mx-0">{children}</div>
      <Sidebar />
    </div>
  );
}

export function HomePage({ tab }: { tab: HomeTab | undefined }) {
  const token = useToken();
  // Signed-out visitors land on the marketing page until they pick a feed.
  // Logo click bumps the key so the entrance animation replays.
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    // Throttled: rapid logo clicks would otherwise remount the page (and its WebGL hero) back to back.
    let last = 0;
    const bump = () => {
      if (Date.now() - last < 1500) return;
      last = Date.now();
      setReplay((n) => n + 1);
    };
    addEventListener(HOME_REPLAY, bump);
    return () => removeEventListener(HOME_REPLAY, bump);
  }, []);
  if (!token && !tab) return <LandingPage key={replay} />;
  return <HomeFeed key={replay} tab={tab} />;
}

const greeting = (hour: number) => (hour >= 5 && hour < 12 ? "Morning" : hour >= 12 && hour < 18 ? "Afternoon" : "Evening");

/** Lead carousel of the top three (8 cols) plus the "Rising" ranked list that continues from 04 (4 cols). Reserves space while loading. */
function Spotlight() {
  const q = useQuery(trendingQuery());
  if (q.isPending)
    return (
      <div aria-hidden className="mt-6 grid gap-4 lg:grid-cols-12">
        <Bone className="h-[420px] rounded-[var(--radius-md)] lg:col-span-8" />
        <Bone className="h-[420px] rounded-[var(--radius-md)] lg:col-span-4" />
      </div>
    );
  const all = q.data ?? [];
  if (!all.length) return null;
  const slides = all.slice(0, 3);
  const ranked = all.slice(3);
  return (
    <section aria-labelledby="spotlight" className="mt-6 grid gap-4 lg:grid-cols-12">
      <h2 id="spotlight" className="sr-only">
        Spotlight
      </h2>
      <Reveal className={ranked.length ? "lg:col-span-8" : "lg:col-span-12"}>
        <Carousel label="Spotlight stories" autoplay={10000} controls="overlay" className="h-full overflow-hidden [&>div:first-child]:h-full">
          {slides.map((x, i) => {
            const cover = !!x.cover_url;
            return (
              <div key={x.id} className="h-full p-[3px]">
                <a
                  href={postPath(x)}
                  className={cn("tile tile-hover group relative flex h-full min-h-[380px] flex-col justify-end overflow-hidden", !cover && "hatch")}
                >
                  {cover ? (
                    <>
                      <img src={x.cover_url} alt="" className="absolute inset-0 size-full object-cover contrast-[1.05] grayscale" />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-inverse from-35% via-inverse/85 via-55% to-transparent" />
                    </>
                  ) : null}
                  <span className="absolute top-3 left-3 rounded-[var(--radius-xs)] border border-on-inverse/30 bg-inverse px-2 py-1 font-mono text-[11px] text-on-inverse uppercase">
                    #{i + 1} trending
                  </span>
                  <div className={cn("relative p-6 md:p-7", cover ? "text-on-inverse" : "text-fg")}>
                    {x.author ? <p className="font-mono text-[11px] tracking-[0.12em] uppercase opacity-80">@{x.author}</p> : null}
                    <h3 className="mt-2 line-clamp-3 font-display text-2xl leading-tight font-extrabold tracking-[-0.03em] md:text-[30px]">
                      <Bio>{x.title}</Bio>
                    </h3>
                    <p className={cn("mt-3 line-clamp-2 text-[15px] leading-6", cover ? "opacity-80" : "text-muted")}>
                      <Bio>{x.subtitle || excerpt(x.body, 200)}</Bio>
                    </p>
                    <div className="mt-5 flex items-center justify-between font-mono text-[12px] opacity-80">
                      <span>
                        {shortDate(x.published_at)} · {readTime(x.reading_time)}
                      </span>
                      <span aria-hidden className="tracking-[0.12em] uppercase">
                        → Read
                      </span>
                    </div>
                  </div>
                </a>
              </div>
            );
          })}
        </Carousel>
      </Reveal>
      {ranked.length ? (
        <div className="tile flex flex-col lg:col-span-4">
          <p className="tile-head">
            Rising
            <span className="idx ml-auto">top {all.length}</span>
          </p>
          <Stagger as="ol" className="flex flex-col divide-y divide-line">
            {ranked.map((p: Post, i) => (
              <StaggerItem as="li" key={p.id}>
                <a href={postPath(p)} className="group grid grid-cols-[2rem_1fr] gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2">
                  <span className="idx pt-0.5 text-[13px] group-hover:text-fg" aria-hidden>
                    {String(i + slides.length + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 block font-display text-[14px] leading-5 font-bold">
                      <Bio>{p.title}</Bio>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                      @{p.author} · {readTime(p.reading_time)}
                    </span>
                  </span>
                </a>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      ) : null}
    </section>
  );
}

function TopicRail() {
  const tags = useQuery(tagsQuery());
  const top = (tags.data ?? []).slice(0, 16);
  if (tags.isPending)
    return (
      <div aria-hidden className="mt-10 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Bone key={i} className="h-8 w-24 shrink-0" />
        ))}
      </div>
    );
  if (!top.length) return null;
  return (
    <section aria-labelledby="topics" className="tile mt-10 p-4">
      <div className="flex items-center justify-between">
        <h2 id="topics" className="kicker">
          Topics
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/search">
            All topics
            <kbd className="kbd" aria-hidden>
              →
            </kbd>
          </Link>
        </Button>
      </div>
      <Ribbon label="Topics" seconds={top.length * 14} className="mt-3">
        {top.map((t) => (
          <Link key={t.name} to="/tag/$tag" params={{ tag: t.name }} className="tag h-8 text-[12.5px]">
            <span className="min-w-0 truncate">
              <span className="text-muted" aria-hidden>
                #
              </span>
              {t.name}
            </span>
            <span className="tag-count">
              {compact(t.count)}
              <span className="sr-only"> stories</span>
            </span>
          </Link>
        ))}
      </Ribbon>
    </section>
  );
}

const panel = "tile";
const panelHead = "tile-head";
const panelBody = "p-3";
const panelLink = "ml-auto font-mono text-[11px] normal-case tracking-normal hover:text-fg";

function PanelRows() {
  return (
    <div aria-hidden className="space-y-3 p-3">
      {[0, 1, 2].map((i) => (
        <Bone key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function SavedPanel({ wide }: { wide: boolean }) {
  const q = useInfiniteQuery(feedQuery({ kind: "bookmarks" }));
  const rows = q.data?.pages[0]?.items.slice(0, 3) ?? [];
  return (
    <section aria-labelledby="desk-saved" className={cn(panel, wide ? "lg:col-span-9" : "lg:col-span-6")}>
      <div className={panelHead}>
        <h2 id="desk-saved">Saved for later</h2>
        <Link to="/me/library" className={panelLink}>
          Open all
        </Link>
      </div>
      {q.isPending ? (
        <PanelRows />
      ) : q.isError ? (
        <p className="p-3 font-mono text-[12px] text-muted">Couldn't load saved stories.</p>
      ) : rows.length ? (
        <ul className="space-y-1 p-1.5">
          {rows.map((p) => (
            <li key={p.id}>
              <a href={postPath(p)} className="group flex items-center gap-3 rounded-[var(--radius-sm)] p-1.5 transition-colors hover:bg-surface-2">
                {p.cover_url ? (
                  <img
                    src={p.cover_url}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    className="size-12 shrink-0 rounded-[var(--radius-xs)] border border-line object-cover grayscale"
                  />
                ) : (
                  <span aria-hidden className="hatch size-12 shrink-0 rounded-[var(--radius-xs)] border border-line" />
                )}
                <span className="min-w-0">
                  <span className="line-clamp-1 block text-sm font-semibold">
                    <Bio>{p.title}</Bio>
                  </span>
                  <span className="block font-mono text-[11px] text-muted">{readTime(p.reading_time)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-3 font-mono text-[12px] text-muted">Bookmark a story and it waits here.</p>
      )}
    </section>
  );
}

function DraftsPanel() {
  const q = useInfiniteQuery(feedQuery({ kind: "mine", status: "draft" }));
  const rows = q.data?.pages[0]?.items.slice(0, 3) ?? [];
  return (
    <section aria-labelledby="desk-drafts" className={cn(panel, "lg:col-span-3")}>
      <div className={panelHead}>
        <h2 id="desk-drafts">On your desk</h2>
        <Link to="/me/stories" className={panelLink}>
          All drafts
        </Link>
      </div>
      {q.isPending ? (
        <PanelRows />
      ) : q.isError ? (
        <p className="p-3 font-mono text-[12px] text-muted">Couldn't load drafts.</p>
      ) : rows.length ? (
        <ol className="divide-y divide-line">
          {rows.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[2rem_1fr] gap-1 px-3 py-2.5">
              <span aria-hidden className="idx pt-0.5 text-[11px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <Link to="/p/$id/edit" params={{ id: String(p.id) }} className="block hover:underline">
                  <span className="line-clamp-1 block text-sm font-semibold">
                    <Bio>{p.title || "Untitled draft"}</Bio>
                  </span>
                </Link>
                <span className="block font-mono text-[11px] text-muted">edited {timeAgo(p.updated_at || p.created_at)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className={panelBody}>
          <Button variant="outline" size="sm" asChild>
            <Link to="/new-story">Start a draft</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function WritersPanel({ rows }: { rows: { id: number; username: string; display_name: string; avatar_url: string; followers: number }[] }) {
  return (
    <section aria-labelledby="desk-writers" className={cn(panel, "lg:col-span-3")}>
      <div className={panelHead}>
        <h2 id="desk-writers">Writers to watch</h2>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={displayName(u)} src={u.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <Link to="/@{$username}" params={{ username: u.username }} className="block truncate text-sm font-semibold hover:underline">
                <Bio>{displayName(u)}</Bio>
              </Link>
              <p className="truncate font-mono text-[11px] text-muted">
                @{u.username} · {compact(u.followers)} readers
              </p>
            </div>
            <FollowButton username={u.username} following={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Saved / drafts / writers strip for signed-in readers. "Continue reading" is not rendered: no GET endpoint for read progress. */
function Desk() {
  const who = useQuery(suggestionsQuery());
  const writers = who.data ?? [];
  const showWriters = who.isPending || writers.length > 0;
  return (
    <section aria-label="Your desk" className="mt-10 grid gap-4 lg:grid-cols-12">
      <SavedPanel wide={!showWriters} />
      <DraftsPanel />
      {who.isPending ? (
        <div className={cn(panel, "lg:col-span-3")}>
          <PanelRows />
        </div>
      ) : writers.length ? (
        <WritersPanel rows={writers} />
      ) : null}
    </section>
  );
}

/** Signed-out people discovery: most-followed authors behind today's trending and newest stories. */
function PublicWriters() {
  const trending = useQuery(trendingQuery());
  const latest = useInfiniteQuery(feedQuery({ kind: "latest" }));
  const authors = [...new Set([...(trending.data ?? []), ...(latest.data?.pages[0]?.items ?? [])].map((p) => p.author).filter(Boolean))].slice(0, 8);
  const profiles = useQueries({ queries: authors.map((u) => ({ ...profileQuery(u), staleTime: 5 * 60_000 })) });
  const pending = trending.isPending || latest.isPending || profiles.some((q) => q.isPending);
  const rows = profiles
    .flatMap((q) => (q.data ? [q.data] : []))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 4);
  if (pending)
    return (
      <div aria-hidden className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-40" />
        ))}
      </div>
    );
  if (!rows.length) return null;
  return (
    <section aria-labelledby="public-writers" className="mt-10">
      <h2 id="public-writers" className="kicker mb-3">
        Writers to watch
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((u) => (
          <li key={u.id} className="tile flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={displayName(u)} src={u.avatar_url} size="md" />
              <div className="min-w-0">
                <Link to="/@{$username}" params={{ username: u.username }} className="block truncate text-sm font-semibold hover:underline">
                  <Bio>{displayName(u)}</Bio>
                </Link>
                <p className="truncate font-mono text-[11px] text-muted">
                  {compact(u.followers)} readers · {compact(u.posts)} stories
                </p>
              </div>
            </div>
            {u.bio ? (
              <p className="line-clamp-2 text-[13px] leading-5 text-muted">
                <Bio>{u.bio}</Bio>
              </p>
            ) : null}
            <div className="mt-auto">
              <FollowButton username={u.username} following={u.is_following} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Signed-in reader's own reading lists as quick links. Hidden until they have one. */
function ListsStrip() {
  const q = useInfiniteQuery(myListsQuery());
  const lists = q.data?.pages[0]?.items ?? [];
  if (q.isPending || q.isError || !lists.length) return null;
  return (
    <section aria-labelledby="your-lists" className="mt-4">
      <div className="flex items-center justify-between">
        <h2 id="your-lists" className="kicker">
          Your lists
        </h2>
        <Link to="/me/library" className="font-mono text-[11px] text-muted hover:text-fg">
          Manage
        </Link>
      </div>
      <ul className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {lists.slice(0, 10).map((l) => (
          <li key={l.id} className="shrink-0">
            <Link to="/lists/$slug" params={{ slug: l.slug }} className="tag h-9 gap-2 text-[12.5px]">
              {l.private ? <LockIcon className="size-3.5 text-muted" aria-label="Private" /> : <ListIcon className="size-3.5 text-muted" aria-hidden />}
              <span className="max-w-48 truncate">
                <Bio>{l.name}</Bio>
              </span>
              <span className="tag-count">
                {compact(l.posts)}
                <span className="sr-only"> stories</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StreamCount({ source }: { source: FeedSource }) {
  const q = useInfiniteQuery(feedQuery(source));
  const total = q.data?.pages[0]?.meta.total;
  if (!total) return null;
  return <span className="idx text-[11px]">{compact(total)} stories</span>;
}

/** Most-sparked of the newest stories, as a slow carousel of cover tiles. Trending already fills Spotlight, so this draws from the latest feed. */
function TopPosts() {
  const q = useInfiniteQuery(feedQuery({ kind: "latest" }));
  const top = [...(q.data?.pages[0]?.items ?? [])].filter((p) => p.claps > 0).sort((a, b) => b.claps - a.claps);
  if (q.isPending)
    return (
      <div aria-hidden className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-64" />
        ))}
      </div>
    );
  if (top.length < 2) return null;
  return (
    <section aria-labelledby="top-posts" className="mt-10">
      <h2 id="top-posts" className="kicker mb-3">
        Most sparked lately
      </h2>
      <Carousel label="Most sparked lately" slide="basis-[80%] sm:basis-1/2 lg:basis-1/4" autoplay={9000}>
        {top.map((p, i) => (
          <a key={p.id} href={postPath(p)} className="tile tile-hover group flex h-full flex-col overflow-hidden">
            <div className="relative aspect-[4/3] overflow-hidden border-b border-line bg-surface-2">
              {p.cover_url ? (
                <img
                  src={p.cover_url}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover grayscale transition-[filter,transform] duration-700 group-hover:scale-105 group-hover:grayscale-0"
                />
              ) : (
                <div aria-hidden className="absolute inset-0 grid place-items-center font-display text-7xl font-extrabold text-line select-none">
                  {Array.from(p.title.trim())[0] ?? "·"}
                </div>
              )}
              <span className="absolute top-2 left-2 rounded-[var(--radius-xs)] bg-inverse px-1.5 py-0.5 font-mono text-[11px] text-on-inverse tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <span className="line-clamp-2 font-display text-[15px] leading-5 font-bold">
                <Bio>{p.title}</Bio>
              </span>
              <span className="mt-auto flex items-center justify-between pt-3 font-mono text-[11px] text-muted">
                <span className="truncate">@{p.author}</span>
                <span className="tabular-nums">⚡ {compact(p.claps)}</span>
              </span>
            </div>
          </a>
        ))}
      </Carousel>
    </section>
  );
}

/** Multi-part series from trending authors: the one place home surfaces connected reading. Hidden when none qualify. */
function SeriesShelf() {
  const trending = useQuery(trendingQuery());
  const authors = [...new Set((trending.data ?? []).map((p) => p.author).filter(Boolean))];
  const lists = useQueries({ queries: authors.map((u) => userSeriesQuery(u)) });
  const pending = trending.isPending || lists.some((q) => q.isPending);
  const shelf = lists
    .flatMap((q) => q.data ?? [])
    .map((x) => ({ ...x, posts: x.posts.filter((p) => p.status === "published").sort((a, b) => a.position - b.position) }))
    .filter((x) => x.posts.length >= 2)
    .sort((a, b) => b.posts.length - a.posts.length)
    .slice(0, 4);
  if (pending)
    return (
      <div aria-hidden className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-56" />
        ))}
      </div>
    );
  if (!shelf.length) return null;
  return (
    <section aria-labelledby="series-shelf" className="mt-10">
      <h2 id="series-shelf" className="kicker mb-3">
        Read in order
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shelf.map((x) => (
          <SeriesCard key={x.id} series={x} />
        ))}
      </div>
    </section>
  );
}

function SeriesCard({ series: x }: { series: Series }) {
  const [first] = x.posts;
  return (
    <article className="tile flex flex-col">
      <div className="tile-head">
        <span className="tabular-nums">{x.posts.length} parts</span>
        <span className="ml-auto truncate">@{x.author}</span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <Link to="/series/$slug" params={{ slug: x.slug }} className="font-display text-[16px] leading-5 font-bold hover:underline">
          <Bio>{x.title}</Bio>
        </Link>
        {x.description ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-muted">
            <Bio>{x.description}</Bio>
          </p>
        ) : null}
        <ol className="mt-3 space-y-1">
          {x.posts.slice(0, 3).map((p, i) => (
            <li key={p.post_id} className="grid grid-cols-[1.5rem_1fr] font-mono text-[12px]">
              <span aria-hidden className="idx">
                {String(i + 1).padStart(2, "0")}
              </span>
              <a href={postPath({ author: x.author, slug: p.slug })} className="truncate hover:text-fg hover:underline">
                <Bio>{p.title}</Bio>
              </a>
            </li>
          ))}
        </ol>
      </div>
      {first ? (
        <a
          href={postPath({ author: x.author, slug: first.slug })}
          className="border-t border-line px-3 py-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase hover:bg-surface-2 hover:text-fg"
        >
          Start part 1 →
        </a>
      ) : null}
    </article>
  );
}

/** One tile per top category with its four newest stories. */
function CategoryList({ tag, count, index }: { tag: string; count: number; index: number }) {
  const q = useQuery(feedPreviewQuery({ kind: "tag", tag }, 4));
  const posts = q.data ?? [];
  return (
    <div className="tile flex h-full w-72 flex-col whitespace-normal">
      <div className="tile-head">
        <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
        <span className="truncate text-fg">#{tag}</span>
        <span className="ml-auto tabular-nums">{compact(count)}</span>
      </div>
      {q.isPending ? (
        <PanelRows />
      ) : posts.length ? (
        <ol className="flex-1 divide-y divide-line">
          {posts.map((p) => (
            <li key={p.id}>
              <a href={postPath(p)} className="group block px-3 py-2.5 transition-colors hover:bg-surface-2">
                <span className="line-clamp-2 text-[14px] leading-5 font-semibold group-hover:underline">
                  <Bio>{p.title}</Bio>
                </span>
                <span className="mt-1 block font-mono text-[11px] text-muted">
                  {shortDate(p.published_at)} · {readTime(p.reading_time)}
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-3 text-sm text-muted">No stories yet.</p>
      )}
      <Link
        to="/tag/$tag"
        params={{ tag }}
        className="border-t border-line px-3 py-2 font-mono text-[11px] text-muted uppercase tracking-[0.1em] hover:bg-surface-2 hover:text-fg"
      >
        Open #{tag} →
      </Link>
    </div>
  );
}

function CategoryLists() {
  const tags = useQuery(tagsQuery());
  const top = (tags.data ?? []).slice(0, 8);
  if (tags.isPending)
    return (
      <div aria-hidden className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-72" />
        ))}
      </div>
    );
  if (!top.length) return null;
  return (
    <section aria-labelledby="categories" className="mt-10">
      <h2 id="categories" className="kicker mb-3">
        Categories
      </h2>
      <Ribbon label="Categories" seconds={top.length * 18} reverse>
        {top.map((t, i) => (
          <CategoryList key={t.name} tag={t.name} count={t.count} index={i} />
        ))}
      </Ribbon>
    </section>
  );
}

function HomeFeed({ tab: wanted }: { tab: HomeTab | undefined }) {
  const token = useToken();
  const { me } = useMe();
  const nav = useNavigate();
  // Key off the token, not `me`: waiting for the profile would flip the default lens and refetch the stream.
  // Signed-out visitors can't load personal feeds, so a shared ?tab=following|for-you falls back to latest.
  const tab: HomeTab = token ? (wanted ?? "for-you") : "latest";
  const lenses: [HomeTab, string][] = token
    ? [
        ["for-you", "Picked for you"],
        ["following", "Your circle"],
        ["latest", "Newest"],
      ]
    : [
        ["latest", "Newest"],
        ["following", "Your circle"],
      ];
  const first = me ? displayName(me).trim().split(/\s+/)[0] || me.username : "";
  return (
    <HomeGrid aside={false}>
      <Reveal y={24}>
        <header className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-line md:grid-cols-[1fr_auto]">
          <div className="bg-card p-5 md:p-6">
            <p className="kicker">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1 className="mt-2 font-display text-[28px] leading-[1.1] font-extrabold tracking-[-0.035em] md:text-[36px]">
              {token ? (
                <>
                  {greeting(new Date().getHours())}
                  {first ? `, ${first}` : ""}.
                  <br />
                  <span className="text-muted">Here's your desk.</span>
                </>
              ) : (
                <>
                  Fresh on <span className="text-muted">IWillBeGoogler</span>
                </>
              )}
            </h1>
          </div>
          <div className="flex flex-col justify-center gap-3 bg-card p-5 md:p-6">
            {me ? (
              <Button size="sm" asChild>
                <Link to="/new-story">
                  <PenLineIcon className="size-4" aria-hidden /> New draft
                </Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => authDialog.open("signup")}>
                Join free
              </Button>
            )}
          </div>
        </header>
      </Reveal>
      <Reveal delay={0.12}>{tab !== "following" ? <Spotlight /> : null}</Reveal>
      <Reveal delay={0.2}>
        <TopicRail />
      </Reveal>
      <Reveal delay={0.26}>
        <TopPosts />
      </Reveal>
      <Reveal>
        <SeriesShelf />
      </Reveal>
      <Reveal>
        <CategoryLists />
      </Reveal>
      {me ? (
        <>
          <Desk />
          <ListsStrip />
        </>
      ) : token ? null : (
        <PublicWriters />
      )}
      <Reveal>
        <SiteStats />
      </Reveal>
      <Reveal>
        <section aria-labelledby="stream" className="mx-auto mt-12 max-w-feed">
          <h2 id="stream" className="font-display text-lg font-extrabold tracking-[-0.02em]">
            The stream
          </h2>
          <div className="sticky top-14 z-30 -mx-4 mt-3 mb-3 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:mx-0 md:px-0">
            <Lens
              label="Feed lens"
              value={tab}
              onChange={(id) => (id === "following" && !me ? authDialog.open("signin") : nav({ to: "/", search: { tab: id } }))}
              items={lenses}
            />
            <StreamCount source={{ kind: tab }} />
          </div>
          <Feed
            key={tab}
            source={{ kind: tab }}
            empty={
              tab === "following"
                ? { icon: UsersIcon, code: "0 · circle empty", title: "Your circle is quiet.", body: "Track writers from their profile or Writers to watch." }
                : { title: "No stories yet." }
            }
          />
        </section>
      </Reveal>
    </HomeGrid>
  );
}
