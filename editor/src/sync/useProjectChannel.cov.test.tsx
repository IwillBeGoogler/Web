import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  links: [] as { opts: Record<string, any>; close: ReturnType<typeof vi.fn> }[],
  rts: [] as { o: Record<string, any>; connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
  getTree: vi.fn(),
  navigate: vi.fn(),
  request: vi.fn(),
  run: vi.fn(async () => undefined),
  pull: vi.fn(),
  psync: null as { treeRev?: number } | null,
}));
vi.mock('../realtime/link', () => ({
  MqttLink: class { close = vi.fn(); constructor(public opts: Record<string, any>) { h.links.push(this as never); } },
}));
vi.mock('./realtime', () => ({
  Realtime: class { connect = vi.fn(); close = vi.fn(); constructor(public o: Record<string, any>) { h.rts.push(this as never); } },
}));
vi.mock('../api/api', () => ({ api: { getTree: h.getTree } }));
vi.mock('../lib/router', () => ({ navigate: h.navigate }));
vi.mock('./treeRuntime', () => ({ requestTreeSync: h.request, runTreeSync: h.run }));
vi.mock('../hooks/useProjectLibrary', () => ({ pullLibrary: h.pull }));
vi.mock('../workspace/storage', () => ({ getProjectSync: () => h.psync }));
import { ApiError } from '../api/client';
import { useSession } from '../api/session';
import { setFeatures, resetFeatures } from '../lib/features';
import { useToastStore } from '../store/toastStore';
import { useWorkspace } from '../workspace/store';
import { useProjectPresence } from './status';
import { useProjectChannel } from './useProjectChannel';

beforeEach(() => {
  vi.clearAllMocks();
  h.links.length = 0;
  h.rts.length = 0;
  h.psync = { treeRev: 5 };
  resetFeatures();
  useToastStore.getState().clear();
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a', name: 'A', isAdmin: false } } as never);
});

describe('useProjectChannel', () => {
  it('does not connect when not backed, signed out, local, or realtime is off', () => {
    h.psync = null;
    renderHook(() => useProjectChannel('p1', null));
    expect(h.rts).toHaveLength(0);
    h.psync = {};
    useSession.setState({ user: null } as never);
    renderHook(() => useProjectChannel('p1', null));
    useSession.setState({ mode: 'local' } as never);
    renderHook(() => useProjectChannel('p1', null));
    useSession.setState({ mode: 'server', user: { id: 'u1' } } as never);
    setFeatures({ realtime: false });
    renderHook(() => useProjectChannel('p1', null));
    expect(h.rts).toHaveLength(0);
  });
  it('connects without a user when auth mode is none', () => {
    useSession.setState({ authMode: 'none', user: null } as never);
    renderHook(() => useProjectChannel('p1', null));
    expect(h.links[0].opts).toMatchObject({ scope: 'project', projectId: 'p1', userId: null });
  });

  it('wires the link, connects, and tears down', () => {
    const { unmount } = renderHook(() => useProjectChannel('p1', 'f1'));
    expect(h.links[0].opts).toMatchObject({ scope: 'project', projectId: 'p1', userId: 'u1' });
    expect(h.rts[0].connect).toHaveBeenCalled();
    useProjectPresence.getState().set([{ clientId: 'c' } as never]);
    unmount();
    expect(h.rts[0].close).toHaveBeenCalled();
    expect(h.links[0].close).toHaveBeenCalled();
    expect(useProjectPresence.getState().users).toEqual([]);
  });

  it('checkGone is true for 404/403, false for success or other errors', async () => {
    renderHook(() => useProjectChannel('p1', null));
    const { checkGone } = h.links[0].opts;
    h.getTree.mockResolvedValueOnce({});
    expect(await checkGone()).toBe(false);
    h.getTree.mockRejectedValueOnce(new ApiError(404, 'x', 'gone'));
    expect(await checkGone()).toBe(true);
    h.getTree.mockRejectedValueOnce(new ApiError(403, 'x', 'no'));
    expect(await checkGone()).toBe(true);
    h.getTree.mockRejectedValueOnce(new ApiError(500, 'x', 'boom'));
    expect(await checkGone()).toBe(false);
    h.getTree.mockRejectedValueOnce(new Error('net'));
    expect(await checkGone()).toBe(false);
  });

  it('fatal close 4404 toasts and navigates; other codes are ignored', () => {
    renderHook(() => useProjectChannel('p1', null));
    const o = h.rts[0].o;
    o.onFatalClose(401);
    expect(h.navigate).not.toHaveBeenCalled();
    o.onFatalClose(4404);
    expect(h.navigate).toHaveBeenCalledWith('/projects');
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/deleted/);
  });

  it('first connect syncs the tree, a reconnect does not; reconnected refetches', () => {
    renderHook(() => useProjectChannel('p1', null));
    const o = h.rts[0].o;
    o.onConnected({ reconnect: true });
    expect(h.request).not.toHaveBeenCalled();
    o.onConnected({ reconnect: false });
    expect(h.request).toHaveBeenCalledWith('p1', 0);
    o.onReconnected();
    expect(h.run).toHaveBeenCalledWith('p1');
    expect(h.pull).toHaveBeenCalledWith('p1');
  });

  it('presence maps other users to files by name, skipping my tabs and file-less entries', () => {
    renderHook(() => useProjectChannel('p1', null));
    h.rts[0].o.onPresence([
      { userId: 'u1', fileId: 'f1', name: 'Me' },
      { userId: 'u2', fileId: 'f1', name: 'Bob' },
      { userId: 'u3', fileId: 'f1', name: 'Bob' },
      { userId: 'u4', fileId: 'f2', name: '' },
      { userId: 'u5', fileId: null, name: 'Nofile' },
    ]);
    expect(useProjectPresence.getState().users).toHaveLength(5);
    expect(useWorkspace.getState().presenceByFile).toEqual({ f1: ['Bob'], f2: ['Guest'] });
  });

  it('tree events: other project and stale revs are ignored, newer ones schedule a sync', () => {
    renderHook(() => useProjectChannel('p1', null));
    const o = h.rts[0].o;
    o.onTree({ projectId: 'other', rev: 99 });
    o.onTree({ projectId: 'p1', rev: 5 });
    expect(h.request).not.toHaveBeenCalled();
    o.onTree({ projectId: 'p1', rev: 6 });
    expect(h.request).toHaveBeenCalledWith('p1', 150);
    h.request.mockClear();
    h.psync = null; // no stored rev = 0
    o.onTree({ projectId: 'p1', rev: 1 });
    expect(h.request).toHaveBeenCalledWith('p1', 150);
  });

  it('file.updated of the open file is left to the file channel; others refresh the tree', () => {
    renderHook(() => useProjectChannel('p1', 'f1'));
    const o = h.rts[0].o;
    o.onUpdated({ fileId: 'f1' });
    expect(h.request).not.toHaveBeenCalled();
    o.onUpdated({ fileId: 'f2' });
    o.onUpdated({});
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.request).toHaveBeenCalledWith('p1', 400);
  });

  it('library.updated pulls the library; other messages do not', () => {
    renderHook(() => useProjectChannel('p1', null));
    h.rts[0].o.onMessage({ type: 'comment.added' });
    expect(h.pull).not.toHaveBeenCalled();
    h.rts[0].o.onMessage({ type: 'library.updated' });
    expect(h.pull).toHaveBeenCalledWith('p1');
  });

  it('coming back online runs a tree sync until unmount', () => {
    const { unmount } = renderHook(() => useProjectChannel('p1', null));
    window.dispatchEvent(new Event('online'));
    expect(h.run).toHaveBeenCalledWith('p1');
    h.run.mockClear();
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(h.run).not.toHaveBeenCalled();
  });
});
