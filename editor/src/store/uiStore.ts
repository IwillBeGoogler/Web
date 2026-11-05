import { create } from 'zustand';
import type { Tool } from '../lib/shapes';
import type { MenuTarget } from '../lib/menu';

export interface MenuState {
  x: number;
  y: number;
  target: MenuTarget;
  /** flow-space position of the click (for paste-here / add) */
  at?: { x: number; y: number };
}

interface UiState {
  /** design tools: layers panel, rulers, dev mode, plugins popover, link breadcrumb (all off / empty by default) */
  layersOpen: boolean;
  rulers: boolean;
  devMode: boolean;
  pluginsOpen: boolean;
  /** screen-reader outline (pages > nodes > connections as a tree); hidden by default */
  outlineOpen: boolean;
  /** ER: live SQL preview panel */
  sqlPanelOpen: boolean;
  linkTrail: import('../lib/links/links').Trail;
  setDesign: (p: Partial<Pick<UiState, 'layersOpen' | 'rulers' | 'devMode' | 'pluginsOpen' | 'outlineOpen' | 'sqlPanelOpen' | 'linkTrail'>>) => void;
  /** keyboard connect mode: the node a connection is being drawn FROM (pick the target with Tab / Alt+arrows, Enter) */
  connectFrom: string | null;
  setConnectFrom: (id: string | null) => void;
  tool: Tool;
  showGrid: boolean;
  /** minimap overlay (hidden by default: it covers canvas content) */
  showMinimap: boolean;
  toggleMinimap: () => void;
  /** node whose upstream / downstream data path is highlighted (Data flow mode) */
  traceNodeId: string | null;
  setTrace: (id: string | null) => void;
  snap: boolean;
  editingId: string | null;
  /** a class member the context menu just added: that ClassNode opens it for inline editing, then clears this */
  memberEdit: { nodeId: string; memberId: string } | null;
  setMemberEdit: (v: { nodeId: string; memberId: string } | null) => void;
  /** typing on a selected mind map node starts editing with this first character */
  editSeed: string | null;
  /** mind map node under a dragged node (drop highlight) */
  mmDrop: string | null;
  iconPickerFor: string | null;
  menu: MenuState | null;
  setTool: (t: Tool) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setEditing: (id: string | null, seed?: string | null) => void;
  setMmDrop: (id: string | null) => void;
  setIconPicker: (id: string | null) => void;
  openMenu: (m: MenuState) => void;
  closeMenu: () => void;
  setGridSnap: (grid: boolean, snap: boolean) => void;
  settingsOpen: boolean;
  /** ⌘K command palette */
  commandOpen: boolean;
  setCommandOpen: (o: boolean) => void;
  setSettingsOpen: (o: boolean) => void;
  /** cluster wizard: create from a profile (drop position) or edit an existing cluster */
  wizard: { profileId?: string; clusterId?: string; at?: { x: number; y: number } } | null;
  setWizard: (w: UiState['wizard']) => void;
  focusRole: boolean;
  /** UML class associations attach at the attribute row that holds the reference */
  umlAnchorRows: boolean;
  toggleUmlAnchorRows: () => void;
  setFocusRole: (v: boolean) => void;
  resetUi: () => void;
}

const ANCHOR_KEY = 'sdd:uml-anchor-rows';
const loadAnchor = (): boolean => {
  try { return localStorage.getItem(ANCHOR_KEY) !== '0'; } catch { return true; }
};

const initial = {
  layersOpen: false,
  sqlPanelOpen: false,
  rulers: false,
  devMode: false,
  pluginsOpen: false,
  outlineOpen: false,
  connectFrom: null as string | null,
  linkTrail: [] as import('../lib/links/links').Trail,
  umlAnchorRows: true,
  tool: 'select' as Tool,
  showGrid: true,
  showMinimap: false,
  snap: true,
  editingId: null,
  memberEdit: null as { nodeId: string; memberId: string } | null,
  editSeed: null as string | null,
  mmDrop: null as string | null,
  iconPickerFor: null,
  menu: null,
  settingsOpen: false,
  commandOpen: false,
  wizard: null,
  focusRole: false,
  traceNodeId: null as string | null,
};

export const useUiStore = create<UiState>((set) => ({
  ...initial,
  umlAnchorRows: loadAnchor(),
  setDesign: (p) => set(p),
  setConnectFrom: (connectFrom) => set({ connectFrom }),
  setTool: (tool) => set({ tool }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setTrace: (traceNodeId) => set({ traceNodeId }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  setMemberEdit: (memberEdit) => set({ memberEdit }),
  setEditing: (editingId, seed = null) => set({ editingId, editSeed: editingId ? seed : null }),
  setMmDrop: (mmDrop) => set((s) => (s.mmDrop === mmDrop ? s : { mmDrop })),
  setIconPicker: (iconPickerFor) => set({ iconPickerFor }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  setGridSnap: (showGrid, snap) => set({ showGrid, snap }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setWizard: (wizard) => set({ wizard }),
  setFocusRole: (focusRole) => set({ focusRole }),
  toggleUmlAnchorRows: () => set((s) => {
    try { localStorage.setItem(ANCHOR_KEY, s.umlAnchorRows ? '0' : '1'); } catch { /* private mode */ }
    return { umlAnchorRows: !s.umlAnchorRows };
  }),
  resetUi: () => set(initial),
}));
