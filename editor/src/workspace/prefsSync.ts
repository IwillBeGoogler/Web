import { api } from '../api/api';
import { useSession } from '../api/session';
import { parseView, readView, useWorkspace, type ViewState } from './store';

/** Per-user explorer / tab state is mirrored to the server preferences (`PATCH /me/prefs`, key `ws:<projectId>`), debounced. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const latest = new Map<string, ViewState>();
export const prefsKey = (projectId: string) => `ws:${projectId}`;

const signedIn = () => {
  const s = useSession.getState();
  return s.mode === 'server' && (s.authMode === 'none' || !!s.user);
};

/** projects whose server view has been looked at in this page session: until then nothing is pushed, so a freshly cleared browser cannot overwrite the saved tabs with an empty state */
const reconciled = new Set<string>();
export const _resetPrefsSync = (): void => {
  reconciled.clear();
  latest.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
};

export function schedulePrefsPush(projectId: string, view: ViewState, delay = 800): void {
  if (!signedIn()) return;
  if (!reconciled.has(projectId)) {
    latest.set(projectId, view); // sent right after reconcileView
    return;
  }
  latest.set(projectId, view);
  clearTimeout(timers.get(projectId));
  timers.set(projectId, setTimeout(() => void flushPrefs(projectId), delay));
}

export async function flushPrefs(projectId: string): Promise<void> {
  clearTimeout(timers.get(projectId));
  timers.delete(projectId);
  const v = latest.get(projectId);
  latest.delete(projectId);
  if (!v || !signedIn()) return;
  try {
    await api.patchPrefs({ [prefsKey(projectId)]: v });
  } catch {
    /* offline: the local copy is authoritative until the next change */
  }
}

/** the view stored on the server for a project (null when none / unreachable) */
export async function fetchServerView(projectId: string): Promise<ViewState | null> {
  if (!signedIn()) return null;
  try {
    const prefs = await api.getPrefs();
    const raw = prefs[prefsKey(projectId)];
    return raw ? parseView(raw) : null;
  } catch {
    return null;
  }
}

/** the newer of the local and the server view; `at` decides, local wins ties */
export function newerView(local: ViewState, server: ViewState | null): ViewState {
  return server && server.at > local.at ? server : local;
}

/**
 * Merge the tab state saved on the server into the loaded workspace (the newer `at` wins; an empty local state always loses).
 * Resolves once decided (or after `timeoutMs` when the server is slow), then lets pending pushes go out.
 */
export async function reconcileView(projectId: string, userKey: string, timeoutMs = 2500): Promise<void> {
  if (!signedIn() || reconciled.has(projectId)) return;
  const server = await Promise.race([fetchServerView(projectId), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
  reconciled.add(projectId);
  const cur = useWorkspace.getState();
  if (cur.projectId === projectId && server) {
    const local = cur.at === 0 ? readView(localStorage, userKey, projectId) : { tabs: cur.tabs, expanded: cur.expanded, starred: cur.starred, recent: cur.recent, at: cur.at };
    const emptyLocal = local.tabs.open.length === 0 && local.at === 0;
    if (emptyLocal || server.at > local.at) {
      const files = new Set(cur.tree.files.map((f) => f.id));
      const open = server.tabs.open.filter((id) => files.has(id));
      const active = server.tabs.active && open.includes(server.tabs.active) ? server.tabs.active : (open[0] ?? null);
      useWorkspace.setState({
        tabs: { open, active, closed: server.tabs.closed.filter((id) => files.has(id)) },
        expanded: server.expanded.filter((id) => cur.tree.folders.some((f) => f.id === id)),
        starred: server.starred.filter((id) => files.has(id)),
        recent: server.recent.filter((id) => files.has(id)),
        at: server.at,
      });
    }
  }
  const pending = latest.get(projectId);
  if (pending && useWorkspace.getState().projectId === projectId) schedulePrefsPush(projectId, pending, 0);
  else latest.delete(projectId);
}
