import { useEffect, useState } from 'react';
import { api } from '../api/api';
import { useSession } from '../api/session';
import { useDiagramStore } from '../store/diagramStore';
import { useLibraryDoc } from '../lib/library/store';
import { mainToDef, syncInstances } from '../lib/library/components';
import { propagateStyles, type Theme } from '../lib/library/styles';
import { getProjectSync } from '../workspace/storage';
import { LibrarySync } from '../sync/libraryRuntime';
import { themeRoot } from '../lib/host';
import { features } from '../lib/features';

const syncs = new Map<string, LibrarySync>();
/** the project channel got `library.updated`: fetch it */
export const pullLibrary = (projectId: string): void => void syncs.get(projectId)?.pull();

const currentTheme = (): Theme => (themeRoot().dataset.theme === 'dark' ? 'dark' : 'light');
function useTheme(): Theme {
  const [t, setT] = useState<Theme>(currentTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setT(currentTheme()));
    mo.observe(themeRoot(), { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return t;
}

/**
 * Keeps the project library (components, styles, tokens) in step with the open file:
 *  - loads it (local copy first, then the server when the project is server-backed) and pushes edits back (debounced);
 *  - when the MAIN component of this file changes, its definition is re-read (revision + 1);
 *  - instances and styled nodes of this file follow the library (also when it changed in another file or by another person).
 */
export function useProjectLibrary(projectId: string | undefined, readOnly: boolean): void {
  const theme = useTheme();
  const version = useLibraryDoc((s) => s.version);
  const mode = useSession((s) => s.mode);

  useEffect(() => {
    if (!projectId) return;
    useLibraryDoc.getState().open(projectId);
    let sync: LibrarySync | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsub: (() => void) | undefined;
    if (mode === 'server' && features().library && getProjectSync(localStorage, projectId)) {
      sync = new LibrarySync(api, projectId);
      syncs.set(projectId, sync);
      void sync.pull().then(() => { if (!readOnly) void sync!.push(); });
      let last = useLibraryDoc.getState().version;
      unsub = useLibraryDoc.subscribe((s) => {
        if (s.version === last) return;
        last = s.version;
        if (readOnly || !s.dirty) return;
        clearTimeout(timer);
        timer = setTimeout(() => void sync!.push(), 600);
      });
    }
    return () => {
      clearTimeout(timer);
      unsub?.();
      if (sync) syncs.delete(projectId);
      useLibraryDoc.getState().close();
    };
  }, [projectId, mode, readOnly]);

  // the library -> this file
  useEffect(() => {
    if (!projectId || readOnly) return;
    const apply = () => {
      const lib = useLibraryDoc.getState().doc;
      const st = useDiagramStore.getState();
      const inst = syncInstances(st.nodes, st.edges, lib);
      const styled = propagateStyles(inst.nodes, lib, theme);
      if (styled !== st.nodes || inst.edges !== st.edges) useDiagramStore.setState({ nodes: styled, edges: inst.edges });
    };
    apply();
  }, [projectId, readOnly, version, theme]);

  // this file's main components -> the library; and new nodes / a different file -> instances catch up
  useEffect(() => {
    if (!projectId || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const { nodes, edges } = useDiagramStore.getState();
      const mains = nodes.filter((n) => n.data.componentMain);
      if (mains.length) {
        const cur = useLibraryDoc.getState().doc;
        const next = mains.reduce((l, m) => mainToDef(nodes, edges, m.id, l) ?? l, cur);
        if (next !== cur) useLibraryDoc.getState().update(() => next);
      }
      const lib = useLibraryDoc.getState().doc;
      const inst = syncInstances(nodes, edges, lib);
      const styled = propagateStyles(inst.nodes, lib, currentTheme());
      if (styled !== nodes || inst.edges !== edges) useDiagramStore.setState({ nodes: styled, edges: inst.edges });
    };
    const unsub = useDiagramStore.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges) return;
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, [projectId, readOnly]);
}
