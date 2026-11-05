import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileQuestionIcon, ListIcon, MailIcon, MoreHorizontalIcon, PenLineIcon, PinIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { followersQuery, useRelation } from "@/contexts/account/application/hooks";
import { userListsQuery } from "@/contexts/collections/application/hooks";
import { ListCard } from "@/contexts/collections/ui/Lists";
import { UserSeries } from "@/contexts/collections/ui/Series";
import { userDiagramsQuery } from "@/contexts/diagrams/application/hooks";
import { DiagramList } from "@/contexts/diagrams/ui/DiagramList";
import { FollowButton } from "@/contexts/engagement/ui/actions";
import { ReportDialog } from "@/contexts/engagement/ui/ReportDialog";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { postByIdQuery, profileQuery } from "@/contexts/reading/application/queries";
import { Feed } from "@/contexts/reading/ui/Feed";
import { PostCard } from "@/contexts/reading/ui/PostCard";
import { useHead } from "@/shared/head";
import { useT } from "@/shared/i18n";
import { compact, shortDate } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Lens, Modal } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";

type Tab = "home" | "lists" | "series" | "diagrams";
const item =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";

function People({ username, kind, onClose }: { username: string; kind: "followers" | "following" | null; onClose: () => void }) {
  const q = useInfiniteQuery({ ...followersQuery(username, kind ?? "followers"), enabled: !!kind });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Modal open={!!kind} onOpenChange={(o) => !o && onClose()} title={kind === "following" ? "Tracking" : "Readers"}>
      {q.isPending ? (
        <Bone className="h-16 w-full" />
      ) : rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={displayName(u)} src={u.avatar_url} />
              <span className="min-w-0 flex-1">
                <Link to="/@{$username}" params={{ username: u.username }} onClick={onClose} className="block truncate text-sm font-medium hover:underline">
                  <Bio>{displayName(u)}</Bio>
                </Link>
                <span className="block truncate font-mono text-[11px] text-muted">@{u.username}</span>
              </span>
              <FollowButton username={u.username} following={false} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[12px] text-muted">Nobody yet.</p>
      )}
      {q.hasNextPage ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => q.fetchNextPage()}>
          Show more
        </Button>
      ) : null}
    </Modal>
  );
}

function ProfileMenu({ username, userId }: { username: string; userId: number }) {
  const block = useRelation("block");
  const mute = useRelation("mute");
  const sub = useRelation("subscribe");
  const [report, setReport] = useState(false);
  const run = (m: typeof block, on: boolean, msg: string) =>
    requireAuth(() => m.mutate({ username, on }, { onSuccess: () => toast.ok(msg), onError: toast.error }))();
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost-icon" aria-label="More options">
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="menu-pop z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card p-1 shadow-[3px_3px_0_0_var(--fg)]"
          >
            <DropdownMenu.Item className={item} onSelect={() => run(sub, true, `You'll get an email when ${username} publishes.`)}>
              <MailIcon aria-hidden /> Get email updates
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => run(sub, false, "Email updates off.")}>
              Stop email updates
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item className={item} onSelect={() => run(mute, true, `Muted ${username}.`)}>
              Mute {username}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => run(block, true, `Blocked ${username}.`)}>
              Block {username}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${item} text-danger data-[highlighted]:bg-danger data-[highlighted]:text-surface`}
              onSelect={requireAuth(() => setReport(true))}
            >
              Report account…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ReportDialog target={report ? { type: "user", id: userId } : null} onClose={() => setReport(false)} />
    </>
  );
}

function Pinned({ id }: { id: number }) {
  const q = useQuery(postByIdQuery(id));
  if (!q.data) return null;
  return (
    <div className="mb-6">
      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
        <PinIcon className="size-3.5" aria-hidden /> Pinned
      </p>
      <PostCard post={q.data} />
    </div>
  );
}

function UserLists({ username }: { username: string }) {
  const q = useInfiniteQuery(userListsQuery(username));
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Bone className="mt-6 h-20 w-full" />;
  return rows.length ? (
    <ul>
      {rows.map((l) => (
        <ListCard key={l.id} l={l} />
      ))}
    </ul>
  ) : (
    <EmptyState icon={ListIcon} code="0 · lists" title="No public lists." />
  );
}

export function ProfilePage({ username }: { username: string }) {
  const q = useQuery(profileQuery(username));
  const t = useT();
  const { me } = useMe();
  useHead({
    title: q.data ? q.data.display_name || q.data.username : undefined,
    description: q.data?.bio || undefined,
    canonical: `/@${username}`,
    image: q.data?.avatar_url || undefined,
    type: "profile",
  });
  const [tab, setTab] = useState<Tab>("home");
  const [people, setPeople] = useState<"followers" | "following" | null>(null);
  if (q.isPending)
    return (
      <Loading>
        <div className="mx-auto max-w-feed space-y-4 px-4 pt-14">
          <Bone className="size-30 rounded-[var(--radius-md)]" />
          <Bone className="h-12 w-2/3" />
          <Bone className="h-6 w-1/3" />
        </div>
      </Loading>
    );
  if (q.isError) return <EmptyState icon={FileQuestionIcon} code="404 · not found" title="This account doesn't exist." />;
  const p = q.data;
  const name = displayName(p);
  const own = me?.username === p.username;
  const pinned = p.pinned_post_id;
  const follow = own ? (
    <Button variant="outline" size="sm" asChild>
      <Link to="/me/settings">Edit profile</Link>
    </Button>
  ) : (
    <>
      <FollowButton key={String(p.is_following)} username={p.username} following={p.is_following} variant="outline" />
      <ProfileMenu username={p.username} userId={p.id} />
    </>
  );
  const stat = "bg-card";
  const statBody = "flex w-full flex-col items-start gap-1 px-4 py-3 text-left";
  const statNum = "font-mono text-2xl tabular-nums";
  const dt = (n: string, label: string) => (
    <dt className="kicker">
      <span aria-hidden className="mr-1.5">
        {n}
      </span>
      {label}
    </dt>
  );
  return (
    <div>
      <header className="mx-auto max-w-shell px-4 pt-10 md:px-6">
        <div className="tile overflow-hidden">
          <p className="tile-head">
            <span className="min-w-0 truncate">Profile / @{p.username}</span>
            <span className="ml-auto shrink-0">joined {shortDate(p.created_at)}</span>
          </p>
          <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <Avatar name={name} src={p.avatar_url} size="2xl" />
            <div className="min-w-0">
              <h1 className="font-display text-[32px] leading-9 font-extrabold tracking-[-0.03em] break-words">
                <Bio>{name}</Bio>
              </h1>
              {p.bio ? (
                <p className="mt-2 max-w-prose text-[15px] leading-6 text-muted">
                  <Bio>{p.bio}</Bio>
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">{follow}</div>
          </div>
          <dl className="grid grid-cols-3 gap-px border-t border-line bg-line">
            <div className={`${stat} ${statBody}`}>
              {dt("01", "Stories")}
              <dd className={statNum}>{compact(p.posts)}</dd>
            </div>
            <div className={`${stat} ${statBody} relative hover:bg-surface-2`}>
              {dt("02", "Readers")}
              <dd>
                <button
                  type="button"
                  className={`${statNum} after:absolute after:inset-0`}
                  aria-label={`${compact(p.followers)} readers, show list`}
                  onClick={() => setPeople("followers")}
                >
                  {compact(p.followers)}
                </button>
              </dd>
            </div>
            <div className={`${stat} ${statBody} relative hover:bg-surface-2`}>
              {dt("03", "Tracking")}
              <dd>
                <button
                  type="button"
                  className={`${statNum} after:absolute after:inset-0`}
                  aria-label={`${compact(p.following)} tracking, show list`}
                  onClick={() => setPeople("following")}
                >
                  {compact(p.following)}
                </button>
              </dd>
            </div>
          </dl>
        </div>
      </header>
      <main id="main" className="mx-auto min-w-0 max-w-feed px-4 pb-24 md:px-0">
        <div className="sticky top-14 z-30 -mx-4 mt-8 mb-3 border-b border-line bg-surface px-4 py-3 md:mx-0 md:px-0">
          <Lens
            label="Profile section"
            value={tab}
            onChange={setTab}
            items={[
              ["home", "Writing"],
              ["lists", "Lists"],
              ["series", "Series"],
              ["diagrams", t("dg.tab")],
            ]}
          />
        </div>
        {tab === "home" ? (
          <>
            {pinned ? <Pinned id={pinned} /> : null}
            <Feed source={{ kind: "user", username: p.username }} empty={{ icon: PenLineIcon, title: `${name} hasn't published any stories yet.` }} />
          </>
        ) : tab === "lists" ? (
          <UserLists username={p.username} />
        ) : tab === "series" ? (
          <UserSeries username={p.username} />
        ) : (
          <DiagramList query={userDiagramsQuery(p.username)} empty={{ title: t("dg.profile.empty", { name }) }} />
        )}
      </main>
      <People username={p.username} kind={people} onClose={() => setPeople(null)} />
    </div>
  );
}
