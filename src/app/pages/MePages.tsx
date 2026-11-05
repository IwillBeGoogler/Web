import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellIcon, BookmarkIcon } from "lucide-react";
import { useState } from "react";
import { Settings, type SettingsTab } from "@/contexts/account/ui/Settings";
import { ListPage, MyLists } from "@/contexts/collections/ui/Lists";
import { MyPublications, PublicationPage } from "@/contexts/collections/ui/Publications";
import { MySeries, SeriesPage } from "@/contexts/collections/ui/Series";
import { bookmarkedDiagramsQuery } from "@/contexts/diagrams/application/hooks";
import { DiagramList } from "@/contexts/diagrams/ui/DiagramList";
import { notificationsQuery, useMarkAllRead, useMarkRead } from "@/contexts/engagement/application/hooks";
import { commentSearch, describeNotification, diagramTarget } from "@/contexts/engagement/domain/notification";
import { useMe } from "@/contexts/identity/application/session";
import { ImportStory, StatsPage, StoryList } from "@/contexts/publishing/ui/Studio";
import { Feed } from "@/contexts/reading/ui/Feed";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { timeAgo } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Lens, Tabs } from "@/shared/ui/modal";
import { EmptyState, Loading, PostCardSkeleton } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { HomeGrid } from "./HomePage";

const h1 = "font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]";

export function LibraryPage() {
  const [tab, setTab] = useState<"saved" | "diagrams" | "lists">("saved");
  const t = useT();
  return (
    <HomeGrid>
      <h1 className={h1}>Saved</h1>
      <Lens
        className="mt-8 mb-2"
        label="Saved section"
        value={tab}
        onChange={setTab}
        items={[
          ["saved", "Bookmarks"],
          ["diagrams", t("dg.tab")],
          ["lists", "Lists"],
        ]}
      />
      {tab === "saved" ? (
        <Feed source={{ kind: "bookmarks" }} empty={{ icon: BookmarkIcon, title: "Nothing saved.", body: "Hit the bookmark on any story — it lands here." }} />
      ) : tab === "diagrams" ? (
        <DiagramList query={bookmarkedDiagramsQuery()} byline empty={{ icon: BookmarkIcon, title: t("dg.saved.empty") }} />
      ) : (
        <MyLists />
      )}
    </HomeGrid>
  );
}

type StoriesTab = "draft" | "published" | "scheduled" | "series";

export function StoriesPage() {
  const [tab, setTab] = useState<StoriesTab>("draft");
  return (
    <HomeGrid>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>Your stories</h1>
        <div className="flex gap-2">
          <ImportStory />
          <Button variant="accent" size="sm" asChild>
            <Link to="/new-story">Write a story</Link>
          </Button>
        </div>
      </div>
      <Tabs
        className="mt-8"
        value={tab}
        onChange={setTab}
        items={[
          ["draft", "Drafts"],
          ["published", "Live"],
          ["scheduled", "Scheduled"],
          ["series", "Series"],
        ]}
      />
      {tab === "series" ? <MySeries /> : <StoryList key={tab} status={tab} />}
    </HomeGrid>
  );
}

export function NotificationsPage() {
  const q = useInfiniteQuery(notificationsQuery());
  const mark = useMarkAllRead();
  const markOne = useMarkRead();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unread ?? 0;
  return (
    <HomeGrid>
      <div className="flex items-end justify-between border-b border-line pb-4">
        <h1 className={h1}>Notifications</h1>
        {unread ? (
          <Button variant="outline" size="sm" loading={mark.isPending} onClick={() => mark.mutate(undefined, { onError: toast.error })}>
            Mark all as read
          </Button>
        ) : null}
      </div>
      {q.isPending ? (
        <Loading>
          <PostCardSkeleton />
        </Loading>
      ) : !items.length ? (
        <EmptyState icon={BellIcon} title="You're all caught up." body="Sparks, notes and new readers will show up here." />
      ) : (
        <ul>
          {items.map((n) => {
            const to = diagramTarget(n);
            const body = (
              <>
                <Avatar name={n.actor} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{describeNotification(n)}</p>
                  <p className="text-[13px] text-muted">{timeAgo(n.created_at)}</p>
                </div>
              </>
            );
            const read = () => n.unread && markOne.mutate(n.id);
            return (
              <li key={n.id} className={cn("flex items-center gap-4 border-b border-line py-5", n.unread && "font-medium")}>
                {to ? (
                  <Link
                    to="/d/f/$fileId"
                    params={{ fileId: to.fileId }}
                    search={to.comment ? { comment: commentSearch(to.comment) } : {}}
                    className="flex min-w-0 flex-1 items-center gap-4"
                    onClick={read}
                  >
                    {body}
                  </Link>
                ) : n.unread ? (
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={read}>
                    {body}
                  </button>
                ) : (
                  body
                )}
                {n.unread ? (
                  <span className="size-2 rounded-full bg-accent">
                    <span className="sr-only">Unread</span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {q.hasNextPage ? (
        <div className="py-6 text-center">
          <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Show more
          </Button>
        </div>
      ) : null}
    </HomeGrid>
  );
}

export function SettingsPage({ tab, onTab }: { tab: SettingsTab; onTab: (t: SettingsTab) => void }) {
  const { me } = useMe();
  if (!me) return null;
  return (
    <HomeGrid>
      <Settings tab={tab} onTab={onTab} />
    </HomeGrid>
  );
}

export function PublicationsPage() {
  return (
    <HomeGrid>
      <MyPublications />
    </HomeGrid>
  );
}

export function StatsRoute({ post }: { post?: number | undefined }) {
  return (
    <HomeGrid>
      <StatsPage post={post} />
    </HomeGrid>
  );
}

export function ListRoute({ slug }: { slug: string }) {
  return (
    <HomeGrid>
      <ListPage slug={slug} />
    </HomeGrid>
  );
}

export function SeriesRoute({ slug }: { slug: string }) {
  return (
    <HomeGrid>
      <SeriesPage slug={slug} />
    </HomeGrid>
  );
}

export function PublicationRoute({ slug }: { slug: string }) {
  return (
    <HomeGrid>
      <PublicationPage slug={slug} />
    </HomeGrid>
  );
}
