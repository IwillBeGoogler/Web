import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { compact } from "@/shared/lib/format";
import { siteStatsQuery } from "../application/queries";
import { postPath } from "../domain/post";

/** Compact site numbers and the most viewed stories and diagrams. Renders nothing while loading, on error, or before any views. */
export function SiteStats() {
  const q = useQuery(siteStatsQuery());
  const s = q.data;
  if (!s || (s.totals.post_views === 0 && s.totals.diagram_views === 0 && s.totals.posts === 0)) return null;
  const { totals: t } = s;
  const numbers: [string, number][] = [
    ["Story views", t.post_views],
    ["Diagram views", t.diagram_views],
    ["Visitors", t.visitors],
    ["Stories", t.posts],
    ["Diagrams", t.diagrams],
    ["Writers", t.users],
  ];
  const lists = [
    { id: "stats-posts", title: "Most read stories", empty: !s.top_posts.length },
    { id: "stats-diagrams", title: "Most viewed diagrams", empty: !s.top_diagrams.length },
  ];
  return (
    <section aria-labelledby="site-stats" className="mt-10">
      <h2 id="site-stats" className="kicker mb-3">
        The site in numbers
      </h2>
      <dl className="tile grid grid-cols-2 divide-x divide-y divide-line overflow-hidden sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        {numbers.map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse px-4 py-3 max-sm:nth-[n+3]:border-t max-sm:nth-[n+3]:border-line">
            <dt className="kicker mt-1">{k}</dt>
            <dd className="font-mono text-2xl font-medium tabular-nums">{compact(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {lists.map((l) =>
          l.empty ? null : (
            <div key={l.id} className="tile p-4">
              <h3 id={l.id} className="kicker">
                {l.title}
              </h3>
              <ol aria-labelledby={l.id} className="mt-3 grid gap-2 text-sm">
                {l.id === "stats-posts"
                  ? s.top_posts.map((p, i) => (
                      <li key={p.id} className="flex items-baseline gap-3">
                        <span className="idx text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                        <a href={postPath(p)} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                          <Bio>{p.title}</Bio>
                        </a>
                        <span className="shrink-0 font-mono text-[11px] text-muted">{compact(p.views)} views</span>
                      </li>
                    ))
                  : s.top_diagrams.map((d, i) => (
                      <li key={d.slug} className="flex items-baseline gap-3">
                        <span className="idx text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                        <Link to="/d/v/$slug" params={{ slug: d.slug }} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                          <Bio>{d.title}</Bio>
                        </Link>
                        <span className="shrink-0 font-mono text-[11px] text-muted">{compact(d.views)} views</span>
                      </li>
                    ))}
              </ol>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
