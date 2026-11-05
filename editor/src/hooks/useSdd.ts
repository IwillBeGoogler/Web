import { useEffect, useMemo } from 'react';
import { useAppActions } from '../AppContext';
import { defaultDeps, openSddFlow, openSddFromPicker, resolvePendingOpen, saveCurrentProject, type SddDeps } from '../lib/sdd/actions';
import { isTypingTarget, keyToCommand } from '../lib/keymap';
import { useDiagramStore } from '../store/diagramStore';
import { useFileStore } from '../store/fileStore';
import { projectSignature } from '../lib/sdd/signature';
import { openProjectInStore } from './useProjectPersistence';

export function useSddDeps(): SddDeps {
  const { openFile, openProject } = useAppActions();
  return useMemo(() => defaultDeps(openFile, openProject), [openFile, openProject]);
}

export function useSddActions() {
  const deps = useSddDeps();
  const { inEditor } = useAppActions();
  return {
    save: () => (inEditor ? saveCurrentProject({}, deps) : Promise.resolve('cancelled' as const)),
    saveAs: () => (inEditor ? saveCurrentProject({ saveAs: true }, deps) : Promise.resolve('cancelled' as const)),
    open: () => openSddFromPicker(deps),
    openBytes: (bytes: Uint8Array, name: string) => openSddFlow(bytes, name, null, deps),
    resolve: (c: 'replace' | 'copy' | 'cancel') => resolvePendingOpen(c, deps),
  };
}

/** Cmd/Ctrl + S, Shift+S, O work everywhere (even inside inputs), and never trigger the browser's own dialogs. */
export function useFileShortcuts() {
  const a = useSddActions();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = keyToCommand(e);
      if (!cmd || cmd.type !== 'file') return;
      if (isTypingTarget(e.target) && cmd.op === 'open') return;
      e.preventDefault();
      if (cmd.op === 'open') void a.open();
      else if (cmd.op === 'save') void a.save();
      else void a.saveAs();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/** Marks the project dirty when saveable content differs from the last .sdd save (debounced). */
export function useDirtyTracking(projectId: string) {
  useEffect(() => {
    const st = useDiagramStore.getState();
    useFileStore.getState().baseline(projectId, projectSignature(st.toProject()));
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useDiagramStore.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.pages === prev.pages && s.projectName === prev.projectName && s.projectSettings === prev.projectSettings && s.stash === prev.stash && s.assets === prev.assets) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const f = useFileStore.getState();
        const sig = projectSignature(useDiagramStore.getState().toProject());
        const dirty = f.savedSig === null ? false : sig !== f.savedSig;
        if (dirty !== f.dirty) useFileStore.getState().setDirty(dirty);
      }, 200);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [projectId]);
}

export { openProjectInStore };
