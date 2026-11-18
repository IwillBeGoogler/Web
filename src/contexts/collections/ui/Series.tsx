import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ImageIcon, LayersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { useMe } from "@/contexts/identity/application/session";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { feedQuery } from "@/contexts/reading/application/queries";
import { postPath } from "@/contexts/reading/domain/post";
import { cn } from "@/shared/lib/cn";
import { shortDate } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Field, inputBoxCls, inputCls, ServerError } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone, EmptyState } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { postSeriesQuery, readingPathQuery, seriesQuery, userSeriesQuery, useSeriesMutations } from "../application/hooks";
import { byPublished, move, type Series, seriesInputSchema } from "../domain/collections";

const partHref = (author: string, slug: string) => postPath({ author, slug });

/** Read before / read next from the topic tree, for posts in no series
 * (series posts get prev/next in SeriesNav). */
export function ReadingPathNav({ postId }: { postId: number }) {
  const q = useQuery(readingPathQuery(postId));
  const p = q.data;
  if (!p || p.source !== "topic" || (!p.prev && !p.next)) return null;
  return (
    <nav aria-label="Reading path" className="mt-10 grid gap-3 sm:grid-cols-2">
      {p.prev ? (
        <a href={postPath({ author: p.prev.author, slug: p.prev.slug })} className="rounded border border-line p-4 hover:border-fg">
          <span className="flex items-center gap-1 text-xs tracking-wide text-muted uppercase">
            <ChevronLeftIcon className="size-4" aria-hidden /> Read before
          </span>
          <span className="mt-1 block font-semibold">{p.prev.title}</span>
        </a>
      ) : (
        <span className="hidden sm:block" />
      )}
      {p.next ? (
        <a href={postPath({ author: p.next.author, slug: p.next.slug })} className="rounded border border-line p-4 text-right hover:border-fg">
          <span className="flex items-center justify-end gap-1 text-xs tracking-wide text-muted uppercase">
            Read next <ChevronRightIcon className="size-4" aria-hidden />
          </span>
          <span className="mt-1 block font-semibold">{p.next.title}</span>
        </a>
      ) : null}
    </nav>
  );
}

/** Above an article's body: the part before this one, with a link to all parts. */
export function SeriesBefore({ postId, author }: { postId: number; author: string }) {
  const q = useQuery(postSeriesQuery(postId));
  const p = q.data;
  if (!p?.series || !p.prev) return null;
  return (
    <aside aria-label="Previous part" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded border border-line p-4">
      <a href={partHref(author, p.prev.slug)} className="min-w-0 flex-1 hover:underline">
        <span className="flex items-center gap-1 text-xs tracking-wide text-muted uppercase">
          <ChevronLeftIcon className="size-4" aria-hidden /> {p.series.title} · Previous part
        </span>
        <span className="mt-1 block truncate font-semibold">{p.prev.title}</span>
      </a>
      <Link to="/series/$slug" params={{ slug: p.series.slug }} className="shrink-0 text-sm font-semibold hover:underline">
        View all
      </Link>
    </aside>
  );
}

/** Series box under an article: position, the parts that come next, and a link to all parts. */
export function SeriesNav({ postId, author }: { postId: number; author: string }) {
  const q = useQuery(postSeriesQuery(postId));
  const p = q.data;
  if (!p?.series) return null;
  const upcoming = p.parts.filter((x) => x.position > p.position);
  return (
    <nav aria-label="Series" className="mt-10 rounded border border-line p-5">
      <p className="text-xs tracking-wide text-muted uppercase">
        Series · Part {p.position} of {p.parts.length || p.series.parts}
      </p>
      <Link to="/series/$slug" params={{ slug: p.series.slug }} className="mt-1 block text-lg font-bold hover:underline">
        {p.series.title}
      </Link>
      {upcoming.length ? (
        <>
          <p className="mt-4 text-xs tracking-wide text-muted uppercase">Next in this series</p>
          <ol className="mt-2 space-y-1 text-sm">
            {upcoming.map((x) => (
              <li key={x.post_id}>
                <a href={partHref(author, x.slug)} className="text-muted hover:text-fg hover:underline">
                  {x.position}. {x.title}
                </a>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">You've reached the last part.</p>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        {p.next ? (
          <a href={partHref(author, p.next.slug)} className="flex items-center gap-1 font-semibold hover:underline">
            {p.next.title} <ChevronRightIcon className="size-4" aria-hidden />
          </a>
        ) : (
          <span />
        )}
        <Link to="/series/$slug" params={{ slug: p.series.slug }} className="hover:underline">
          View all
        </Link>
      </div>
    </nav>
  );
}

export function SeriesPage({ slug }: { slug: string }) {
  const q = useQuery(seriesQuery(slug));
  if (q.isPending) return <Bone className="h-24 w-full" />;
  if (q.isError) return <EmptyState icon={LayersIcon} title="This series doesn't exist." />;
  const s = q.data;
  return (
    <>
      <p className="text-sm text-muted">
        Series by{" "}
        <Link to="/@{$username}" params={{ username: s.author }} className="hover:underline">
          {s.author}
        </Link>
      </p>
      <h1 className="mt-2 font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">{s.title}</h1>
      {s.cover_url ? (
        <img src={s.cover_url} alt="" className="mt-6 aspect-[16/9] w-full rounded-[var(--radius-md)] border border-line-strong object-cover" />
      ) : null}
      {s.description ? (
        <p className="mt-3 font-serif text-lg text-muted">
          <Bio>{s.description}</Bio>
        </p>
      ) : null}
      <ol className="mt-8 border-t border-line">
        {s.posts.map((p) => (
          <li key={p.post_id} className="flex gap-5 border-b border-line py-5">
            <span className="text-2xl font-bold text-line">{String(p.position).padStart(2, "0")}</span>
            <div>
              <a href={partHref(s.author, p.slug)} className="text-lg font-bold hover:underline">
                <Bio>{p.title}</Bio>
              </a>
              <p className="text-[13px] text-muted">{p.status === "published" ? shortDate(p.published_at) : <span className="capitalize">{p.status}</span>}</p>
            </div>
          </li>
        ))}
      </ol>
      {!s.posts.length ? <p className="py-12 text-center text-muted">No parts yet.</p> : null}
    </>
  );
}

const MAX_COVER = 5 * 1024 * 1024;

/** Cover picker: uploads to /uploads and hands back the stored URL. */
function CoverField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Cover image</span>
      <label
        className={cn(
          "flex aspect-[16/9] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-dashed border-line-strong p-4 text-center font-mono text-[12px] text-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
          value ? "p-0" : "hatch",
        )}
      >
        {value ? (
          <img src={value} alt="Series cover" className="size-full object-cover" />
        ) : (
          <>
            <ImageIcon className="mb-2 size-6" aria-hidden />
            {uploading ? "Uploading…" : "Choose an image (PNG, JPG, WebP, GIF · max 5 MB)"}
          </>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          disabled={uploading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > MAX_COVER) return setErr("Image must be 5 MB or smaller.");
            setErr("");
            setUploading(true);
            try {
              onChange(await engagementRepository.upload(file));
            } catch (x) {
              toast.error(x);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      {value ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange("")}>
          Remove cover
        </Button>
      ) : null}
      {err ? <p className="mt-2 font-mono text-[12px] text-danger">{err}</p> : null}
    </div>
  );
}

function SeriesForm({ initial, onDone }: { initial?: Series; onDone: () => void }) {
  const m = useSeriesMutations();
  const mut = initial ? m.update : m.create;
  const f = useForm({
    resolver: zodResolver(seriesInputSchema),
    defaultValues: { title: initial?.title ?? "", description: initial?.description ?? "", cover_url: initial?.cover_url ?? "" },
  });
  const cover = f.watch("cover_url");
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit((v) =>
        initial ? m.update.mutate({ slug: initial.slug, body: v }, { onSuccess: onDone }) : m.create.mutate(v, { onSuccess: onDone }),
      )}
    >
      <ServerError error={mut.error} />
      <Field label="Title" error={f.formState.errors.title?.message}>
        {(a) => <input {...a} className={inputCls} {...f.register("title")} />}
      </Field>
      <Field label="Description" error={f.formState.errors.description?.message}>
        {(a) => <textarea {...a} className={cn(inputCls, "h-20 py-2")} {...f.register("description")} />}
      </Field>
      <CoverField value={cover ?? ""} onChange={(url) => f.setValue("cover_url", url, { shouldDirty: true })} />
      <Button type="submit" variant="accent" loading={mut.isPending}>
        {initial ? "Save" : "Create series"}
      </Button>
    </form>
  );
}

function PartsEditor({ s, onDone }: { s: Series; onDone: () => void }) {
  const detail = useQuery(seriesQuery(s.slug));
  const mine = useInfiniteQuery(feedQuery({ kind: "mine", status: "published" }));
  const drafts = useInfiniteQuery(feedQuery({ kind: "mine", status: "draft" }));
  const { setPosts } = useSeriesMutations();
  const [ids, setIds] = useState<number[] | null>(null);
  const all = [...(mine.data?.pages.flatMap((p) => p.items) ?? []), ...(drafts.data?.pages.flatMap((p) => p.items) ?? [])];
  const title = (id: number) => all.find((p) => p.id === id)?.title ?? detail.data?.posts.find((p) => p.post_id === id)?.title ?? `#${id}`;
  const current = ids ?? detail.data?.posts.map((p) => p.post_id) ?? [];
  const available = all.filter((p) => !current.includes(p.id));
  return (
    <div className="space-y-5">
      <ol className="space-y-2">
        {current.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
            <span className="w-6 text-muted">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{title(id)}</span>
            <Button
              variant="ghost-icon"
              className="size-8 [&_svg]:size-4"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => setIds(move(current, i, i - 1))}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              variant="ghost-icon"
              className="size-8 [&_svg]:size-4"
              aria-label="Move down"
              disabled={i === current.length - 1}
              onClick={() => setIds(move(current, i, i + 1))}
            >
              <ArrowDownIcon aria-hidden />
            </Button>
            <Button variant="ghost-icon" className="size-8 [&_svg]:size-4" aria-label="Remove part" onClick={() => setIds(current.filter((x) => x !== id))}>
              <XIcon aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      {available.length ? (
        <label className="block text-sm">
          Add a story
          <select className={cn(inputBoxCls, "mt-1")} value="" onChange={(e) => e.target.value && setIds([...current, Number(e.target.value)])}>
            <option value="">Choose…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} {p.status !== "published" ? `(${p.status})` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {current.length > 1 ? (
        <Button
          variant="ghost"
          onClick={() =>
            setIds(byPublished(current, (id) => all.find((p) => p.id === id)?.published_at ?? detail.data?.posts.find((p) => p.post_id === id)?.published_at))
          }
        >
          Auto-order by publish date
        </Button>
      ) : null}
      <ServerError error={setPosts.error} />
      <Button
        variant="accent"
        loading={setPosts.isPending}
        onClick={() =>
          setPosts.mutate(
            { slug: s.slug, ids: current },
            {
              onSuccess: () => {
                toast.ok("Series saved");
                onDone();
              },
            },
          )
        }
      >
        Save order
      </Button>
    </div>
  );
}

/** Series manager on the Stories page. */
export function MySeries() {
  const { me } = useMe();
  const q = useQuery({ ...userSeriesQuery(me?.username ?? ""), enabled: !!me });
  const { remove } = useSeriesMutations();
  const [modal, setModal] = useState<{ kind: "new" } | { kind: "edit" | "parts"; s: Series } | null>(null);
  return (
    <>
      <div className="flex justify-end pt-4">
        <Button variant="accent" size="sm" onClick={() => setModal({ kind: "new" })}>
          New series
        </Button>
      </div>
      {q.isPending ? (
        <Bone className="mt-6 h-20 w-full" />
      ) : q.data?.length ? (
        <ul>
          {q.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line py-5">
              {s.cover_url ? (
                <img src={s.cover_url} alt="" className="aspect-[16/9] w-24 shrink-0 rounded-[var(--radius-sm)] border border-line object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link to="/series/$slug" params={{ slug: s.slug }} className="text-lg font-bold hover:underline">
                  {s.title}
                </Link>
                <p className="text-[13px] text-muted">{s.parts} parts</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setModal({ kind: "parts", s })}>
                Parts
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setModal({ kind: "edit", s })}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => confirm(`Delete “${s.title}”? Its stories stay.`) && remove.mutate(s.slug)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={LayersIcon} title="No series yet." body="Group stories into an ordered series readers can follow part by part." />
      )}
      <Modal
        open={!!modal}
        onOpenChange={(o) => !o && setModal(null)}
        title={modal?.kind === "parts" ? "Series parts" : modal?.kind === "edit" ? "Edit series" : "New series"}
      >
        {modal?.kind === "parts" ? (
          <PartsEditor s={modal.s} onDone={() => setModal(null)} />
        ) : modal ? (
          <SeriesForm initial={modal.kind === "edit" ? modal.s : undefined} onDone={() => setModal(null)} />
        ) : null}
      </Modal>
    </>
  );
}

export function UserSeries({ username }: { username: string }) {
  const q = useQuery(userSeriesQuery(username));
  if (q.isPending) return <Bone className="mt-6 h-20 w-full" />;
  if (!q.data?.length) return <p className="py-12 text-center text-muted">No series yet.</p>;
  return (
    <ul>
      {q.data.map((s) => (
        <li key={s.id} className="border-b border-line py-5">
          <Link to="/series/$slug" params={{ slug: s.slug }} className="text-lg font-bold hover:underline">
            {s.title}
          </Link>
          {s.description ? (
            <p className="mt-1 line-clamp-2 font-serif text-muted">
              <Bio>{s.description}</Bio>
            </p>
          ) : null}
          <p className="mt-1 text-[13px] text-muted">{s.parts} parts</p>
        </li>
      ))}
    </ul>
  );
}
