import { sliceToProject, useDiagramStore, type TabSlice } from '../store/diagramStore';
import type { Project } from '../types';

/**
 * Every open file tab keeps its own editor state in memory while it is not the visible one: the document, undo/redo
 * history, selection and viewports. Switching tabs captures the current one and restores the target, so a tab comes
 * back exactly as it was left (and one tab's undo can never touch another file).
 */
const sessions = new Map<string, TabSlice>();

export const hasTabSession = (fileId: string): boolean => sessions.has(fileId);
export const dropTabSession = (fileId: string): void => void sessions.delete(fileId);
export const clearTabSessions = (): void => sessions.clear();

/** remember the file currently in the editor store (no-op when the store holds something else) */
export function captureActive(fileId: string | null): void {
  if (!fileId) return;
  const st = useDiagramStore.getState();
  if (st.projectId !== fileId) return;
  sessions.set(fileId, st.captureTab());
}

/** Put `fileId` into the editor store: its live tab session when there is one, else the given document. Returns false when neither exists. */
export function activateFile(fileId: string, load: () => Project | null): boolean {
  const st = useDiagramStore.getState();
  if (st.projectId === fileId) return true;
  const live = sessions.get(fileId);
  if (live) {
    st.restoreTab(live);
    return true;
  }
  const doc = load();
  if (!doc) return false;
  st.loadProject(doc);
  return true;
}

/** a document changed from outside (server pull, restore): a stored session of that file would be stale */
export const invalidateSession = dropTabSession;

/** the current document of a file that is open in a tab: from the editor store when it is the visible one, else its stored session */
export function liveProject(fileId: string): Project | null {
  const st = useDiagramStore.getState();
  if (st.projectId === fileId) return st.toProject();
  const s = sessions.get(fileId);
  return s ? sliceToProject(s) : null;
}
