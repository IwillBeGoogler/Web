import { Check, CornerDownRight, MessageSquare, RotateCcw, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useSession } from '../../api/session';
import type { ApiComment, CommentThread } from '../../api/types';
import { anchorPoint, filterThreads, threadCount, type CommentFilter } from '../../comments/logic';
import { useCommentsStore } from '../../comments/store';
import { canComment, type Role } from '../../lib/roles';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { useEditorSession } from '../../sync/status';
import { useWorkspace } from '../../workspace/store';
import { CommentAvatar, CommentBody, Composer, timeAgo } from './CommentParts';
import { t as tr } from '../../i18n';

const FILTERS: [CommentFilter, string][] = [['open', 'Open'], ['resolved', 'Resolved'], ['mine', 'Mine'], ['mentions', 'Mentions'], ['all', 'All']];

function Message({ c, meId, canEditIt, canDelete, onEdit, onDelete }: { c: ApiComment; meId: string | null; canEditIt: boolean; canDelete: boolean; onEdit: (body: string) => Promise<unknown>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="comment-msg" data-testid="comment-msg">
      <CommentAvatar id={c.author.id} name={c.author.name} />
      <div className="comment-main">
        <div className="comment-meta">
          <strong>{c.author.name}</strong>
          <span className="muted" title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}{c.updatedAt > c.createdAt + 1000 ? ` · ${tr('edited')}` : ''}</span>
          <span className="spacer" />
          {canEditIt && !editing && <button type="button" className="comment-act" onClick={() => setEditing(true)}>{tr('Edit')}</button>}
          {canDelete && <button type="button" className="comment-act" aria-label={tr('Delete comment')} title={tr('Delete')} onClick={onDelete}><Trash2 size={12} aria-hidden /></button>}
        </div>
        {editing ? (
          <Composer placeholder={tr('Edit comment')} submitLabel={tr('Save')} members={[]} meId={meId} initial={c.body} autoFocus onSubmit={async (b) => { await onEdit(b); setEditing(false); }} onCancel={() => setEditing(false)} />
        ) : (
          <CommentBody body={c.body} meId={meId} />
        )}
      </div>
    </div>
  );
}

function ThreadCard({ t, role, meId }: { t: CommentThread; role: Role; meId: string | null }) {
  const store = useCommentsStore();
  const members = useCommentsStore((s) => s.members);
  const active = useCommentsStore((s) => s.activeId) === t.root.id;
  const nodes = useDiagramStore((s) => s.nodes);
  const { setCenter, getZoom } = useReactFlow();
  const [replying, setReplying] = useState(false);
  const may = canComment(role);
  const isOwner = role === 'owner';
  const focus = () => {
    store.setActive(t.root.id);
    const p = t.root.anchor ? anchorPoint(t.root.anchor, nodes) : null;
    if (p) void setCenter(p.x, p.y, { zoom: Math.max(getZoom(), 0.8), duration: 250 });
  };
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : tr('Something went wrong'));
  const detached = t.root.anchor?.type === 'node' && !anchorPoint(t.root.anchor, nodes);
  return (
    <article className={`comment-thread${active ? ' active' : ''}${t.root.resolved ? ' resolved' : ''}`} data-testid="comment-thread" aria-label={tr('Comment thread by {name}', { name: t.root.author.name })}>
      <div className="comment-thread-head" onClick={focus} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && focus()}>
        {t.root.resolved ? <span className="comment-state done"><Check size={11} aria-hidden /> {tr('Resolved')}</span> : detached ? <span className="comment-state">{tr('Detached from its node')}</span> : <span className="comment-state"><MessageSquare size={11} aria-hidden /> {t.replies.length ? tr('{n} comments', { n: t.replies.length + 1 }) : tr('1 comment')}</span>}
      </div>
      <Message c={t.root} meId={meId} canEditIt={t.root.author.id === meId && may} canDelete={t.root.author.id === meId || isOwner} onEdit={(b) => store.edit(t.root.id, b).catch(fail)} onDelete={() => void store.remove(t.root.id).catch(fail)} />
      {t.replies.map((r) => (
        <Message key={r.id} c={r} meId={meId} canEditIt={r.author.id === meId && may} canDelete={r.author.id === meId || isOwner} onEdit={(b) => store.edit(r.id, b).catch(fail)} onDelete={() => void store.remove(r.id).catch(fail)} />
      ))}
      {may && (
        <div className="comment-actions">
          {replying ? (
            <Composer placeholder={tr('Reply…')} submitLabel={tr('Reply')} members={members} meId={meId} autoFocus onSubmit={async (b) => { await store.reply(t.root.id, b); setReplying(false); }} onCancel={() => setReplying(false)} />
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setReplying(true)}><CornerDownRight size={13} aria-hidden /> {tr('Reply')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => void store.resolve(t.root.id, !t.root.resolved).catch(fail)}>
                {t.root.resolved ? <><RotateCcw size={13} aria-hidden /> {tr('Reopen')}</> : <><Check size={13} aria-hidden /> {tr('Resolve')}</>}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** the comments of the open file: filter, jump to the pin, reply, resolve / reopen (commenters and up), delete your own */
export function CommentsPanel() {
  const open = useCommentsStore((s) => s.panelOpen);
  const threads = useCommentsStore((s) => s.threads);
  const filter = useCommentsStore((s) => s.filter);
  const meId = useSession((s) => s.user?.id ?? null);
  const role = useEditorSession((s) => s.role);
  const projectRole = useWorkspace((s) => s.role);
  const effective = role ?? projectRole;
  const shown = useMemo(() => filterThreads(threads, filter, meId), [threads, filter, meId]);
  if (!open) return null;
  return (
    <aside className="comments-panel glass" aria-label={tr('Comments')} data-testid="comments-panel">
      <header className="comments-head">
        <strong>{tr('Comments')}</strong>
        <span className="muted">{threadCount(threads)}</span>
        <span className="spacer" />
        {canComment(effective) && <span className="muted comments-tip">{tr('Press C, then click the canvas')}</span>}
        <button type="button" className="btn btn-icon btn-ghost" aria-label={tr('Close comments')} onClick={() => void useCommentsStore.getState().setPanel(false)}><X size={15} aria-hidden /></button>
      </header>
      <div className="seg comments-filters" role="group" aria-label={tr('Filter comments')}>
        {FILTERS.map(([f, label]) => (
          <button key={f} type="button" className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => useCommentsStore.getState().setFilter(f)}>{tr(label)}</button>
        ))}
      </div>
      <div className="comments-list">
        {shown.map((t) => <ThreadCard key={t.root.id} t={t} role={effective} meId={meId} />)}
        {shown.length === 0 && <p className="muted comments-empty">{threads.length === 0 ? tr('No comments yet.') : tr('Nothing matches this filter.')}</p>}
      </div>
    </aside>
  );
}
