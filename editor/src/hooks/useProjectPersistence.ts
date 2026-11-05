import { useEffect } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { loadProject, saveProject } from '../lib/projects';
import { useEditorSession } from '../sync/status';
import { create } from 'zustand';
import { syncFileMeta } from '../workspace/storage';
import { useWorkspace } from '../workspace/store';

/** Load project into the editor store (sync, idempotent). Returns false when it doesn't exist. */
export function openProjectInStore(id: string): boolean {
  const p = loadProject(localStorage, id);
  if (!p) return false;
  useDiagramStore.getState().loadProject(p);
  return true;
}

type DiagramState = ReturnType<typeof useDiagramStore.getState>;
/** did anything that is part of the saved project change between two store states? */
export function contentChanged(s: DiagramState, prev: DiagramState, o: { ignoreViewport?: boolean } = {}): boolean {
  return !(
    s.nodes === prev.nodes && s.edges === prev.edges && s.pages === prev.pages && s.activePageId === prev.activePageId &&
    s.projectName === prev.projectName && s.projectSettings === prev.projectSettings && s.stash === prev.stash && (o.ignoreViewport || s.viewports === prev.viewports) && s.assets === prev.assets
  );
}

/** the open file has edits that are not written to local storage yet (the tab's "unsaved" dot) */
export const usePendingSave = create<{ pending: boolean; set: (p: boolean) => void }>((set) => ({ pending: false, set: (pending) => set({ pending }) }));

export function flushProject(): void {
  if (useEditorSession.getState().source === 'share') return; // a shared file is never added to this browser's file list
  try {
    const doc = useDiagramStore.getState().toProject();
    const ws = useWorkspace.getState();
    // inside a project only files of that project are written (a leftover editor state must never become a stray file)
    if (ws.projectId && !ws.tree.files.some((f) => f.id === doc.id)) return;
    saveProject(localStorage, doc);
    // keep the explorer's icon / page count / name in step with the saved document
    if (ws.projectId) {
      syncFileMeta(localStorage, ws.projectId, doc);
      ws.reload(localStorage);
    }
  } catch {
    /* ignore */
  } finally {
    usePendingSave.getState().set(false);
  }
}

/** Debounced autosave of the whole project (all pages) to localStorage; flushes on unmount. */
export function useProjectAutosave(delay = 400) {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useDiagramStore.subscribe((s, prev) => {
      if (!contentChanged(s, prev) || s.projectId !== prev.projectId) return; // loading another file is not an edit
      usePendingSave.getState().set(true);
      clearTimeout(t);
      t = setTimeout(flushProject, delay);
    });
    const onHide = () => flushProject();
    const onVis = () => document.visibilityState === 'hidden' && flushProject();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      unsub();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      flushProject();
    };
  }, [delay]);
}
