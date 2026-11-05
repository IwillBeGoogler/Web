export interface LayoutState {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  sidebarWidth: number;
}
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;
export const LAYOUT_KEY = 'sdd:layout';
export const DEFAULT_LAYOUT: LayoutState = { sidebarOpen: false, inspectorOpen: false, sidebarWidth: 264 };
/** `sidebarOpen`: the palette is expanded (else a slim icon rail). `inspectorOpen`: the inspector is PINNED open; unpinned, it shows only while something is selected. */

export const clampSidebarWidth = (w: number): number => (Number.isFinite(w) ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w))) : DEFAULT_LAYOUT.sidebarWidth);
export const toggleSidebar = (s: LayoutState): LayoutState => ({ ...s, sidebarOpen: !s.sidebarOpen });
export const toggleInspector = (s: LayoutState): LayoutState => ({ ...s, inspectorOpen: !s.inspectorOpen });

export function loadLayout(st: Pick<Storage, 'getItem'>): LayoutState {
  try {
    const v = JSON.parse(st.getItem(LAYOUT_KEY) ?? 'null');
    if (v && typeof v === 'object')
      return {
        sidebarOpen: typeof v.sidebarOpen === 'boolean' ? v.sidebarOpen : DEFAULT_LAYOUT.sidebarOpen,
        inspectorOpen: typeof v.inspectorOpen === 'boolean' ? v.inspectorOpen : DEFAULT_LAYOUT.inspectorOpen,
        sidebarWidth: typeof v.sidebarWidth === 'number' ? clampSidebarWidth(v.sidebarWidth) : DEFAULT_LAYOUT.sidebarWidth,
      };
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_LAYOUT };
}
export function saveLayout(st: Pick<Storage, 'setItem'>, s: LayoutState): void {
  try {
    st.setItem(LAYOUT_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
