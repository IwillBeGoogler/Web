import { useEffect, useState } from 'react';
import { api } from '../api/api';
import { useSession } from '../api/session';
import { flushProject } from '../hooks/useProjectPersistence';
import { navigate, type Route } from '../lib/router';
import { useDiagramStore } from '../store/diagramStore';
import { adoptServerFile, adoptServerProject } from '../sync/runtime';
import { filePath, persistView, projectPath } from './actions';
import { reconcileView } from './prefsSync';
import { getWsProject, loadFile, projectOfFile, resolveLegacyId } from './storage';
import { touchRecent, useWorkspace } from './store';
import { openTab } from './tabs';
import { activateFile, captureActive } from './tabSession';
import { expandToFile } from './expand';
import { siblings } from './tree';

export type RouteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'missing'; what: 'project' | 'file' }
  /** the project exists but has no files */
  | { kind: 'empty'; projectId: string }
  | { kind: 'ready'; projectId: string; fileId: string };

/** the file a project should open when only the project is named: the active/last tab, the last recent file, else the first file of the tree */
export function pickFile(ws: Pick<ReturnType<typeof useWorkspace.getState>, 'tabs' | 'recent' | 'tree'>): string | null {
  const exists = (id: string | null | undefined): id is string => !!id && ws.tree.files.some((f) => f.id === id);
  if (exists(ws.tabs.active)) return ws.tabs.active;
  const open = ws.tabs.open.find(exists);
  if (open) return open;
  const rec = ws.recent.find(exists);
  if (rec) return rec;
  const rootFirst = siblings(ws.tree, null).find((e) => e.kind === 'file');
  return rootFirst?.id ?? ws.tree.files[0]?.id ?? null;
}

/**
 * Resolves `/p/:projectId` and `/p/:projectId/f/:fileId` into a loaded workspace + a file shown in the editor store.
 * Old links keep working: a legacy project id is still the project's id (it opens the file it became), and a file id
 * used where a project id belongs redirects to the file route.
 */
export function useWorkspaceRoute(route: Route): RouteState {
  const [state, setState] = useState<RouteState>({ kind: 'idle' });
  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  const pid = route.name === 'project' ? route.id : route.name === 'file' ? route.projectId : null;
  const fid = route.name === 'file' ? route.fileId : null;
  const signedIn = mode === 'server' && (authMode === 'none' || !!user);
  const userKey = user?.id ?? (authMode === 'none' ? 'local-user' : 'local');

  useEffect(() => {
    if (!pid) {
      // left the project (home, landing, share link): nothing of it may leak into what happens next (e.g. an opened .sdd becomes a NEW project)
      if (useWorkspace.getState().projectId) {
        flushProject();
        captureActive(useDiagramStore.getState().projectId);
        useWorkspace.getState().unload();
      }
      setState({ kind: 'idle' });
      return;
    }
    if (mode === 'checking') {
      setState({ kind: 'loading' });
      return;
    }
    let live = true;
    const ls = localStorage;
    (async () => {
      // 1. the project: local copy, an old id, a file id, or the server
      let project = getWsProject(ls, pid);
      if (!project) {
        const alias = resolveLegacyId(ls, pid);
        const owner = projectOfFile(ls, pid);
        if (alias || owner) {
          const target = alias ?? { projectId: owner!, fileId: pid };
          navigate(filePath(target.projectId, target.fileId), { replace: true });
          return;
        }
        if (signedIn) {
          setState({ kind: 'loading' });
          const ok = await adoptServerProject({ api, storage: ls, online: () => navigator.onLine !== false, now: () => Date.now() }, pid);
          if (!live) return;
          if (ok) project = getWsProject(ls, pid);
        }
        if (!project) {
          navigate('/projects', { replace: true }); // unknown / inaccessible project: back to the list
          return;
        }
      }
      // 2. load it into the workspace store (once per project / user)
      const ws = useWorkspace.getState();
      if (ws.projectId !== pid || ws.userKey !== userKey) {
        if (!ws.load(ls, pid, userKey)) {
          navigate('/projects', { replace: true });
          return;
        }
      } else ws.reload(ls);
      // 3. the tab state saved on the server wins when it is newer than this browser's copy (another device / cleared storage): decided BEFORE a file is picked
      if (signedIn) {
        await reconcileView(pid, userKey);
        if (!live) return;
      }
      // 4. which file
      const cur = useWorkspace.getState();
      const wanted = fid ?? pickFile(cur);
      if (!wanted) {
        setState({ kind: 'empty', projectId: pid });
        return;
      }
      if (!fid) {
        navigate(filePath(pid, wanted), { replace: true });
        return;
      }
      if (!cur.tree.files.some((f) => f.id === fid)) {
        // maybe created elsewhere: ask the server once
        if (signedIn) {
          try {
            const f = (await api.getFile(fid)).file;
            if (f.projectId === pid) {
              adoptServerFile(ls, f);
              useWorkspace.getState().reload(ls);
            }
          } catch {
            /* fall through */
          }
        }
        if (!live) return;
        if (!useWorkspace.getState().tree.files.some((f) => f.id === fid)) {
          const fallback = pickFile(useWorkspace.getState());
          if (fallback && fallback !== fid) navigate(filePath(pid, fallback), { replace: true });
          else if (fallback) setState({ kind: 'missing', what: 'file' });
          else navigate(projectPath(pid), { replace: true });
          return;
        }
      }
      // 5. the document in the editor store (a live tab session keeps its undo history / viewport)
      const edStore = useDiagramStore.getState();
      if (edStore.projectId !== fid) {
        flushProject();
        captureActive(edStore.projectId);
      }
      let ok = activateFile(fid, () => loadFile(ls, fid));
      if (!ok && signedIn) {
        try {
          adoptServerFile(ls, (await api.getFile(fid)).file);
          ok = activateFile(fid, () => loadFile(ls, fid));
        } catch {
          /* offline and never cached */
        }
      }
      if (!live) return;
      if (!ok) {
        setState({ kind: 'missing', what: 'file' });
        return;
      }
      // 6. make sure the file has a tab
      const w = useWorkspace.getState();
      if (!w.tabs.open.includes(fid) || w.tabs.active !== fid) {
        w.setView({ tabs: openTab(w.tabs, fid), recent: touchRecent(w.recent, fid) });
        persistView();
      }
      expandToFile(fid);
      setState((s) => (s.kind === 'ready' && s.projectId === pid && s.fileId === fid ? s : { kind: 'ready', projectId: pid, fileId: fid }));
    })();
    return () => {
      live = false;
    };
  }, [pid, fid, mode, signedIn, userKey]);

  return state;
}
