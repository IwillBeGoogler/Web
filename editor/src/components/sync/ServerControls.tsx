import { Clapperboard, History, MessageSquare, Share2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { getHostActions, subscribeHostActions } from '../../lib/host';
import { useCommentsStore } from '../../comments/store';
import { api } from '../../api/api';
import { useSession } from '../../api/session';
import { flushProject } from '../../hooks/useProjectPersistence';
import { currentPath, navigate } from '../../lib/router';
import { useFeatures } from '../../lib/features';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { getActiveEngine } from '../../sync/active';
import { uploadLocalProject } from '../../sync/runtime';
import { useWorkspace } from '../../workspace/store';
import { getProjectSync } from '../../workspace/storage';
import { runTreeSync } from '../../sync/treeRuntime';
import { useEditorSession } from '../../sync/status';
import { useLibrary } from '../../sync/library';
import { IconButton } from '../ui/IconButton';
import { AudioControls, AudioSinks } from '../collab/AudioControls';
import { CollabAvatars } from '../collab/CollabAvatars';
import { PresenceAvatars } from './PresenceAvatars';
import { shareDialog, versionsDialog } from './syncDialogs';
import { openTimelineFor, prepareHistory } from '../../versions/timelineActions';
import { closeTimeline, useTimeline } from '../../versions/timelineStore';
import { SyncIndicator } from './SyncIndicator';
import { UserMenu } from './UserMenu';
import { t } from '../../i18n';

/** upload the whole open project (ids are kept, so the URL stays the same) */
async function uploadCurrent(): Promise<void> {
  const pid = useWorkspace.getState().projectId;
  if (!pid) return;
  flushProject();
  try {
    if (getProjectSync(localStorage, pid)) await runTreeSync(pid); // already on the server: send what is queued (new files)
    else await uploadLocalProject(api, localStorage, pid);
    useWorkspace.getState().reload(localStorage);
    toast.success(t('Uploaded to the server'));
    navigate(currentPath().split('?')[0], { replace: true });
    useLibrary.getState().bump();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('Upload failed'));
  }
}

async function openHistory(fileId: string, role: Parameters<typeof versionsDialog>[1]): Promise<void> {
  const { current, restore } = await prepareHistory(fileId);
  await versionsDialog(fileId, role, current, restore, () => useDiagramStore.getState().toProject(), () => void openTimelineFor(fileId, role));
}

/**
 * Right side of the top bar in server mode: sync status (icon, label on hover), history, who is here, Share (primary), account.
 * `phone`: only Share. Renders nothing without a backend.
 */
function HostActionsSlot({ fileId, projectId, role }: { fileId: string; projectId: string | null; role: string }) {
  const render = useSyncExternalStore(subscribeHostActions, getHostActions);
  return render ? <>{render({ fileId, projectId, role })}</> : null;
}

export function ServerControls({ phone = false }: { phone?: boolean }) {
  const mode = useSession((s) => s.mode);
  const { source, role } = useEditorSession();
  const fileId = useDiagramStore((s) => s.projectId);
  const fileName = useDiagramStore((s) => s.projectName);
  const workspaceProject = useWorkspace((s) => s.projectId);
  const commentsOn = useCommentsStore((s) => !!s.fileId);
  const unread = useCommentsStore((s) => s.unread);
  const panelOpen = useCommentsStore((s) => s.panelOpen);
  const timelineOpen = useTimeline((s) => s.open);
  const sharing = useFeatures((f) => f.sharing);
  const accounts = useFeatures((f) => f.accounts);
  if (mode !== 'server') return null;
  const backed = source === 'server';
  const engine = () => getActiveEngine();
  const hostSlot = backed && <HostActionsSlot fileId={fileId} projectId={workspaceProject} role={role} />;
  const share = backed && sharing && (
    <button type="button" className="share-btn btn-primary" onClick={() => void shareDialog(workspaceProject ?? '', role, { id: fileId, name: fileName })}><Share2 size={14} aria-hidden /> {t('Share')}</button>
  );
  if (phone) return <div className="server-controls">{hostSlot}{share}</div>;
  return (
    <div className="server-controls">
      <SyncIndicator onRetry={() => void engine()?.retry()} onUpload={() => void uploadCurrent()} />
      <AudioControls />
      {commentsOn && (
        <span className="comments-btn-wrap">
          <IconButton label="Comments" shortcut="C" active={panelOpen} onClick={() => void useCommentsStore.getState().setPanel(!panelOpen)}><MessageSquare size={16} aria-hidden /></IconButton>
          {unread > 0 && <span className="badge" data-testid="comments-badge" aria-label={t('{n} unread comments', { n: unread })}>{unread > 9 ? '9+' : unread}</span>}
        </span>
      )}
      {backed && <IconButton label="Version history" onClick={() => void openHistory(fileId, role)}><History size={16} aria-hidden /></IconButton>}
      {backed && <IconButton label="Version timeline" active={timelineOpen} onClick={() => void (timelineOpen ? closeTimeline() : openTimelineFor(fileId, role))}><Clapperboard size={16} aria-hidden /></IconButton>}
      <PresenceAvatars />
      <CollabAvatars />
      {hostSlot}
      {share}
      {accounts && <UserMenu />}
      <AudioSinks />
    </div>
  );
}
