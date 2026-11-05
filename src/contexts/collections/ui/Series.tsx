import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, LayersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { postSeriesQuery, seriesQuery, userSeriesQuery, useSeriesMutations } from "../application/hooks";
import { move, type Series, seriesInputSchema } from "../domain/collections";

const partHref = (author: string, slug: string) => postPath({ author, slug });

/** Series box under an article: position, prev/next and all parts. */
export function SeriesNav({ postId, author }: { postId: number; author: string }) {
  const q = useQuery(postSeriesQuery(postId));
  const p = q.data;
  if (!p?.series) return null;
  return (
    <nav aria-label="Series" className="mt-10 rounded border border-line p-5">
      <p className="text-xs tracking-wide text-muted uppercase">
        Series · Part {p.position} of {p.parts.length || p.series.parts}
      </p>
      <Link to="/series/$slug" params={{ slug: p.series.slug }} className="mt-1 block text-lg font-bold hover:underline">
        {p.series.title}
      </Link>
      <ol className="mt-3 space-y-1 text-sm">
        {p.parts.map((x) => (
          <li key={x.post_id} className={cn(x.post_id === postId && "font-semibold")}>
            {x.post_id === postId ? (
              <span aria-current="page">
                {x.position}. {x.title}
              </span>
            ) : (
              <a href={partHref(author, x.slug)} className="text-muted hover:text-fg hover:underline">
                {x.position}. {x.title}
              </a>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-between text-sm">
        {p.prev ? (
          <a href={partHref(author, p.prev.slug)} className="flex items-center gap-1 hover:underline">
            <ChevronLeftIcon className="size-4" aria-hidden /> {p.prev.title}
          </a>
        ) : (
          <span />
        )}
        {p.next ? (
          <a href={partHref(author, p.next.slug)} className="flex items-center gap-1 hover:underline">
            {p.next.title} <ChevronRightIcon className="size-4" aria-hidden />
          </a>
        ) : null}
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

function SeriesForm({ initial, onDone }: { initial?: Series; onDone: () => void }) {
  const m = useSeriesMutations();
  const mut = initial ? m.update : m.create;
  const f = useForm({ resolver: zodResolver(seriesInputSchema), defaultValues: { title: initial?.title ?? "", description: initial?.description ?? "" } });
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
