import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FollowButton } from "@/contexts/engagement/ui/actions";
import { useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { compact, shortDate } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Bone } from "@/shared/ui/states";
import { suggestionsQuery, tagsQuery, trendingQuery } from "../application/queries";
import { postPath } from "../domain/post";
import { TopicChips } from "./TopicChips";

const RISING = 3;

function Failed({ retry }: { retry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 font-mono text-[12px] text-muted">
      Couldn't load.
      <Button variant="ghost" size="sm" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export function Sidebar() {
  const { me } = useMe();
  const trending = useQuery(trendingQuery());
  const tags = useQuery(tagsQuery());
  const who = useQuery({ ...suggestionsQuery(), enabled: !!me });
  const topTags = (tags.data ?? []).slice(0, 7);
  return (
    <aside aria-label="Recommendations" className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] space-y-3 overflow-y-auto py-6 [scrollbar-width:none] lg:block">
      <section className="tile" aria-labelledby="sb-rising">
        <h2 id="sb-rising" className="tile-head">
          Rising
          <span className="idx ml-auto">top {RISING}</span>
        </h2>
        {trending.isPending ? (
          <div className="space-y-3 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-4 w-full" />
                <Bone className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : trending.isError ? (
          <Failed retry={() => void trending.refetch()} />
        ) : (trending.data ?? []).length ? (
          <ol className="divide-y divide-line">
            {trending.data?.slice(0, RISING).map((p, i) => (
              <li key={p.id}>
                <a href={postPath(p)} className="group grid grid-cols-[2rem_1fr] gap-2 px-3 py-2.5 hover:bg-surface-2">
                  <span aria-hidden className="idx pt-0.5 text-[12px] group-hover:text-fg">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-display text-[14px] leading-5 font-bold">
                      <Bio>{p.title}</Bio>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                      @{p.author} · {shortDate(p.published_at)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-3 py-4 font-mono text-[12px] text-muted">No signal yet.</p>
        )}
      </section>
      <section className="tile" aria-labelledby="sb-topics">
        <h2 id="sb-topics" className="tile-head">
          Topics
        </h2>
        <div className="px-3 py-1">
          {tags.isPending ? (
            <div className="flex flex-wrap gap-2 py-3">
              {[0, 1, 2, 3].map((i) => (
                <Bone key={i} className="h-7 w-16" />
              ))}
            </div>
          ) : tags.isError ? (
            <Failed retry={() => void tags.refetch()} />
          ) : (
            <TopicChips tags={topTags.map((t) => t.name)} counts={Object.fromEntries(topTags.map((t) => [t.name, t.count]))} wrap />
          )}
        </div>
      </section>
      {me && (who.data ?? []).length ? (
        <section className="tile" aria-labelledby="sb-writers">
          <h2 id="sb-writers" className="tile-head">
            Writers to watch
          </h2>
          <ul className="divide-y divide-line">
            {who.data?.map((u) => (
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
                <FollowButton username={u.username} following={false} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="flex flex-wrap gap-x-4 gap-y-2 px-1 py-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
        <Link to="/privacy" className="hover:text-fg">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-fg">
          Terms
        </Link>
      </footer>
    </aside>
  );
}
