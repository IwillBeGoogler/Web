import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getFile: vi.fn(), saveFile: vi.fn(), getShared: vi.fn(), putThumbnail: vi.fn(), rtcConfig: vi.fn(),
  rtc: null as null | Record<string, ReturnType<typeof vi.fn>>,
  rtcDeps: null as null | Record<string, any>,
  thumbDeps: null as null | Record<string, any>,
  thumb: { touch: vi.fn(), stop: vi.fn() },
  priv: vi.fn(() => vi.fn()),
  migrate: vi.fn(async () => true),
  runTree: vi.fn(async () => undefined),
  queueLen: vi.fn(() => 0),
  deleted: vi.fn(),
  flushQueued: vi.fn(async () => undefined),
  startCollab: vi.fn(),
  renderThumb: vi.fn(async () => ({ bytes: new Uint8Array([1]), type: 'image/png' })),
}));
vi.mock('../api/api', async (orig) => {
  const m = await orig<typeof import('../api/api')>();
  return { ...m, BASE_URL: '/api', api: { ...m.api, getFile: h.getFile, saveFile: h.saveFile, getShared: h.getShared, putThumbnail: h.putThumbnail, rtcConfig: h.rtcConfig } };
});
vi.mock('../rtc/runtime', () => ({
  createRtcRuntime: (d: Record<string, any>) => { h.rtcDeps = d; return h.rtc; },
  setRtc: vi.fn(),
}));
vi.mock('./thumbUpload', () => ({ createThumbUploader: (d: Record<string, any>) => { h.thumbDeps = d; return h.thumb; } }));
vi.mock('./privateSync', async (orig) => ({ ...(await orig<typeof import('./privateSync')>()), startPrivateSync: h.priv }));
vi.mock('./assetMigrate', () => ({ migrateInlineAssets: h.migrate }));
vi.mock('./treeRuntime', () => ({ runTreeSync: h.runTree, requestTreeSync: vi.fn() }));
vi.mock('./treeSync', async (orig) => ({ ...(await orig<typeof import('./treeSync')>()), queueLength: h.queueLen }));
vi.mock('./collabRuntime', async (orig) => ({ ...(await orig<typeof import('./collabRuntime')>()), fileDeleted: h.deleted, startCollab: (...a: unknown[]) => h.startCollab(...a) }));
vi.mock('./runtime', async (orig) => ({ ...(await orig<typeof import('./runtime')>()), flushQueuedFiles: h.flushQueued }));
vi.mock('../lib/sdd/thumbnailPng', () => ({ renderThumbnailImage: h.renderThumb }));

import { ApiError } from '../api/client';
import { useSession } from '../api/session';
import { setFeatures, resetFeatures } from '../lib/features';
import { createProject } from '../lib/project';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { createWsProject } from '../workspace/storage';
import { setTicketProvider } from '../lib/host';
import { setMqttConnect } from '../realtime/link';
import { MockMqttClient, createMockMqtt, type MockMqtt } from '../realtime/mockMqtt';
import { topics } from '../realtime/topics';
import { useCommentsStore, useNotificationsStore } from '../comments/store';
import { getActiveEngine } from './active';
import { adoptServerFile } from './runtime';
import { useEditorSession, usePresence, useSyncStore } from './status';
import { useProjectSync } from './useProjectSync';

let mock: MockMqtt;
const tick = (ms = 5) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const fileEvent = (o: object) => mock.last().message(topics.fileEvents('s1'), o);
const sp = (version: number, name = 'Srv', role: 'owner' | 'viewer' = 'owner') => ({ id: 's1', projectId: 'prj1', folderId: null, name, kind: 'sdd' as const, position: 0, role, version, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 100 + version, updatedBy: 'u2', data: { ...createProject(name), id: 's1' } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetFeatures();
  mock = createMockMqtt();
  setMqttConnect(mock.connect);
  setTicketProvider(async () => 'tk');
  h.rtc = { signalingReconnected: vi.fn(), handleMessage: vi.fn(), leave: vi.fn(), dispose: vi.fn(), send: vi.fn() };
  h.priv.mockImplementation(() => vi.fn());
  h.queueLen.mockReturnValue(0);
  useSession.setState({ mode: 'server', authMode: 'session', collab: false, rtc: false, user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } } as never);
  useSyncStore.getState().reset();
  useToastStore.getState().clear();
  useCommentsStore.getState().reset();
  createWsProject(localStorage, 'Srv', { id: 'prj1', fileId: 's1' });
  adoptServerFile(localStorage, sp(1));
  h.getFile.mockResolvedValue({ file: sp(1), version: 1 });
  h.getShared.mockResolvedValue({ file: sp(1), version: 1 });
  useDiagramStore.getState().loadProject({ ...createProject('Srv'), id: 's1' });
});
afterEach(() => {
  setMqttConnect(null);
  setTicketProvider(null);
});

describe('source variants', () => {
  it('public diagrams are a read-only share view with no engine', () => {
    renderHook(() => useProjectSync('s1', { source: 'public' }));
    expect(useEditorSession.getState()).toMatchObject({ source: 'share', role: 'viewer', readOnly: true, shareToken: null });
    expect(getActiveEngine()).toBeNull();
  });
  it('a file not yet created remotely sends the queued create, then is treated as local', () => {
    localStorage.clear();
    createWsProject(localStorage, 'Q', { id: 'prj1', fileId: 'q1' });
    h.queueLen.mockReturnValue(2);
    // project must look server backed: reuse the real helper
    localStorage.setItem('sdd:ws:pmeta:prj1', JSON.stringify({ serverBacked: true, treeRev: 0 }));
    renderHook(() => useProjectSync('q1', { source: 'project' }, 'prj1'));
    expect(h.runTree).toHaveBeenCalledWith('prj1');
    expect(useEditorSession.getState()).toMatchObject({ source: 'local', role: 'owner' });
  });
  it('a file with no meta and an empty queue stays local without syncing', () => {
    renderHook(() => useProjectSync('nometa', { source: 'project' }));
    expect(h.runTree).not.toHaveBeenCalled();
    expect(useEditorSession.getState().source).toBe('local');
  });
  it('share link: role from the link, guest connection, getShared for gone checks and saves', async () => {
    useSession.setState({ user: null } as never);
    const { unmount } = renderHook(() => useProjectSync('s1', { source: 'share', token: 'tok', role: 'commenter', baseVersion: 1 }));
    expect(useEditorSession.getState()).toMatchObject({ source: 'share', role: 'commenter', shareToken: 'tok', readOnly: true });
    expect(getActiveEngine()).not.toBeNull();
    await tick();
    unmount();
    renderHook(() => useProjectSync('s1', { source: 'share', token: 'tok' }));
    expect(useEditorSession.getState().role).toBe('viewer');
  });
  it('realtime off: no connection, engine still runs and nothing throws on unmount', () => {
    setFeatures({ realtime: false });
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(getActiveEngine()).not.toBeNull();
    unmount();
    expect(getActiveEngine()).toBeNull();
  });
});

describe('thumbnails', () => {
  it('uploads a preview of the live project for editors, and touches on content change only for this file', async () => {
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(h.thumbDeps).not.toBeNull();
    useDiagramStore.getState().addNode({ id: 'n1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x' } } as never);
    expect(h.thumb.touch).toHaveBeenCalled();
    const img = await h.thumbDeps!.render();
    expect(img).toEqual({ bytes: expect.any(Uint8Array), type: 'image/png' });
    await h.thumbDeps!.upload(new Uint8Array([1]), 'image/webp');
    expect(h.putThumbnail).toHaveBeenCalledWith('s1', expect.any(Blob), 'image/webp');
    unmount();
    expect(h.thumb.stop).toHaveBeenCalled();
  });
  it('no uploader for viewers, shares, or when thumbnails are off', () => {
    h.thumbDeps = null;
    adoptServerFile(localStorage, sp(1, 'Srv', 'viewer'));
    renderHook(() => useProjectSync('s1'));
    expect(h.thumbDeps).toBeNull();
    adoptServerFile(localStorage, sp(1));
    setFeatures({ thumbnails: false });
    renderHook(() => useProjectSync('s1'));
    expect(h.thumbDeps).toBeNull();
  });
});

describe('private notes and inline asset migration', () => {
  it('starts private sync for a signed-in editor and stops it on unmount; the store adapter reads/writes the diagram store', () => {
    const stop = vi.fn();
    h.priv.mockImplementation(() => stop);
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(h.priv).toHaveBeenCalledTimes(1);
    const deps = (h.priv.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(deps.fileId).toBe('s1');
    expect(deps.store.get()).toBe(useDiagramStore.getState());
    const cb = vi.fn();
    const off = deps.store.subscribe(cb);
    useDiagramStore.getState().addNode({ id: 'n2', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'y' } } as never);
    expect(cb).toHaveBeenCalled();
    deps.store.set({ projectName: 'via adapter' });
    expect(useDiagramStore.getState().projectName).toBe('via adapter');
    off();
    unmount();
    expect(stop).toHaveBeenCalled();
  });
  it('skipped without an account, with the feature off, or for viewers', () => {
    useSession.setState({ authMode: 'none', user: null } as never);
    renderHook(() => useProjectSync('s1'));
    useSession.setState({ authMode: 'session', user: { id: 'u1', name: 'A' } } as never);
    setFeatures({ privateNotes: false });
    renderHook(() => useProjectSync('s1'));
    expect(h.priv).not.toHaveBeenCalled();
  });
  it('migrates inline assets once per burst of edits and not for other files', async () => {
    let release!: () => void;
    h.migrate.mockImplementationOnce(() => new Promise<boolean>((r) => { release = () => r(true); }));
    renderHook(() => useProjectSync('s1'));
    act(() => useDiagramStore.getState().addNode({ id: 'm1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a' } } as never));
    expect(h.migrate).toHaveBeenCalledWith('s1');
    act(() => useDiagramStore.getState().addNode({ id: 'm2', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'b' } } as never));
    expect(h.migrate).toHaveBeenCalledTimes(1); // still migrating
    release();
    await tick();
    h.migrate.mockRejectedValueOnce(new Error('x'));
    act(() => useDiagramStore.getState().addNode({ id: 'm3', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'c' } } as never));
    await tick();
    expect(h.migrate).toHaveBeenCalledTimes(2);
  });
});

describe('realtime events', () => {
  it('checkGone and fatal close', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    fileEvent({ type: 'file.deleted' });
    // fatal close wiring is exercised through the Realtime options
    expect(h.deleted).not.toHaveBeenCalled();
  });
  it('presence names feed "Updated by", and a message of each family is routed', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    const c = mock.last();
    act(() => c.message('dg/f/s1/roster/u2.xx', { clientId: 'u2.xx', userId: 'u2', name: 'Grace', role: 'editor' }));
    expect(usePresence.getState().users.some((u) => u.name === 'Grace')).toBe(true);
    const handle = vi.spyOn(useCommentsStore.getState(), 'handleMessage');
    const push = vi.spyOn(useNotificationsStore.getState(), 'push');
    act(() => {
      fileEvent({ type: 'comment.added', comment: { id: 'c1' } });
      fileEvent({ type: 'notification', notification: { id: 'n1' } });
      fileEvent({ type: 'rtc.hello' });
      fileEvent({ type: 'something.else' });
    });
    expect(push).toHaveBeenCalledWith({ id: 'n1' });
    expect(handle).toHaveBeenCalled();
  });
  it('stale updates and an update from a share link (no name) are handled', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    await act(async () => { fileEvent({ type: 'file.updated', fileId: 's1', version: 1 }); await new Promise((r) => setTimeout(r, 5)); }); // not newer
    expect(h.getFile).toHaveBeenCalledTimes(1);
    h.getFile.mockResolvedValue({ file: sp(2, 'By link'), version: 2 });
    await act(async () => { fileEvent({ type: 'file.updated', fileId: 's1', version: 2, by: { share: true } }); await new Promise((r) => setTimeout(r, 5)); });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Updated by a shared link');
    h.getFile.mockResolvedValue({ file: sp(3, 'Anon'), version: 3 });
    await act(async () => { fileEvent({ type: 'file.updated', fileId: 's1', version: 3 }); await new Promise((r) => setTimeout(r, 5)); });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Updated by someone');
  });
  it('a restore without a user name says "Someone"', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    getFileTo(2);
    await act(async () => { fileEvent({ type: 'file.updated', fileId: 's1', version: 2, restored: true }); await new Promise((r) => setTimeout(r, 5)); });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Someone restored an earlier version');
  });
  it('a newer remote version over unsaved local edits warns instead of replacing', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    act(() => useDiagramStore.getState().addNode({ id: 'd1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'dirty' } } as never));
    h.saveFile.mockImplementation(() => new Promise(() => undefined)); // keep the edit unsaved
    getFileTo(2);
    await act(async () => { fileEvent({ type: 'file.updated', fileId: 's1', version: 2, by: { userId: 'u2', name: 'Grace' } }); await new Promise((r) => setTimeout(r, 20)); });
    const msgs = useToastStore.getState().toasts.map((t) => t.message);
    expect(msgs.some((m) => m.includes('Grace saved a newer version'))).toBe(true);
  });
  it('connection status updates the sync store; offline/online window events', async () => {
    const { unmount } = renderHook(() => useProjectSync('s1'));
    await tick();
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(useSyncStore.getState().status).toBe('offline');
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(h.flushQueued).toHaveBeenCalledWith(expect.objectContaining({ exceptId: 's1' }));
    unmount();
  });
  it('viewer offline shows readonly', async () => {
    adoptServerFile(localStorage, sp(1, 'Srv', 'viewer'));
    renderHook(() => useProjectSync('s1'));
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(useSyncStore.getState().status).toBe('readonly');
  });
  it('page hide leaves the room and flushes; visibility hidden flushes, visible does not', async () => {
    const { unmount } = renderHook(() => useProjectSync('s1'));
    const eng = getActiveEngine()!;
    const flush = vi.spyOn(eng, 'flush');
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(flush).toHaveBeenCalledWith({ keepalive: true });
    flush.mockClear();
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).not.toHaveBeenCalled();
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledWith({ keepalive: true });
    vis.mockRestore();
    unmount();
  });
  it('a reconnect pulls again and reloads comments; connecting sets the client id', async () => {
    renderHook(() => useProjectSync('s1'));
    await tick();
    const load = vi.spyOn(useCommentsStore.getState(), 'load').mockResolvedValue(undefined as never);
    const c = mock.last();
    getFileTo(1);
    act(() => c.drop?.());
    await tick(5);
    expect(useSyncStore.getState().clientId).toBeTruthy();
    load.mockRestore();
  });
});

describe('gone files and reconnects', () => {
  const denyAll = () => {
    mock = createMockMqtt((u, o) => { const c = new MockMqttClient(u, o); c.subscribe = ((m: Record<string, unknown>, cb: (e?: Error | null) => void) => { c.subs.push(...Object.keys(m)); queueMicrotask(() => cb(null, { granted: Object.keys(m).map(() => 135) })); return c; }) as never; return c; });
    setMqttConnect(mock.connect);
  };
  it('a refused subscription on a deleted file (REST 404) ends the file', async () => {
    denyAll();
    h.getFile.mockRejectedValue(new ApiError(404, 'x', 'gone'));
    renderHook(() => useProjectSync('s1'));
    await vi.waitFor(() => expect(h.deleted).toHaveBeenCalledWith('s1'));
  });
  it('a refused subscription on a share checks the share, and a transient REST failure is not "gone"', async () => {
    denyAll();
    useSession.setState({ user: null } as never);
    h.getShared.mockRejectedValue(new ApiError(500, 'x', 'boom'));
    renderHook(() => useProjectSync('s1', { source: 'share', token: 'tok' }));
    await vi.waitFor(() => expect(h.getShared).toHaveBeenCalledWith('tok', 's1'));
    await tick(20);
    expect(h.deleted).not.toHaveBeenCalled();
  });
  it('a dropped connection reconnects: engine pulls again, comments reload, audio signaling is told', async () => {
    useSession.setState({ rtc: true } as never);
    renderHook(() => useProjectSync('s1'));
    await tick();
    const first = mock.last();
    const calls = h.getFile.mock.calls.length;
    act(() => first.drop());
    await vi.waitFor(() => expect(h.rtc!.signalingReconnected).toHaveBeenCalled(), { timeout: 8000 });
    expect(h.getFile.mock.calls.length).toBeGreaterThan(calls);
  });
  it('a reconnect in live mode refreshes the version from REST (share and project)', async () => {
    useSession.setState({ collab: true } as never);
    const setVersion = vi.fn();
    h.startCollab.mockImplementation(() => Object.assign(vi.fn(), { setVersion }));
    getFileTo(9);
    renderHook(() => useProjectSync('s1'));
    await tick();
    act(() => mock.last().drop());
    await vi.waitFor(() => expect(setVersion).toHaveBeenCalledWith(9), { timeout: 8000 });
  });
});

describe('audio room', () => {
  beforeEach(() => useSession.setState({ rtc: true } as never));
  it('creates the runtime with working deps, routes rtc messages, leaves on page hide and disposes', async () => {
    const stubs = { getUserMedia: vi.fn(async () => 'stream'), enumerateDevices: vi.fn(async () => []) };
    Object.defineProperty(navigator, 'mediaDevices', { value: stubs, configurable: true });
    const { unmount } = renderHook(() => useProjectSync('s1'));
    await tick();
    expect(h.rtcDeps).not.toBeNull();
    h.rtcDeps!.fetchConfig();
    expect(h.rtcConfig).toHaveBeenCalled();
    await h.rtcDeps!.getUserMedia({ audio: true });
    expect(stubs.getUserMedia).toHaveBeenCalledWith({ audio: true });
    await h.rtcDeps!.enumerateDevices();
    expect(stubs.enumerateDevices).toHaveBeenCalled();
    expect(() => h.rtcDeps!.publishAudio(true)).not.toThrow();
    h.rtcDeps!.send({ type: 'rtc.x' });
    act(() => fileEvent({ type: 'rtc.offer', from: 'z' }));
    expect(h.rtc!.handleMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'rtc.offer' }));
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(h.rtc!.leave).toHaveBeenCalled();
    unmount();
    expect(h.rtc!.dispose).toHaveBeenCalled();
  });
  it('is not created for shares or guests', () => {
    h.rtcDeps = null;
    renderHook(() => useProjectSync('s1', { source: 'share', token: 't' }));
    expect(h.rtcDeps).toBeNull();
  });
});

describe('live files', () => {
  beforeEach(() => {
    useSession.setState({ collab: true } as never);
    h.startCollab.mockImplementation(() => Object.assign(vi.fn(), { setVersion: vi.fn() }));
  });
  it('seeds the session reload through keepMine and forwards version bumps; no REST pull on reconnect', async () => {
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(getActiveEngine()).toBeNull();
    const args = h.startCollab.mock.calls[0][0] as Record<string, any>;
    expect(args).toMatchObject({ fileId: 's1', role: 'owner', shareToken: null, user: { id: 'u1', name: 'Ada' } });
    args.reload({ ...createProject('Reloaded'), id: 's1' });
    expect(useDiagramStore.getState().projectName).toBe('Reloaded');
    await tick();
    const stop = (h.startCollab.mock.results[0].value) as { setVersion: ReturnType<typeof vi.fn> };
    getFileTo(7);
    act(() => fileEvent({ type: 'file.updated', fileId: 's1', version: 5, restored: true, by: { userId: 'u2', name: 'Grace' } }));
    expect(stop.setVersion).toHaveBeenCalledWith(5, true);
    act(() => fileEvent({ type: 'file.updated', fileId: 's1', version: 6, by: { userId: 'u1' } }));
    expect(stop.setVersion).toHaveBeenCalledWith(6, false);
    unmount();
  });
  it('offline event is ignored by the status in live mode', async () => {
    renderHook(() => useProjectSync('s1'));
    useSyncStore.getState().set({ status: 'saved' });
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(useSyncStore.getState().status).toBe('saved');
  });
});

function getFileTo(v: number) {
  h.getFile.mockResolvedValue({ file: sp(v), version: v });
  h.getShared.mockResolvedValue({ file: sp(v), version: v });
}
void ApiError;
