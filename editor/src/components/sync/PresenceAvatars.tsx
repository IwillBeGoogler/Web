import { useSession, initials } from '../../api/session';
import { useCollabStore } from '../../collab/store';
import { usePresence, useSyncStore } from '../../sync/status';
import { t } from '../../i18n';

const COLORS = ['#5b5bf7', '#0ea5a4', '#d97706', '#db2777', '#16a34a', '#7c3aed', '#dc2626', '#0284c7'];
export const colorFor = (key: string): string => COLORS[[...key].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

/** Who has this project open (one avatar per user, you first). */
export function PresenceAvatars({ max = 4 }: { max?: number }) {
  const users = usePresence((s) => s.users);
  const me = useSession((s) => s.user);
  const clientId = useSyncStore((s) => s.clientId);
  const live = useCollabStore((s) => !!s.session);
  const seen = new Set<string>();
  const list = users
    .filter((u) => {
      const k = u.userId ?? u.clientId;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Number(b.clientId === clientId || b.userId === me?.id) - Number(a.clientId === clientId || a.userId === me?.id));
  if (live) return null; // the live session has its own (richer) avatars
  if (list.length < 2 && !list.some((u) => u.clientId !== clientId && u.userId !== me?.id)) return null; // only you: nothing to show
  const shown = list.slice(0, max);
  return (
    <div className="presence" role="group" aria-label={t('{n} people here', { n: list.length })}>
      {shown.map((u) => {
        const you = u.clientId === clientId || (!!me && u.userId === me.id);
        return (
          <span key={u.userId ?? u.clientId} className="avatar" style={{ background: colorFor(u.userId ?? u.clientId) }} title={`${u.name || t('Guest')}${you ? ` ${t('(you)')}` : ''} · ${u.role}`} data-testid="presence-avatar">
            {initials(u.name || 'Guest')}
          </span>
        );
      })}
      {list.length > max && <span className="avatar avatar-more" aria-label={t('{n} more', { n: list.length - max })}>+{list.length - max}</span>}
    </div>
  );
}
