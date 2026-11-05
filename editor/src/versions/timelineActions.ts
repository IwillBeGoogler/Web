import { api } from '../api/api';
import { useDiagramStore } from '../store/diagramStore';
import { toast } from '../store/toastStore';
import { getActiveEngine } from '../sync/active';
import type { Saved } from '../sync/engine';
import { useEditorSession } from '../sync/status';
import { useWorkspace } from '../workspace/store';
import { canEdit, type Role } from '../lib/roles';
import { restoreWithConfirm } from '../components/sync/syncDialogs';
import { t } from '../i18n';
import { afterRestore, openTimeline, setAuthors, useTimeline } from './timelineStore';

/** upload pending edits (so they show up as a version and a restore does not lose them) and read the file's current version */
export async function prepareHistory(fileId: string): Promise<{ current: number; restore: (saved: Saved) => void }> {
  const e = getActiveEngine();
  await e?.flush();
  // a live (Yjs) file has no engine: its "current" version is the server's, and a restore reaches the editor through the live doc
  const current = e ? e.baseVersion : await api.getFile(fileId).then((r) => Number(r.version)).catch(() => 0);
  return { current, restore: (saved) => e?.applyRemote(saved) };
}

/** open the timeline bar for a server-backed file */
export async function openTimelineFor(fileId: string, role: Role): Promise<void> {
  const { current } = await prepareHistory(fileId);
  await openTimeline({ fileId, role, currentVersion: current, client: api, activePageId: useDiagramStore.getState().activePageId });
  // names of the people who saved versions (best effort: a viewer or a share link may not list members)
  const pid = useWorkspace.getState().projectId;
  if (pid) {
    void api.listMembers(pid).then(
      (ms) => useTimeline.getState().fileId === fileId && setAuthors(Object.fromEntries(ms.map((m) => [m.userId, m.name || m.email]))),
      () => undefined,
    );
  }
}

/** ⌘K / menu: the timeline of the file that is open (server files only: local files have no history) */
export async function openTimelineForCurrent(): Promise<void> {
  const { source, role } = useEditorSession.getState();
  if (source !== 'server') {
    toast.info(t('Version history needs a file stored on the server'));
    return;
  }
  await openTimelineFor(useDiagramStore.getState().projectId, role);
}

/** the restore button of the previewed version: same confirm + restore + role check as the history dialog */
export async function restoreShownVersion(): Promise<void> {
  const s = useTimeline.getState();
  if (!s.fileId || s.preview === null || !canEdit(s.role)) return; // a viewer / commenter cannot restore
  const { restore } = await prepareHistory(s.fileId);
  try {
    if (await restoreWithConfirm(api, s.fileId, s.preview.version, restore)) await afterRestore();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('Something went wrong'));
  }
}
