import { create } from 'zustand';
import type { Role } from '../api/types';
import { flatten, filterTree, type Row } from './tree';
import { emptyTabs, parseTabs, pruneTabs, type TabsState } from './tabs';
import { getProjectSync, getWsProject, loadTree, type Store } from './storage';
import { emptyTree, type ProjectTree, type WsProject } from './types';

/** Per project and per user: what the explorer / tab bar looked like. Persisted locally and (when signed in) as a server preference. */
export interface ViewState {
  tabs: TabsState;
  expanded: string[];
  starred: string[];
  recent: string[];
  /** ms timestamp of the last change (the newer of local and server wins on load) */
  at: number;
}
export const emptyView = (): ViewState => ({ tabs: emptyTabs(), expanded: [], starred: [], recent: [], at: 0 });
const MAX_RECENT = 12;

export const viewKey = (userKey: string, projectId: string) => `sdd:ws:view:${userKey}:${projectId}`;
export function parseView(raw: unknown): ViewState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ViewState>;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
  return { tabs: parseTabs(r.tabs), expanded: strs(r.expanded), starred: strs(r.starred), recent: strs(r.recent).slice(0, MAX_RECENT), at: typeof r.at === 'number' ? r.at : 0 };
}
export function readView(st: Store, userKey: string, projectId: string): ViewState {
  try {
    return parseView(JSON.parse(st.getItem(viewKey(userKey, projectId)) ?? 'null'));
  } catch {
    return emptyView();
  }
}
export function writeView(st: Store, userKey: string, projectId: string, v: ViewState): void {
  try {
    st.setItem(viewKey(userKey, projectId), JSON.stringify(v));
  } catch {
    /* quota */
  }
}
/** drop view entries (tabs, starred, recent, expanded) that point at things that no longer exist */
export function pruneView(v: ViewState, tree: ProjectTree): ViewState {
  const files = new Set(tree.files.map((f) => f.id));
  const folders = new Set(tree.folders.map((f) => f.id));
  return { ...v, tabs: pruneTabs(v.tabs, (id) => files.has(id)), starred: v.starred.filter((id) => files.has(id)), recent: v.recent.filter((id) => files.has(id)), expanded: v.expanded.filter((id) => folders.has(id)) };
}
export const touchRecent = (recent: string[], id: string): string[] => [id, ...recent.filter((x) => x !== id)].slice(0, MAX_RECENT);

interface WorkspaceState extends ViewState {
  projectId: string | null;
  project: WsProject | null;
  tree: ProjectTree;
  /** project-level role (local projects: owner) */
  role: Role;
  serverBacked: boolean;
  userKey: string;
  filter: string;
  /** the file-tree popover in the top bar is open */
  filesOpen: boolean;
  /** the ⌘P quick switcher is open */
  quickOpen: boolean;
  /** row with keyboard focus in the explorer */
  focusId: string | null;
  /** unsent tree operations (for the sync indicator tooltip) */
  queued: number;
  /** other people's open files: file id -> user names (project presence) */
  presenceByFile: Record<string, string[]>;
  /** (re)load a project from local storage; false when it does not exist */
  load: (st: Store, projectId: string, userKey: string) => boolean;
  unload: () => void;
  /** re-read the tree and project record after a storage-level change (sync, edits) */
  reload: (st: Store) => void;
  setView: (patch: Partial<ViewState>) => void;
  setFilter: (q: string) => void;
  setFilesOpen: (open: boolean) => void;
  setQuickOpen: (open: boolean) => void;
  setFocus: (id: string | null) => void;
  setQueued: (n: number) => void;
  setPresence: (p: Record<string, string[]>) => void;
}

const initial = {
  projectId: null as string | null, project: null as WsProject | null, tree: emptyTree(), role: 'owner' as Role, serverBacked: false, userKey: 'local',
  filter: '', filesOpen: false, quickOpen: false, focusId: null as string | null, queued: 0, presenceByFile: {} as Record<string, string[]>, ...emptyView(),
};

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ...initial,
  load: (st, projectId, userKey) => {
    const project = getWsProject(st, projectId);
    if (!project) return false;
    const tree = loadTree(st, projectId);
    const sync = getProjectSync(st, projectId);
    const view = pruneView(readView(st, userKey, projectId), tree);
    set({ ...initial, projectId, project, tree, userKey, role: sync?.role ?? 'owner', serverBacked: !!sync, ...view });
    return true;
  },
  unload: () => set({ ...initial }),
  reload: (st) => {
    const id = get().projectId;
    if (!id) return;
    const project = getWsProject(st, id);
    if (!project) return get().unload();
    const tree = loadTree(st, id);
    const sync = getProjectSync(st, id);
    const v = get();
    const pruned = pruneView({ tabs: v.tabs, expanded: v.expanded, starred: v.starred, recent: v.recent, at: v.at }, tree);
    set({ project, tree, role: sync?.role ?? 'owner', serverBacked: !!sync, ...pruned });
  },
  setView: (patch) => set({ ...patch, at: Date.now() }),
  setFilter: (filter) => set({ filter }),
  setFilesOpen: (filesOpen) => set({ filesOpen }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  setFocus: (focusId) => set({ focusId }),
  setQueued: (queued) => set({ queued }),
  setPresence: (presenceByFile) => set({ presenceByFile }),
}));

/** visible explorer rows for the current filter / expansion */
export function selectRows(s: Pick<WorkspaceState, 'tree' | 'expanded' | 'filter'>): Row[] {
  return flatten(s.tree, new Set(s.expanded), filterTree(s.tree, s.filter));
}
