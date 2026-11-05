import { useSyncExternalStore } from 'react';

/** Tiny history-API router: `/` landing, `/projects` list, `/p/:projectId` project workspace (opens the last file), `/p/:projectId/f/:fileId` a file in the editor. */
export type Route = { name: 'landing' } | { name: 'projects' } | { name: 'project'; id: string } | { name: 'file'; projectId: string; fileId: string } | { name: 'login' } | { name: 'register' } | { name: 'share'; token: string };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/projects') return { name: 'projects' };
  if (path === '/login') return { name: 'login' };
  if (path === '/register') return { name: 'register' };
  const sh = /^\/s\/([\w-]+)$/.exec(path);
  if (sh) return { name: 'share', token: sh[1] };
  const f = /^\/p\/([^/]+)\/f\/([^/]+)$/.exec(path);
  if (f) {
    try {
      return { name: 'file', projectId: decodeURIComponent(f[1]), fileId: decodeURIComponent(f[2]) };
    } catch {
      return { name: 'landing' };
    }
  }
  const m = /^\/p\/([^/]+)$/.exec(path);
  if (m) {
    try {
      return { name: 'project', id: decodeURIComponent(m[1]) };
    } catch {
      return { name: 'landing' };
    }
  }
  return { name: 'landing' };
}

export function routePath(r: Route): string {
  return r.name === 'projects' ? '/projects' : r.name === 'project' ? `/p/${encodeURIComponent(r.id)}` : r.name === 'file' ? `/p/${encodeURIComponent(r.projectId)}/f/${encodeURIComponent(r.fileId)}` : r.name === 'login' ? '/login' : r.name === 'register' ? '/register' : r.name === 'share' ? `/s/${r.token}` : '/';
}

/** Leaving the editor can be vetoed (unsaved changes): the editor registers a guard while it is mounted. */
interface LeaveGuard {
  /** is there anything to ask about? (sync, so a clean editor navigates immediately) */
  needed: () => boolean;
  ask: () => Promise<boolean>;
}
let leaveGuard: LeaveGuard | null = null;
export function setLeaveGuard(g: LeaveGuard | null): () => void {
  leaveGuard = g;
  return () => {
    if (leaveGuard === g) leaveGuard = null;
  };
}
/** is there anything to ask about before leaving? */
export const leaveNeeded = (): boolean => !!leaveGuard && leaveGuard.needed();
/** `true` (sync) when nothing blocks leaving, else a promise of the user's decision. */
export const requestLeave = (): true | Promise<boolean> => (leaveGuard && leaveGuard.needed() ? leaveGuard.ask() : true);
/** navigate(), after the leave guard (if any) allows it */
export function guardedNavigate(path: string, opts: { replace?: boolean } = {}): void {
  const r = requestLeave();
  if (r === true) return navigate(path, opts);
  void r.then((ok) => ok && navigate(path, opts));
}

const EVENT = 'sdd:navigate';

/**
 * Embedded in a host app the editor must not touch the address bar: its route lives in memory and every change is
 * reported to the host (`onNavigate`), which owns the URL (e.g. `/p/x/f/y` -> `/d/f/y`).
 */
interface Embedded {
  path: string;
  onNavigate: (path: string, opts: { replace: boolean }) => void;
}
let embedded: Embedded | null = null;
/** switch to the in-memory router (pass `null` to go back to the address bar) */
export function setEmbeddedRouter(e: { path: string; onNavigate: Embedded['onNavigate'] } | null): void {
  embedded = e ? { ...e } : null;
  window.dispatchEvent(new Event(EVENT));
}
/** the host moved the editor (its URL changed): no echo to `onNavigate` */
export function setEmbeddedPath(path: string): void {
  if (!embedded || embedded.path === path) return;
  embedded.path = path;
  window.dispatchEvent(new Event(EVENT));
}

/** the current path + search, wherever the router keeps it */
export const currentPath = (): string => (embedded ? embedded.path : window.location.pathname + window.location.search);

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (embedded) {
    if (embedded.path === path) return;
    embedded.path = path;
    window.dispatchEvent(new Event(EVENT));
    embedded.onNavigate(path, { replace: !!opts.replace });
    return;
  }
  if (window.location.pathname + window.location.search === path) return;
  try {
    window.history[opts.replace ? 'replaceState' : 'pushState']({}, '', path);
  } catch {
    /* sandboxed iframe: ignore, the event below still updates the UI */
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
};
const snapshot = () => (embedded ? embedded.path.split('?')[0] : window.location.pathname);

/** Current route; re-renders on navigate() and browser back / forward. */
export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, snapshot, () => '/');
  return parseRoute(path);
}

/** Click handler for plain <a href> links: client-side navigation unless a modifier key / new tab is used. */
export function linkClick(path: string) {
  return (e: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault: () => void }) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(path);
  };
}
