import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BuildingIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { Feed } from "@/contexts/reading/ui/Feed";
import { cn } from "@/shared/lib/cn";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Field, inputBoxCls, inputCls, ServerError } from "@/shared/ui/form";
import { Modal, Tabs } from "@/shared/ui/modal";
import { Bone, EmptyState } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { membersQuery, myPublicationsQuery, publicationQuery, usePublicationMutations } from "../application/hooks";
import { canManage, type Member, type Publication, publicationInputSchema, slugify } from "../domain/collections";

function PublicationForm({ initial, onDone }: { initial?: Publication; onDone: (p: Publication) => void }) {
  const m = usePublicationMutations();
  const mut = initial ? m.update : m.create;
  const f = useForm({
    resolver: zodResolver(publicationInputSchema),
    defaultValues: { slug: initial?.slug ?? "", name: initial?.name ?? "", description: initial?.description ?? "" },
  });
  const name = useWatch({ control: f.control, name: "name" });
  const e = f.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={f.handleSubmit((v) =>
        initial
          ? m.update.mutate({ slug: initial.slug, body: { name: v.name, description: v.description, avatar_url: initial.avatar_url } }, { onSuccess: onDone })
          : m.create.mutate(v, { onSuccess: onDone }),
      )}
    >
      <ServerError error={mut.error} />
      <Field label="Name" error={e.name?.message}>
        {(a) => (
          <input {...a} className={inputCls} {...f.register("name", { onBlur: () => !initial && !f.getValues("slug") && f.setValue("slug", slugify(name)) })} />
        )}
      </Field>
      <Field label="Address" error={e.slug?.message} hint={initial ? "The address can't change." : "iblog.app/pub/your-address"}>
        {(a) => <input {...a} className={inputCls} disabled={!!initial} {...f.register("slug")} />}
      </Field>
      <Field label="Description" error={e.description?.message}>
        {(a) => <textarea {...a} className={cn(inputCls, "h-20 py-2")} {...f.register("description")} />}
      </Field>
      <Button type="submit" variant="accent" loading={mut.isPending}>
        {initial ? "Save" : "Create publication"}
      </Button>
    </form>
  );
}

function Members({ pub }: { pub: Publication }) {
  const q = useQuery(membersQuery(pub.slug));
  const { me } = useMe();
  const m = usePublicationMutations();
  const [u, setU] = useState("");
  const [role, setRole] = useState<"editor" | "writer">("writer");
  const manager = pub.my_role === "owner" || pub.my_role === "editor";
  const roleOf = (x: Member) => x.role;
  return (
    <div className="py-6">
      {manager ? (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (u.trim())
              m.setMember.mutate(
                { slug: pub.slug, u: u.trim().replace(/^@/, ""), role },
                {
                  onSuccess: () => {
                    setU("");
                    toast.ok("Member added");
                  },
                  onError: toast.error,
                },
              );
          }}
        >
          <label className="min-w-48 flex-1 text-sm">
            Username
            <input className={cn(inputBoxCls, "mt-1")} value={u} onChange={(e) => setU(e.target.value)} placeholder="@username" />
          </label>
          <label className="text-sm">
            Role
            <select className={cn(inputBoxCls, "mt-1 w-32")} value={role} onChange={(e) => setRole(e.target.value as "editor" | "writer")}>
              <option value="writer">Writer</option>
              {pub.my_role === "owner" ? <option value="editor">Editor</option> : null}
            </select>
          </label>
          <Button type="submit" variant="outline" loading={m.setMember.isPending}>
            Add
          </Button>
        </form>
      ) : null}
      {q.isPending ? (
        <Bone className="h-16 w-full" />
      ) : (
        <ul className="space-y-3">
          {q.data?.map((x) => (
            <li key={x.user_id} className="flex items-center gap-3">
              <Avatar name={displayName(x)} src={x.avatar_url} />
              <Link to="/@{$username}" params={{ username: x.username }} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {displayName(x)}
              </Link>
              {canManage(pub.my_role, roleOf(x)) ? (
                <>
                  <select
                    aria-label={`Role of ${x.username}`}
                    className="h-9 rounded border border-line bg-surface px-2 text-sm"
                    value={x.role}
                    onChange={(e) =>
                      m.setMember.mutate({ slug: pub.slug, u: x.username, role: e.target.value as "editor" | "writer" }, { onError: toast.error })
                    }
                  >
                    <option value="writer">Writer</option>
                    {pub.my_role === "owner" ? <option value="editor">Editor</option> : null}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => m.removeMember.mutate({ slug: pub.slug, u: x.username }, { onError: toast.error })}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted capitalize">{x.role}</span>
              )}
              {me?.id === x.user_id && x.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => confirm("Leave this publication?") && m.removeMember.mutate({ slug: pub.slug, u: x.username })}
                >
                  Leave
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PublicationPage({ slug }: { slug: string }) {
  const q = useQuery(publicationQuery(slug));
  const [tab, setTab] = useState<"stories" | "people">("stories");
  const [editing, setEditing] = useState(false);
  const { remove } = usePublicationMutations();
  const nav = useNavigate();
  if (q.isPending) return <Bone className="h-24 w-full" />;
  if (q.isError) return <EmptyState icon={BuildingIcon} title="This publication doesn't exist." />;
  const p = q.data;
  return (
    <>
      <header className="flex items-center gap-5 py-6">
        <Avatar name={p.name} src={p.avatar_url} size="xl" className="rounded-md" />
        <div className="min-w-0">
          <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight">{p.name}</h1>
          {p.description ? (
            <p className="mt-1 font-serif text-muted">
              <Bio>{p.description}</Bio>
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-muted">
            {p.members} members · {p.posts} stories
          </p>
        </div>
      </header>
      {p.my_role === "owner" || p.my_role === "editor" ? (
        <div className="mb-4 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {p.my_role === "owner" ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() =>
                confirm("Delete this publication? Stories stay with their writers.") &&
                remove.mutate(p.slug, { onSuccess: () => nav({ to: "/me/publications" }) })
              }
            >
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ["stories", "Stories"],
          ["people", "People"],
        ]}
      />
      {tab === "stories" ? <Feed source={{ kind: "publication", slug: p.slug }} empty={{ title: "No stories published here yet." }} /> : <Members pub={p} />}
      <Modal open={editing} onOpenChange={setEditing} title="Edit publication">
        <PublicationForm initial={p} onDone={() => setEditing(false)} />
      </Modal>
    </>
  );
}

export function MyPublications() {
  const q = useQuery(myPublicationsQuery());
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  return (
    <>
      <div className="flex items-end justify-between">
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">Publications</h1>
        <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
          New publication
        </Button>
      </div>
      {q.isPending ? (
        <Bone className="mt-6 h-20 w-full" />
      ) : q.data?.length ? (
        <ul className="mt-6 border-t border-line">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center gap-4 border-b border-line py-5">
              <Avatar name={p.name} src={p.avatar_url} size="lg" className="rounded-md" />
              <div className="min-w-0 flex-1">
                <Link to="/pub/$slug" params={{ slug: p.slug }} className="text-lg font-bold hover:underline">
                  {p.name}
                </Link>
                <p className="text-[13px] text-muted capitalize">
                  {p.my_role} · {p.members} members
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={UsersIcon} title="You're not in any publication." body="Start a team blog and invite writers and editors." />
      )}
      <Modal open={creating} onOpenChange={setCreating} title="New publication">
        <PublicationForm
          onDone={(p) => {
            setCreating(false);
            nav({ to: "/pub/$slug", params: { slug: p.slug } });
          }}
        />
      </Modal>
    </>
  );
}
