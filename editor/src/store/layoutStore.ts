import { create } from 'zustand';
import { clampSidebarWidth, DEFAULT_LAYOUT, loadLayout, saveLayout, toggleInspector, toggleSidebar, type LayoutState } from '../lib/layout';

interface LayoutStore extends LayoutState {
  /** the workspace bar (file tabs + pages row) is shown under the top bar */
  wsbar: boolean;
  setWsbar: (v: boolean) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setSidebarWidth: (w: number) => void;
  hydrate: () => void;
  reset: () => void;
}
const persist = (s: LayoutState) => {
  try {
    saveLayout(localStorage, { sidebarOpen: s.sidebarOpen, inspectorOpen: s.inspectorOpen, sidebarWidth: s.sidebarWidth });
  } catch {
    /* ignore */
  }
};
export const useLayoutStore = create<LayoutStore>((set, get) => ({
  ...DEFAULT_LAYOUT,
  wsbar: false,
  setWsbar: (v) => set({ wsbar: v }),
  toggleSidebar: () => {
    set((s) => toggleSidebar(s));
    persist(get());
  },
  toggleInspector: () => {
    set((s) => toggleInspector(s));
    persist(get());
  },
  setSidebarWidth: (w) => {
    set({ sidebarWidth: clampSidebarWidth(w) });
    persist(get());
  },
  hydrate: () => {
    try {
      set(loadLayout(localStorage));
    } catch {
      /* ignore */
    }
  },
  reset: () => set({ ...DEFAULT_LAYOUT, wsbar: false }),
}));
