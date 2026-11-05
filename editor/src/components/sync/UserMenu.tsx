import { useEffect, useRef, useState } from 'react';
import { Bell, LogIn, LogOut } from 'lucide-react';
import { openComment, useNotificationsStore } from '../../comments/store';
import { formatRelative } from '../../lib/home';
import { api } from '../../api/api';
import { initials, useSession, type SessionApi } from '../../api/session';
import { guardedNavigate, navigate } from '../../lib/router';
import { toast } from '../../store/toastStore';
import { colorFor } from './PresenceAvatars';
import { t } from '../../i18n';

/** Avatar + menu (name, email, Log out) when logged in; a Log in link when the server wants a session. Nothing in local mode / AUTH_MODE=none. */
export function UserMenu({ client = api }: { client?: SessionApi }) {
  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore((s) => s.unread);
  const userId = user?.id;
  useEffect(() => {
    if (mode === 'server' && userId) void useNotificationsStore.getState().load().catch(() => undefined);
    if (!userId) useNotificationsStore.getState().reset();
  }, [mode, userId]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (mode !== 'server' || authMode === 'none') return null;
  if (!user)
    return (
      <button type="button" className="user-login" onClick={() => navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`)}>
        <LogIn size={14} aria-hidden /> Log in
      </button>
    );
  return (
    <div className="menu user-menu" ref={ref}>
      <button type="button" className="avatar avatar-btn" aria-label={t('Account: {name}', { name: user.name })} aria-haspopup="menu" aria-expanded={open} style={{ background: colorFor(user.id) }} onClick={() => setOpen((o) => !o)}>
        {initials(user.name, user.email)}
        {unread > 0 && <span className="badge" data-testid="notifications-badge" aria-label={t('{n} unread notifications', { n: unread })}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="menu-pop right" role="menu">
          <div className="menu-item user-who"><strong>{user.name}</strong><span className="muted">{user.email}</span></div>
          <div className="notif-head">
            <span><Bell size={12} aria-hidden /> {t('Notifications')}</span>
            {unread > 0 && <button type="button" className="comment-act" onClick={() => void useNotificationsStore.getState().markAllRead()}>{t('Mark all read')}</button>}
          </div>
          <ul className="notif-list" aria-label={t('Notifications')}>
            {items.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`notif-item${n.read ? '' : ' unread'}`}
                  onClick={() => {
                    setOpen(false);
                    void useNotificationsStore.getState().markRead([n.id]);
                    if (n.commentId) openComment(n.fileId, n.commentId);
                    guardedNavigate(`/p/${encodeURIComponent(n.projectId)}/f/${encodeURIComponent(n.fileId)}`);
                  }}
                >
                  <span className="notif-text">{n.text}</span>
                  <span className="muted notif-time">{formatRelative(n.createdAt)}</span>
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="muted notif-empty">{t('Nothing yet. Mentions and replies show up here.')}</li>}
          </ul>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout(client)
                .catch(() => toast.error(t('Could not reach the server; you were signed out locally.')))
                .finally(() => guardedNavigate('/login', { replace: true }));
            }}
          >
            <LogOut size={14} aria-hidden /> {t('Log out')}
          </button>
        </div>
      )}
    </div>
  );
}
