import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ patchPrefs: vi.fn(), getPrefs: vi.fn() }));
vi.mock('../api/api', () => ({ api: h }));
import { useSession } from '../api/session';
import { createWsProject } from './storage';
import { emptyView, useWorkspace, writeView, type ViewState } from './store';
import { _resetPrefsSync, fetchServerView, flushPrefs, newerView, prefsKey, reconcileView, schedulePrefsPush } from './prefsSync';

const view = (at: number, over: Partial<ViewState> = {}): ViewState => ({ ...emptyView(), at, ...over });
let pid: string;
let f1: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  _resetPrefsSync();
  h.patchPrefs.mockResolvedValue({});
  h.getPrefs.mockResolvedValue({});
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a', name: 'A', isAdmin: false } } as never);
  const r = createWsProject(localStorage, 'P');
  pid = r.project.id;
  f1 = r.fileId;
  useWorkspace.getState().load(localStorage, pid, 'u1');
});
afterEach(() => { vi.useRealTimers(); _resetPrefsSync(); });

describe('prefs push', () => {
  it('prefsKey namespaces by project', () => expect(prefsKey('p')).toBe('ws:p'));
  it('does nothing when signed out or in local mode', async () => {
    useSession.setState({ user: null } as never);
    schedulePrefsPush(pid, view(1));
    await flushPrefs(pid);
    useSession.setState({ mode: 'local' } as never);
    expect(await fetchServerView(pid)).toBeNull();
    expect(h.patchPrefs).not.toHaveBeenCalled();
  });
  it('auth mode none works without a user', async () => {
    useSession.setState({ authMode: 'none', user: null } as never);
    h.getPrefs.mockResolvedValue({ [prefsKey(pid)]: { at: 5 } });
    expect((await fetchServerView(pid))!.at).toBe(5);
  });
  it('before the first reconcile nothing is sent; afterwards pushes are debounced, last one wins', async () => {
    schedulePrefsPush(pid, view(1));
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.patchPrefs).not.toHaveBeenCalled();
    h.getPrefs.mockResolvedValue({});
    await reconcileView(pid, 'u1'); // flushes the held view
    await vi.advanceTimersByTimeAsync(10);
    expect(h.patchPrefs).toHaveBeenCalledTimes(1);
    expect(h.patchPrefs).toHaveBeenLastCalledWith({ [prefsKey(pid)]: expect.objectContaining({ at: 1 }) });
    schedulePrefsPush(pid, view(2));
    schedulePrefsPush(pid, view(3));
    await vi.advanceTimersByTimeAsync(799);
    expect(h.patchPrefs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(h.patchPrefs).toHaveBeenCalledTimes(2);
    expect(h.patchPrefs).toHaveBeenLastCalledWith({ [prefsKey(pid)]: expect.objectContaining({ at: 3 }) });
  });
  it('flushPrefs with nothing pending, signed out, or a failing server is harmless', async () => {
    await flushPrefs(pid);
    await reconcileView(pid, 'u1');
    schedulePrefsPush(pid, view(9), 0);
    h.patchPrefs.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(5);
    schedulePrefsPush(pid, view(10), 0);
    useSession.setState({ user: null } as never);
    await flushPrefs(pid);
    expect(h.patchPrefs).toHaveBeenCalledTimes(1);
  });
});

describe('server view', () => {
  it('fetchServerView parses a stored view, null when missing or unreachable', async () => {
    h.getPrefs.mockResolvedValueOnce({ [prefsKey(pid)]: { at: 7, starred: ['x', 'x', 3] } });
    expect(await fetchServerView(pid)).toMatchObject({ at: 7, starred: ['x'] });
    h.getPrefs.mockResolvedValueOnce({});
    expect(await fetchServerView(pid)).toBeNull();
    h.getPrefs.mockRejectedValueOnce(new Error('x'));
    expect(await fetchServerView(pid)).toBeNull();
  });
  it('newerView: server only when strictly newer', () => {
    const l = view(5);
    expect(newerView(l, null)).toBe(l);
    expect(newerView(l, view(5))).toBe(l);
    const s = view(6);
    expect(newerView(l, s)).toBe(s);
  });
});

describe('reconcileView', () => {
  const server = (at: number, o: Partial<ViewState> = {}) => h.getPrefs.mockResolvedValue({ [prefsKey(pid)]: { ...view(at), ...o } });
  it('an empty local state adopts the server tabs, dropping files and folders that no longer exist', async () => {
    server(50, { tabs: { open: [f1, 'ghost'], active: 'ghost', closed: ['gone', f1] }, expanded: ['nofolder'], starred: [f1, 'ghost'], recent: ['ghost', f1] });
    await reconcileView(pid, 'u1');
    const w = useWorkspace.getState();
    expect(w.tabs).toEqual({ open: [f1], active: f1, closed: [f1] });
    expect(w.expanded).toEqual([]);
    expect(w.starred).toEqual([f1]);
    expect(w.recent).toEqual([f1]);
    expect(w.at).toBe(50);
  });
  it('keeps the active tab of the server when it still exists', async () => {
    server(50, { tabs: { open: [f1], active: f1, closed: [] } });
    await reconcileView(pid, 'u1');
    expect(useWorkspace.getState().tabs.active).toBe(f1);
    server(60, { tabs: { open: [], active: null, closed: [] } });
  });
  it('a newer local state wins over an older server one; a newer server one wins over local', async () => {
    useWorkspace.setState({ at: 100, tabs: { open: [f1], active: f1, closed: [] } } as never);
    server(50, { tabs: { open: [], active: null, closed: [] } });
    await reconcileView(pid, 'u1');
    expect(useWorkspace.getState().tabs.open).toEqual([f1]);
    _resetPrefsSync();
    server(200, { tabs: { open: [f1], active: null, closed: [] }, starred: [f1] });
    await reconcileView(pid, 'u1');
    expect(useWorkspace.getState()).toMatchObject({ at: 200, starred: [f1] });
    expect(useWorkspace.getState().tabs.active).toBe(f1);
  });
  it('reads the stored local view when the workspace has not been touched yet', async () => {
    writeView(localStorage, 'u1', pid, view(300, { tabs: { open: [f1], active: f1, closed: [] } }));
    useWorkspace.setState({ at: 0 } as never);
    server(100, { tabs: { open: [], active: null, closed: [] } });
    await reconcileView(pid, 'u1');
    expect(useWorkspace.getState().at).toBe(0);
  });
  it('only runs once per project; a slow server is abandoned after the timeout; signed out is skipped', async () => {
    h.getPrefs.mockImplementation(() => new Promise(() => undefined));
    const p = reconcileView(pid, 'u1', 100);
    await vi.advanceTimersByTimeAsync(101);
    await p;
    h.getPrefs.mockClear();
    await reconcileView(pid, 'u1');
    expect(h.getPrefs).not.toHaveBeenCalled();
    _resetPrefsSync();
    useSession.setState({ user: null } as never);
    await reconcileView(pid, 'u1');
    expect(h.getPrefs).not.toHaveBeenCalled();
  });
  it('a pending push for another project than the open one is dropped, for the open one it goes out', async () => {
    schedulePrefsPush('other', view(1));
    await reconcileView('other', 'u1');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.patchPrefs).not.toHaveBeenCalled();
    schedulePrefsPush(pid, view(2));
    await reconcileView(pid, 'u1');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.patchPrefs).toHaveBeenCalledTimes(1);
  });
  it('a project closed meanwhile is not modified', async () => {
    server(50, { starred: [f1] });
    const p = reconcileView(pid, 'u1');
    useWorkspace.getState().unload();
    await p;
    expect(useWorkspace.getState().starred).toEqual([]);
  });
});
