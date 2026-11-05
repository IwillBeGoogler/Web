import { create } from 'zustand';
import { useMemo } from 'react';
import { loadGlobalSettings, mergeSettings, resolveSettings, saveGlobalSettings, type PartialSettings, type Settings } from '../lib/settings';
import { useDiagramStore } from './diagramStore';

import type { LineType } from '../types';

interface SettingsStore {
  global: PartialSettings;
  /** deep-merge a patch into the global settings and persist */
  patch: (p: PartialSettings) => void;
  resetGlobal: () => void;
  hydrate: () => void;
  /** default line style for new (and non-overridden) edges: project level when the project overrides it, else global */
  setLineStyle: (lt: LineType) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  global: {},
  patch: (p) => {
    set({ global: mergeSettings(get().global, p) });
    try {
      saveGlobalSettings(localStorage, get().global);
    } catch {
      /* ignore */
    }
  },
  resetGlobal: () => {
    set({ global: {} });
    try {
      saveGlobalSettings(localStorage, {});
    } catch {
      /* ignore */
    }
  },
  setLineStyle: (lt) => {
    const d = useDiagramStore.getState();
    if (d.projectSettings.edge?.lineType !== undefined) d.setProjectSettings(mergeSettings(d.projectSettings, { edge: { lineType: lt } }));
    else get().patch({ edge: { lineType: lt } });
  },
  hydrate: () => {
    try {
      set({ global: loadGlobalSettings(localStorage) });
    } catch {
      /* ignore */
    }
  },
}));

/** Effective settings: built-in < global < project. */
export function useResolvedSettings(): Settings {
  const g = useSettingsStore((s) => s.global);
  const p = useDiagramStore((s) => s.projectSettings);
  return useMemo(() => resolveSettings(g, p), [g, p]);
}
