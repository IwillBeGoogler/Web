import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { initials, useSession } from '../../api/session';
import { colorForUser, type Collaborator } from '../../collab/presenceMath';
import { useCollabStore } from '../../collab/store';
import { isRole, roleLabel } from '../../lib/roles';
import { usePresence } from '../../sync/status';
import { t } from '../../i18n';

const STATUS_LABEL = { active: 'Active', idle: 'Idle', away: 'Away' } as const;

function follow(p: Collaborator): void {
  useCollabStore.getState().dispatchFollow({ type: 'start', clientId: p.clientId, rect: p.state.viewport });
}

/**
 * Who is in this file right now (live session): avatars in their colour (click = follow their view, click again or Esc = stop),
 * dimmed when idle / away, a ring while they speak, and a "Collaborators" popover with everybody, their role and audio state.
 */
export function CollabAvatars({ max = 4 }: { max?: number }) {
  const session = useCollabStore((s) => s.session);
  const people = useCollabStore((s) => s.people);
  const following = useCollabStore((s) => s.follow.following);
  const me = useSession((s) => s.user);
  const presence = usePresence((s) => s.users);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!session || !people.length) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const roleOf = (p: Collaborator) => {
    const r = presence.find((u) => u.userId && u.userId === p.user.id)?.role;
    return r && isRole(r) ? roleLabel(r) : null;
  };
  const audioText = (p: Collaborator) => {
    const a = p.state.audio;
    return a?.in ? (a.muted ? t('In audio · Muted') : a.speaking ? t('In audio · Speaking') : t('In audio')) : null;
  };
  return (
    <div className="presence collab-avatars" role="group" aria-label={t('{n} people here', { n: people.length + 1 })} ref={root}>
      {shown.map((p) => {
        const on = following === p.clientId;
        return (
          <button
            key={p.clientId}
            type="button"
            data-testid="collab-avatar"
            className={`avatar avatar-btn status-${p.status}${p.state.audio?.speaking ? ' speaking' : ''}${on ? ' following' : ''}`}
            style={{ background: p.user.color }}
            aria-label={on ? t('Stop following {name}', { name: p.user.name }) : t('Follow {name}', { name: p.user.name })}
            aria-pressed={on}
            title={`${p.user.name} · ${t(STATUS_LABEL[p.status]).toLowerCase()}${p.state.audio?.in ? ` · ${t('in audio')}` : ''} (${on ? t('stop following') : t('follow')})`}
            onClick={() => follow(p)}
          >
            {initials(p.user.name)}
          </button>
        );
      })}
      <button type="button" className="avatar avatar-more avatar-btn" aria-label={t('Collaborators')} aria-haspopup="dialog" aria-expanded={open} title={t('Everyone in this file')} onClick={() => setOpen((o) => !o)}>
        {extra > 0 ? `+${extra}` : '⋯'}
      </button>
      {open && (
        <div className="collab-pop" role="dialog" aria-label={t('Collaborators')}>
          <ul>
            <li className="collab-row">
              <span className="avatar" style={{ background: colorForUser(me?.id ?? 'me') }}>{initials(me?.name ?? 'You')}</span>
              <span className="collab-name">{t('{name} (you)', { name: me?.name ?? t('You') })}</span>
            </li>
            {people.map((p) => (
              <li key={p.clientId} className={`collab-row status-${p.status}`}>
                <span className={`avatar status-${p.status}${p.state.audio?.speaking ? ' speaking' : ''}`} style={{ background: p.user.color }}>{initials(p.user.name)}</span>
                <span className="collab-name">
                  {p.user.name}
                  <span className="muted collab-sub">
                    {t(STATUS_LABEL[p.status])}
                    {roleOf(p) ? ` · ` : ''}
                    {roleOf(p) ? <span>{t(roleOf(p)!)}</span> : null}
                  </span>
                  {audioText(p) && (
                    <span className="collab-audio">
                      {p.state.audio?.muted ? <MicOff size={11} aria-hidden /> : <Mic size={11} aria-hidden />} {audioText(p)}
                    </span>
                  )}
                </span>
                <button type="button" className={`btn btn-ghost collab-follow${following === p.clientId ? ' on' : ''}`} aria-label={t('Follow {name}', { name: p.user.name })} aria-pressed={following === p.clientId} onClick={() => follow(p)}>
                  {following === p.clientId ? t('Following') : t('Follow')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
