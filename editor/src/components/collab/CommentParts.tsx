import { useMemo, useRef, useState } from 'react';
import { initials } from '../../api/session';
import type { Member } from '../../api/types';
import { activeMentionQuery, insertMention, mentionCandidates, renderBody } from '../../comments/logic';
import { colorForUser } from '../../collab/presenceMath';
import { formatRelative } from '../../lib/home';
import { t } from '../../i18n';

export function CommentAvatar({ id, name, size = 22 }: { id: string; name: string; size?: number }) {
  return <span className="avatar comment-avatar" style={{ background: colorForUser(id), width: size, height: size }} title={name}>{initials(name)}</span>;
}

/** a comment text with @mentions drawn as chips (mentions of ME are emphasised) */
export function CommentBody({ body, meId }: { body: string; meId: string | null }) {
  return (
    <p className="comment-text">
      {renderBody(body).map((p, i) =>
        'text' in p ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} className={`mention-chip${p.mention.id === meId ? ' me' : ''}`} data-user={p.mention.id}>@{p.mention.name}</span>
        ),
      )}
    </p>
  );
}

export const timeAgo = (t: number): string => formatRelative(t);

interface ComposerProps {
  placeholder: string;
  submitLabel: string;
  members: Member[];
  meId: string | null;
  autoFocus?: boolean;
  initial?: string;
  onSubmit: (body: string) => Promise<unknown> | void;
  onCancel?: () => void;
}
/** textarea with @-autocomplete of the project's members (↑ ↓ Enter / Tab pick, Esc closes); ⌘/Ctrl+Enter or the button sends */
export function Composer({ placeholder, submitLabel, members, meId, autoFocus, initial = '', onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState(initial);
  const [caret, setCaret] = useState(initial.length);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const q = activeMentionQuery(text, caret);
  const list = useMemo(() => (q ? mentionCandidates(members, q.query, meId) : []), [q, members, meId]);
  const open = !!q && list.length > 0;

  const choose = (m: Member) => {
    if (!q) return;
    const r = insertMention(text, q, { id: m.userId, name: m.name });
    setText(r.text);
    setCaret(r.caret);
    setPick(0);
    queueMicrotask(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(r.caret, r.caret);
    });
  };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setText('');
      setCaret(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not send'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="composer">
      <textarea
        ref={ta}
        value={text}
        rows={2}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        data-autofocus={autoFocus ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setPick(0);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          e.stopPropagation(); // typing here must never reach the canvas shortcuts
          if (open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => Math.min(list.length - 1, p + 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => Math.max(0, p - 1)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(list[pick]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setCaret(-1); return; }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          else if (e.key === 'Escape') onCancel?.();
        }}
      />
      {open && (
        <ul className="mention-list" role="listbox" aria-label={t('Mention a member')}>
          {list.map((m, i) => (
            <li key={m.userId} role="option" aria-selected={i === pick} className={i === pick ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(m); }}>
              <CommentAvatar id={m.userId} name={m.name} size={18} />
              <span>{m.name}</span>
              <span className="muted">{m.email}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="composer-error" role="alert">{error}</p>}
      <div className="composer-foot">
        <span className="muted composer-hint">{t('@ to mention · ⌘↵ to send')}</span>
        <span className="spacer" />
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button>}
        <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => void send()}>{submitLabel}</button>
      </div>
    </div>
  );
}
