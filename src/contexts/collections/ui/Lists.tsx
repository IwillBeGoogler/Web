import { zodResolver } from "@hookform/resolvers/zod";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookmarkPlusIcon, LockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { PostCard } from "@/contexts/reading/ui/PostCard";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Field, inputCls, ServerError } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone, EmptyState } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { listPostsQuery, listQuery, myListsQuery, useListMutations } from "../application/hooks";
import { type ListInput, listInputSchema, type ReadingList } from "../domain/collections";

export function ListForm({ initial, onDone }: { initial?: ReadingList; onDone: (l: ReadingList) => void }) {
  const m = useListMutations();
  const mut = initial ? m.update : m.create;
  const f = useForm<ListInput>({
    resolver: zodResolver(listInputSchema),
    defaultValues: { name: initial?.name ?? "", description: initial?.description ?? "", private: initial?.private ?? false },
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit((v) =>
        initial ? m.update.mutate({ slug: initial.slug, body: v }, { onSuccess: onDone }) : m.create.mutate(v, { onSuccess: onDone }),
      )}
    >
      <ServerError error={mut.error} />
      <Field label="Name" error={f.formState.errors.name?.message}>
        {(a) => <input {...a} className={inputCls} {...f.register("name")} />}
      </Field>
      <Field label="Description (optional)" error={f.formState.errors.description?.message}>
        {(a) => <textarea {...a} className={cn(inputCls, "h-20 py-2")} {...f.register("description")} />}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" {...f.register("private")} /> Make it private
      </label>
      <Button type="submit" variant="accent" loading={mut.isPending}>
        {initial ? "Save" : "Create"}
      </Button>
    </form>
  );
}

/** "Save to list" for an article: checkboxes for each list, plus create. */
export function SaveToList({ postId }: { postId: number }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const q = useInfiniteQuery({ ...myListsQuery(postId), enabled: open && !!me });
  const { setPost } = useListMutations();
  const lists = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <button type="button" className="key" aria-label="Add to list" onClick={requireAuth(() => setOpen(true))}>
        <BookmarkPlusIcon className="size-4" aria-hidden strokeWidth={1.5} />
        <span aria-hidden className="hidden tracking-[0.08em] uppercase sm:inline">
          List
        </span>
      </button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setCreating(false);
        }}
        title="Save to list"
      >
        {creating ? (
          <ListForm
            onDone={(l) => {
              setPost.mutate({ slug: l.slug, postId, on: true });
              setCreating(false);
            }}
          />
        ) : (
          <>
            {q.isPending ? (
              <Bone className="h-20 w-full" />
            ) : (
              <ul className="space-y-3">
                {lists.map((l) => (
                  <li key={l.id}>
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        defaultChecked={!!l.contains}
                        onChange={(e) => setPost.mutate({ slug: l.slug, postId, on: e.target.checked }, { onError: toast.error })}
                      />
                      <span className="flex-1">{l.name}</span>
                      {l.private ? <LockIcon className="size-4 text-muted" aria-label="Private" /> : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="link" className="mt-5" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" aria-hidden /> Create new list
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}

export function ListCard({ l }: { l: ReadingList }) {
  return (
    <li className="border-b border-line py-5">
      <Link to="/lists/$slug" params={{ slug: l.slug }} className="block hover:underline">
        <h2 className="text-xl font-bold">{l.name}</h2>
      </Link>
      {l.description ? (
        <p className="mt-1 line-clamp-2 font-serif text-muted">
          <Bio>{l.description}</Bio>
        </p>
      ) : null}
      <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
        {l.posts} {l.posts === 1 ? "story" : "stories"} {l.private ? <LockIcon className="size-3.5" aria-label="Private" /> : null}
      </p>
    </li>
  );
}

export function MyLists() {
  const q = useInfiniteQuery(myListsQuery());
  const [creating, setCreating] = useState(false);
  const lists = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="flex justify-end pt-4">
        <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
          New list
        </Button>
      </div>
      {q.isPending ? (
        <Bone className="mt-6 h-20 w-full" />
      ) : lists.length ? (
        <ul>
          {lists.map((l) => (
            <ListCard key={l.id} l={l} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={BookmarkPlusIcon} title="No lists yet." body="Group stories you love into lists." />
      )}
      <Modal open={creating} onOpenChange={setCreating} title="Create new list">
        <ListForm onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}

export function ListPage({ slug }: { slug: string }) {
  const q = useQuery(listQuery(slug));
  const posts = useInfiniteQuery(listPostsQuery(slug));
  const { me } = useMe();
  const { remove, setPost } = useListMutations();
  const [editing, setEditing] = useState(false);
  const nav = useNavigate();
  if (q.isPending) return <Bone className="h-24 w-full" />;
  if (q.isError) return <EmptyState icon={LockIcon} title="This list doesn't exist or is private." />;
  const l = q.data;
  const own = me?.id === l.user_id;
  const rows = posts.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <p className="text-sm text-muted">
        {l.owner ? (
          <Link to="/@{$username}" params={{ username: l.owner }} className="hover:underline">
            {l.owner}
          </Link>
        ) : null}{" "}
        · {l.posts} stories {l.private ? "· Private" : ""}
      </p>
      <h1 className="mt-2 font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">{l.name}</h1>
      {l.description ? (
        <p className="mt-3 font-serif text-lg text-muted">
          <Bio>{l.description}</Bio>
        </p>
      ) : null}
      {own ? (
        <div className="mt-4 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit list
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={() => confirm("Delete this list? Stories stay.") && remove.mutate(l.slug, { onSuccess: () => nav({ to: "/me/library" }) })}
          >
            Delete
          </Button>
        </div>
      ) : null}
      <div className="mt-6 border-t border-line">
        {rows.length ? (
          rows.map((p) => (
            <div key={p.id} className="relative">
              <PostCard post={p} />
              {own ? (
                <Button variant="ghost" size="sm" className="absolute top-5 right-0" onClick={() => setPost.mutate({ slug: l.slug, postId: p.id, on: false })}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))
        ) : posts.isPending ? (
          <Bone className="mt-6 h-24 w-full" />
        ) : (
          <p className="py-12 text-center text-muted">No stories in this list yet.</p>
        )}
      </div>
      <Modal open={editing} onOpenChange={setEditing} title="Edit list">
        <ListForm initial={l} onDone={() => setEditing(false)} />
      </Modal>
    </>
  );
}
