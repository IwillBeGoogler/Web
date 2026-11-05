import { useEffect, useRef } from 'react';
import { api } from '../api/api';
import { ApiError } from '../api/client';
import { MqttLink } from '../realtime/link';
import { useSession } from '../api/session';
import { features } from '../lib/features';
import { getProjectSync } from '../workspace/storage';
import { useWorkspace } from '../workspace/store';
import { navigate } from '../lib/router';
import { toast } from '../store/toastStore';
import { Realtime } from './realtime';
import { pullLibrary } from '../hooks/useProjectLibrary';
import { useProjectPresence } from './status';
import { requestTreeSync, runTreeSync } from './treeRuntime';

/**
 * The project-level MQTT connection, open as long as a server-backed project is open (it survives switching files):
 *  - `tree.updated` from other people -> pull and reconcile the tree
 *  - `file.updated` of a file nobody here has open -> refresh the tree metadata (name, kind icon, page count)
 *  - presence: who has which file open (dots in the explorer)
 */
export function useProjectChannel(projectId: string, activeFileId: string | null): void {
  const mode = useSession((s) => s.mode);
  const userId = useSession((s) => s.user?.id ?? null);
  const signedIn = mode === 'server' && (useSession.getState().authMode === 'none' || !!userId);
  const backed = signedIn && !!getProjectSync(localStorage, projectId);
  const active = useRef(activeFileId);
  active.current = activeFileId;
  useEffect(() => {
    useProjectPresence.getState().set([]);
    if (!backed || !features().realtime) return;
    // the tree needs no Last Will and no presence: this connection only listens to the project's events and roster
    const link = new MqttLink({
      scope: 'project',
      projectId,
      userId,
      checkGone: () => api.getTree(projectId).then(() => false, (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 403)),
    });
    const rt = new Realtime({
      link,
      onFatalClose: (code) => {
        if (code !== 4404) return;
        toast.error('This project was deleted.');
        navigate('/projects');
      },
      // events are not queued across connections: compare the tree revision (REST) with what we hold
      onConnected: ({ reconnect }) => { if (!reconnect) requestTreeSync(projectId, 0); }, // a reconnect refetches in onReconnected
      onPresence: (users) => {
        useProjectPresence.getState().set(users);
        const byFile: Record<string, string[]> = {};
        for (const u of users) {
          if (!u.fileId || u.userId === userId) continue; // your own tabs are not "others"
          const list = (byFile[u.fileId] ??= []);
          if (!list.includes(u.name)) list.push(u.name || 'Guest');
        }
        useWorkspace.getState().setPresence(byFile);
      },
      onTree: (t) => {
        if (t.projectId !== projectId) return;
        if (t.rev <= (getProjectSync(localStorage, projectId)?.treeRev ?? 0)) return;
        requestTreeSync(projectId, 150);
      },
      onUpdated: (u) => {
        if (u.fileId && u.fileId === active.current) return; // the per-file channel handles the open file
        requestTreeSync(projectId, 400);
      },
      onMessage: (m) => { if (m.type === 'library.updated') pullLibrary(projectId); },
      onReconnected: () => { void runTreeSync(projectId); pullLibrary(projectId); },
    });
    rt.connect();
    const onOnline = () => void runTreeSync(projectId);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      rt.close();
      link.close();
      useProjectPresence.getState().set([]);
      useWorkspace.getState().setPresence({});
    };
  }, [projectId, backed, userId]);
}
