import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowBigUpIcon, CornerDownRightIcon, FlagIcon, MessageSquareIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { timeAgo } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Bone, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { commentsQuery, useComment, useDeleteComment, useEditComment, useLikeComment } from "../application/hooks";
import { useLiveComments } from "../application/realtime";
import { type CommentNode, threadComments } from "../domain/engagement";
import type { ReportTarget } from "../domain/report";
import { ReportDialog } from "./ReportDialog";

const pad4 = (n: number) => String(n).padStart(4, "0");
const keyCls = "key h-8 px-2.5";
const editBox = "rounded-[var(--radius-sm)] border border-line-strong bg-card focus-within:border-fg focus-within:shadow-[2px_2px_0_0_var(--fg)]";

function Composer({ postId, parentId, onDone, autoFocus }: { postId: number; parentId?: number; onDone?: () => void; autoFocus?: boolean }) {
  const { me } = useMe();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(!!autoFocus);
  const send = useComment(postId);
  if (!me)
    return (
      <button
        type="button"
        onClick={() => authDialog.open("signin")}
        className="flex h-11 w-full items-center justify-between rounded-[var(--radius-sm)] border border-dashed border-line-strong px-3 font-mono text-[12px] text-muted transition-colors hover:border-fg hover:text-fg"
      >
        Add a note to the discussion…
        <span className="kbd" aria-hidden>
          ↵
        </span>
      </button>
    );
  const trimmed = text.trim();
  const submit = () =>
    trimmed &&
    !send.isPending &&
    send.mutate(
      { text: trimmed, ...(parentId ? { parent_id: parentId } : {}) },
      {
        onSuccess: () => {
          setText("");
          setOpen(false);
          onDone?.();
        },
        onError: toast.error,
      },
    );
  return (
    <div className={editBox}>
      {open ? (
        <div className="tile-head rounded-t-[calc(var(--radius-sm)-1px)] normal-case tracking-normal">
          <Avatar name={displayName(me)} src={me.avatar_url} size="xs" />
          <span className="truncate text-fg">@{me.username}</span>
          <span className="idx ml-auto">{text.length}/5000</span>
        </div>
      ) : null}
      <textarea
        aria-label={parentId ? "Write a reply" : "Write a note"}
        placeholder="Add a note to the discussion…"
        value={text}
        maxLength={5000}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        className={`block w-full resize-none bg-transparent px-3 py-2 font-sans text-[15px] outline-none ${open ? "min-h-24" : "h-10"}`}
      />
      {open ? (
        <div className="flex justify-end gap-2 border-t border-line p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText("");
              setOpen(false);
              onDone?.();
            }}
          >
            Cancel
          </Button>
          <Button variant="accent" size="sm" disabled={!trimmed} loading={send.isPending} onClick={submit}>
            Post note
            <kbd className="kbd border-on-inverse/30 bg-transparent text-on-inverse/70" aria-hidden>
              ⌘↵
            </kbd>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Item({ c, postId, depth = 0, n, onReport }: { c: CommentNode; postId: number; depth?: number; n?: number; onReport: (t: ReportTarget) => void }) {
  const { me } = useMe();
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const del = useDeleteComment(postId);
  const edit = useEditComment(postId);
  const like = useLikeComment(postId);
  const mine = !!me && me.id === c.user_id;
  const author = c.author || "Anonymous";
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-muted">
        <Avatar name={author} size="sm" />
        <span className="truncate font-medium text-fg">@{author}</span>
        <span aria-hidden>·</span>
        <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time>
        {c.edited_at ? <span className="tag-count">(edited)</span> : null}
      </div>
      {editing !== null ? (
        <div className={`mt-3 ${editBox}`}>
          <textarea
            aria-label="Edit response"
            className="block min-h-20 w-full resize-y bg-transparent px-3 py-2 font-sans text-[15px] outline-none"
            maxLength={5000}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
          />
          <div className="flex justify-end gap-2 border-t border-line p-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={!editing.trim()}
              loading={edit.isPending}
              onClick={() => edit.mutate({ id: c.id, text: editing.trim() }, { onSuccess: () => setEditing(null), onError: toast.error })}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 font-sans text-[15px] leading-6 break-words whitespace-pre-wrap">
          <Bio>{c.text}</Bio>
        </p>
      )}
      <div className="mt-3 inline-flex max-w-full flex-wrap divide-x divide-line overflow-hidden rounded-[var(--radius-sm)] border border-line-strong">
        <button
          type="button"
          className={keyCls}
          aria-pressed={c.liked}
          aria-label={`Like response, ${c.likes} likes`}
          onClick={() => (me ? like.mutate({ id: c.id, on: !c.liked }) : authDialog.open("signin"))}
        >
          <ArrowBigUpIcon className={`size-4 ${c.liked ? "fill-current text-fg" : ""}`} aria-hidden />
          <span className="tag-count">{c.likes}</span>
        </button>
        {depth === 0 ? (
          <button type="button" className={`${keyCls} uppercase tracking-[0.08em]`} onClick={() => (me ? setReplying(true) : authDialog.open("signin"))}>
            <CornerDownRightIcon className="size-3.5" aria-hidden />
            Reply
          </button>
        ) : null}
        {c.replies.length ? (
          <button type="button" className={keyCls} onClick={() => setShowReplies(!showReplies)} aria-expanded={showReplies}>
            <MessageSquareIcon className="size-3.5" aria-hidden />
            {c.replies.length} {c.replies.length === 1 ? "reply" : "replies"}
          </button>
        ) : null}
        {mine ? (
          <>
            <button type="button" aria-label="Edit response" className={`${keyCls} size-8 justify-center px-0`} onClick={() => setEditing(c.text)}>
              <PencilIcon className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Delete response"
              className={`${keyCls} size-8 justify-center px-0 hover:text-danger`}
              onClick={() => confirm("Delete this response?") && del.mutate(c.id, { onError: toast.error })}
            >
              <Trash2Icon className="size-3.5" aria-hidden />
            </button>
          </>
        ) : me ? (
          <button
            type="button"
            aria-label="Report response"
            className={`${keyCls} size-8 justify-center px-0 hover:text-danger`}
            onClick={() => onReport({ type: "comment", id: c.id })}
          >
            <FlagIcon className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {replying ? (
        <div className="mt-3">
          <Composer postId={postId} parentId={c.id} autoFocus onDone={() => setReplying(false)} />
        </div>
      ) : null}
      {showReplies && c.replies.length ? (
        <ul className="mt-3 border-l-2 border-dashed border-line-strong pl-4">
          {flattenReplies(c.replies).map((r) => (
            <Item key={r.id} c={{ ...r, replies: [] }} postId={postId} depth={1} onReport={onReport} />
          ))}
        </ul>
      ) : null}
    </>
  );
  if (depth) return <li className="py-3">{body}</li>;
  return (
    <li className="grid grid-cols-[3rem_1fr] border-b border-line last:border-b-0">
      <span aria-hidden className="idx pt-4 pl-3 text-[11px]">
        {pad4(n ?? 1)}
      </span>
      <div className="min-w-0 py-4 pr-4">{body}</div>
    </li>
  );
}

/** Replies nest one level; deeper replies are listed flat under the thread. */
const flattenReplies = (rs: CommentNode[]): CommentNode[] => rs.flatMap((r) => [r, ...flattenReplies(r.replies)]);

export function Responses({ postId, count, open, onOpenChange }: { postId: number; count: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(open);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setSeen(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!open) return;
    setSeen(true);
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    onOpenChange(false);
  }, [open, onOpenChange]);
  const live = open || seen;
  const q = useInfiniteQuery({ ...commentsQuery(postId), enabled: live });
  const tree = threadComments(q.data?.pages.flatMap((p) => p.items) ?? []);
  const [report, setReport] = useState<ReportTarget | null>(null);
  useLiveComments(postId, live);
  return (
    <section ref={ref} id="discussion" aria-labelledby="discussion-title" className="scroll-mt-24 pt-4">
      <div className="flex h-11 items-center justify-between gap-4 rounded-t-[var(--radius-md)] border border-line-strong bg-surface-2 px-4">
        <h2 id="discussion-title" className="font-display text-base font-bold tracking-tight">
          Discussion
        </h2>
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase tabular-nums">
          {count} {count === 1 ? "note" : "notes"}
        </span>
      </div>
      <div className="rounded-b-[var(--radius-md)] border border-t-0 border-line-strong bg-card">
        <div className="border-b border-line p-3">
          <Composer postId={postId} />
        </div>
        {!live || q.isPending ? (
          <Loading>
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Bone key={i} className="h-16 w-full" />
              ))}
            </div>
          </Loading>
        ) : q.isError ? (
          <div className="flex items-center justify-between gap-3 p-4 font-mono text-[12px] text-muted">
            ERR · Couldn't load the discussion.
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              Try again
            </Button>
          </div>
        ) : tree.length ? (
          <ul>
            {tree.map((c, i) => (
              <Item key={c.id} c={c} n={i + 1} postId={postId} onReport={setReport} />
            ))}
          </ul>
        ) : (
          <p className="p-8 text-center font-mono text-[12px] text-muted">0 notes. Start the discussion.</p>
        )}
      </div>
      <ReportDialog target={report} onClose={() => setReport(null)} />
    </section>
  );
}
