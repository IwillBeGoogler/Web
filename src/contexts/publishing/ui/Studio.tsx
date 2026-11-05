import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3Icon, DownloadIcon, MoreHorizontalIcon, PenLineIcon, PinIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment, useState } from "react";
import { useMe } from "@/contexts/identity/application/session";
import { feedQuery, profileQuery } from "@/contexts/reading/application/queries";
import { type Post, postPath } from "@/contexts/reading/domain/post";
import { nextPageRequest, type PageRequest } from "@/shared/http";
import { cn } from "@/shared/lib/cn";
import { compact, shortDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, ServerError } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone, EmptyState } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { useDeleteStory } from "../application/hooks";
import { bars, pct, totals } from "../domain/stats";
import { studioRepository } from "../infrastructure/storyRepository";

const item = "flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-2";

function StoryRow({ p, pinned }: { p: Post; pinned: boolean }) {
  const del = useDeleteStory();
  const qc = useQueryClient();
  const { me } = useMe();
  const pin = useMutation({
    mutationFn: () => studioRepository.pin(pinned ? null : p.id),
    onSuccess: () => {
      toast.ok(pinned ? "Unpinned" : "Pinned to your profile");
      qc.invalidateQueries({ queryKey: ["profile", me?.username] });
    },
    onError: toast.error,
  });
  const href = p.status === "published" ? postPath(p) : undefined;
  return (
    <li className="flex items-start gap-3 border-b border-line py-5">
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="text-lg font-bold hover:underline">
            {p.title || "Untitled story"}
          </a>
        ) : (
          <Link to="/p/$id/edit" params={{ id: String(p.id) }} className="text-lg font-bold hover:underline">
            {p.title || "Untitled story"}
          </Link>
        )}
        <p className="mt-1 text-[13px] text-muted">
          {p.status === "scheduled"
            ? `Scheduled for ${shortDate(p.publish_at)}`
            : p.status === "draft"
              ? `Last edited ${shortDate(p.updated_at)}`
              : `Live since ${shortDate(p.published_at)}`}
          {pinned ? " · Pinned" : ""}
        </p>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost-icon" className="[&_svg]:size-5" aria-label={`Actions for ${p.title}`}>
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="menu-pop z-50 w-48 rounded border border-line bg-surface p-1 shadow-lg">
            <DropdownMenu.Item className={item} asChild>
              <Link to="/p/$id/edit" params={{ id: String(p.id) }}>
                Edit story
              </Link>
            </DropdownMenu.Item>
            {p.status === "published" ? (
              <>
                <DropdownMenu.Item className={item} onSelect={() => pin.mutate()}>
                  {pinned ? "Unpin from profile" : "Pin to profile"}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={item} asChild>
                  <Link to="/me/stats" search={{ post: p.id }}>
                    View stats
                  </Link>
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item
              className={cn(item, "text-danger")}
              onSelect={() =>
                confirm(`Delete “${p.title}”? This can't be undone.`) && del.mutate(p.id, { onSuccess: () => toast.ok("Story deleted"), onError: toast.error })
              }
            >
              Delete story
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </li>
  );
}

/** Drafts / published / scheduled with edit, pin, stats and delete. */
export function StoryList({ status }: { status: "draft" | "published" | "scheduled" }) {
  const q = useInfiniteQuery(feedQuery({ kind: "mine", status }));
  const { me } = useMe();
  const profile = useQuery({ ...profileQuery(me?.username ?? ""), enabled: !!me });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const pinnedId = profile.data?.pinned_post_id ?? 0;
  if (q.isPending) return <Bone className="mt-6 h-24 w-full" />;
  if (!rows.length) return <EmptyState icon={PenLineIcon} title={status === "draft" ? "You have no drafts." : `You have no ${status} stories.`} />;
  return (
    <>
      <ul>
        {rows.map((p) => (
          <StoryRow key={p.id} p={p} pinned={p.id === pinnedId} />
        ))}
      </ul>
      {q.hasNextPage ? (
        <div className="py-6 text-center">
          <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Show more
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function ImportStory() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const nav = useNavigate();
  const m = useMutation({
    mutationFn: studioRepository.importUrl,
    onSuccess: (p) => {
      setOpen(false);
      toast.ok("Imported as a draft");
      nav({ to: "/p/$id/edit", params: { id: String(p.id) } });
    },
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <DownloadIcon className="size-4" aria-hidden /> Import a story
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Import a story"
        description="Paste a link to a post you wrote elsewhere. It becomes a draft here with a canonical link back."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^https?:\/\//.test(url)) m.mutate(url);
          }}
        >
          <ServerError error={m.error} />
          <Field label="URL">
            {(a) => <input {...a} type="url" className={inputCls} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
          </Field>
          <Button type="submit" variant="accent" disabled={!/^https?:\/\//.test(url)} loading={m.isPending}>
            Import
          </Button>
        </form>
      </Modal>
    </>
  );
}

function Daily({ id }: { id: number }) {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["stats", id, days], queryFn: ({ signal }) => studioRepository.daily(id, days, signal) });
  const b = bars(q.data?.days ?? []);
  return (
    <div className="rounded border border-line p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Views and reads per day</p>
        <select
          aria-label="Period"
          className="h-8 rounded border border-line bg-surface px-2 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
        </select>
      </div>
      {q.isPending ? (
        <Bone className="mt-4 h-40 w-full" />
      ) : (
        <div
          className="mt-4 flex h-40 items-end gap-1"
          role="img"
          aria-label={`Views per day, last ${days} days, max ${Math.max(0, ...b.map((x) => x.views))}`}
        >
          {b.map((d) => (
            <div key={d.date} className="relative flex h-full flex-1 items-end" title={`${d.date}: ${d.views} views, ${d.reads} reads`}>
              <div className="w-full rounded-t bg-accent/30" style={{ height: `${d.h}%` }} />
              <div className="absolute bottom-0 w-full rounded-t bg-accent" style={{ height: `${d.r}%` }} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-accent/30" /> Views
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-accent" /> Reads
        </span>
      </p>
    </div>
  );
}

export function StatsPage({ post }: { post?: number | undefined }) {
  const q = useInfiniteQuery({
    queryKey: ["stats", "list"],
    queryFn: ({ pageParam, signal }) => studioRepository.stats(pageParam, signal),
    initialPageParam: { limit: 50 } as PageRequest,
    getNextPageParam: (l) => nextPageRequest(l.meta, 50),
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const [open, setOpen] = useState<number | undefined>(post);
  const t = totals(rows);
  return (
    <>
      <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">Stats</h1>
      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["Views", t.views],
            ["Reads", t.reads],
            ["Sparks", t.claps],
            ["Notes", t.comments],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded border border-line p-4">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{compact(v)}</dd>
          </div>
        ))}
      </dl>
      {q.isPending ? (
        <Bone className="mt-8 h-40 w-full" />
      ) : !rows.length ? (
        <EmptyState icon={BarChart3Icon} title="No stats yet." body="Ship a story to see how readers find it." />
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Stats per story</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-normal">Story</th>
                <th className="py-2 text-right font-normal">Views</th>
                <th className="py-2 text-right font-normal">Reads</th>
                <th className="py-2 text-right font-normal">Read ratio</th>
                <th className="py-2 text-right font-normal">Sparks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.post_id}>
                  <tr className="border-b border-line">
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        aria-expanded={open === r.post_id}
                        onClick={() => setOpen(open === r.post_id ? undefined : r.post_id)}
                      >
                        {r.title}
                      </button>
                      <p className="text-xs text-muted">{shortDate(r.published_at)}</p>
                    </td>
                    <td className="py-3 text-right tabular-nums">{compact(r.views)}</td>
                    <td className="py-3 text-right tabular-nums">{compact(r.reads)}</td>
                    <td className="py-3 text-right tabular-nums">{pct(r.read_ratio)}</td>
                    <td className="py-3 text-right tabular-nums">{compact(r.claps)}</td>
                  </tr>
                  {open === r.post_id ? (
                    <tr>
                      <td colSpan={5} className="py-4">
                        <Daily id={r.post_id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <PinIcon className="size-3.5" aria-hidden /> Reads count readers who got through most of a story.
      </p>
    </>
  );
}
