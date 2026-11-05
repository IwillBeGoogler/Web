import { AlertTriangle, Check, CloudOff, CloudUpload, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useSession } from '../../api/session';
import { formatRelative } from '../../lib/home';
import { useCollabStore } from '../../collab/store';
import { useSyncStore, useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

interface Props {
  onRetry?: () => void;
  onUpload?: () => void;
}

/** Sync state of the open project: Saved / Saving / Offline (queued N) / Conflict / Error / View only / Local only. Hidden without a backend. */
export function SyncIndicator({ onRetry, onUpload }: Props) {
  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  const { status, queued, message, lastSyncedAt } = useSyncStore();
  const source = useEditorSession((s) => s.source);
  const liveOn = useCollabStore((s) => !!s.session);
  const liveStatus = useCollabStore((s) => s.status);
  const liveSynced = useCollabStore((s) => s.synced);
  const liveRO = useCollabStore((s) => s.readOnly);
  const liveFatal = useCollabStore((s) => s.fatal);
  const live = { on: liveOn, status: liveStatus, synced: liveSynced, readOnly: liveRO, fatal: liveFatal };
  if (mode !== 'server') return null;
  if (live.on && source !== 'local') {
    // a live (Yjs) file: merges are automatic, so the only states are connection states: no conflict, no retry
    const common = { className: 'sync-ind', role: 'status', 'aria-live': 'polite' as const };
    if (live.fatal !== null) return <span {...common} data-status="error" title={t('Live editing ended for this file')}><AlertTriangle size={14} aria-hidden /> <span className="sync-label">{live.fatal === 4404 ? t('File deleted') : t('Unavailable')}</span></span>;
    if (live.readOnly) return <span {...common} data-status="readonly" title={live.status === 'connected' ? t('View only · live') : t('View only')}><Eye size={14} aria-hidden /> <span className="sync-label">{t('View only')}</span></span>;
    if (live.status === 'connecting') return <span {...common} data-status="saving" title={live.synced ? t('Reconnecting…') : t('Connecting…')}><Loader2 size={14} className="spin" aria-hidden /> <span className="sync-label">{live.synced ? t('Reconnecting…') : t('Connecting…')}</span></span>;
    if (live.status === 'offline') return <span {...common} data-status="offline" title={t('Offline: your edits are kept in this browser and merge when you reconnect.')}><CloudOff size={14} aria-hidden /> <span className="sync-label">{t('Offline')}</span></span>;
    return <span {...common} data-status="live" title={t('Live: everything you do is shared and saved as you go')}><Check size={14} aria-hidden /> <span className="sync-label">{t('Live')}</span></span>;
  }
  if (source === 'local') {
    if (authMode === 'session' && !user) return null;
    return (
      <button type="button" className="sync-ind" data-status="local" onClick={onUpload} title={t('This project exists only in this browser. Click to upload it to the server.')}>
        <CloudUpload size={14} aria-hidden /> <span>{t('Local only · Upload')}</span>
      </button>
    );
  }
  const common = { className: 'sync-ind', 'data-status': status, role: 'status', 'aria-live': 'polite' as const };
  if (status === 'saving') return <span {...common} title={t('Saving…')}><Loader2 size={14} className="spin" aria-hidden /> <span className="sync-label">{t('Saving…')}</span></span>;
  if (status === 'offline')
    return (
      <span {...common} title={t('Changes are kept in this browser and upload when you are back online.')}>
        <CloudOff size={14} aria-hidden /> {queued > 0 ? t('Offline · {n} queued', { n: queued }) : t('Offline')}
      </span>
    );
  if (status === 'conflict')
    return (
      <button type="button" className="sync-ind" data-status="conflict" onClick={onRetry} title={message ?? t('Someone else saved a newer version')}>
        <AlertTriangle size={14} aria-hidden /> Conflict · Resolve
      </button>
    );
  if (status === 'error')
    return (
      <button type="button" className="sync-ind" data-status="error" onClick={onRetry} title={message ?? t('Sync failed')}>
        <RefreshCw size={14} aria-hidden /> Sync error · Retry
      </button>
    );
  if (status === 'readonly') return <span {...common} title={t('View only')}><Eye size={14} aria-hidden /> <span className="sync-label">{t('View only')}</span></span>;
  return (
    <span {...common} title={lastSyncedAt ? t('Saved · last synced {when}', { when: formatRelative(lastSyncedAt) }) : t('Saved')}>
      <Check size={14} aria-hidden /> <span className="sync-label">{t('Saved')}</span>
    </span>
  );
}
