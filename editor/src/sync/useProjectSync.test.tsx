import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getFile = vi.fn();
const saveFile = vi.fn();
vi.mock('../api/api', async (orig) => {
  const m = await orig<typeof import('../api/api')>();
  return { ...m, BASE_URL: '/api', api: { ...m.api, getFile: (...a: unknown[]) => getFile(...a), saveFile: (...a: unknown[]) => saveFile(...a) } };
});
import { useSession } from '../api/session';
import { createProject } from '../lib/project';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { createWsProject } from '../workspace/storage';
import { adoptServerFile } from './runtime';
import { useProjectSync } from './useProjectSync';
import { useEditorSession, usePresence, useSyncStore } from './status';
import { getActiveEngine } from './active';
import { captureActive } from '../workspace/tabSession';
import { useCollabStore } from '../collab/store';
import { useDialogStore } from '../lib/dialogs';
import { setTicketProvider } from '../lib/host';
import { setMqttConnect } from '../realtime/link';
import { createMockMqtt, type MockMqtt } from '../realtime/mockMqtt';
import { topics } from '../realtime/topics';

let mock: MockMqtt;
const fileEvent = (o: object) => mock.last().message(topics.fileEvents('s1'), o);
const sp = (version: number, name = 'Srv') => ({ id: 's1', projectId: 'prj1', folderId: null, name, kind: 'sdd' as const, position: 0, role: 'owner' as const, version, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 100 + version, updatedBy: 'u2', data: { ...createProject(name), id: 's1' } });

beforeEach(() => {
  localStorage.clear();
  mock = createMockMqtt();
  setMqttConnect(mock.connect);
  setTicketProvider(async () => 'tk');
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } });
  useSyncStore.getState().reset();
  useToastStore.getState().clear();
  getFile.mockReset();
  saveFile.mockReset();
  createWsProject(localStorage, 'Srv', { id: 'prj1', fileId: 's1' });
  adoptServerFile(localStorage, sp(1));
  getFile.mockResolvedValue({ file: sp(1), version: 1 });
  useDiagramStore.getState().loadProject({ ...createProject('Srv'), id: 's1' });
});
afterEach(() => {
  setMqttConnect(null);
  setTicketProvider(null);
  vi.unstubAllGlobals();
});

describe('useProjectSync', () => {
  it('files of local-only projects are not synced', () => {
    const { fileId } = createWsProject(localStorage, 'L');
    renderHook(() => useProjectSync(fileId));
    expect(useEditorSession.getState().source).toBe('local');
    expect(getActiveEngine()).toBeNull();
  });
  it('is a no-op in local mode', () => {
    useSession.setState({ mode: 'local' });
    renderHook(() => useProjectSync('s1'));
    expect(getActiveEngine()).toBeNull();
  });
  it('server-backed project: engine on, the client id of the connection is set, the roster is published', async () => {
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(useEditorSession.getState()).toMatchObject({ source: 'server', role: 'owner', readOnly: false });
    expect(getActiveEngine()).not.toBeNull();
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    const c = mock.last();
    expect(c.opts.clientId).toMatch(/^uu1\./);
    expect(c.opts.will?.topic).toBe(topics.presence('s1', c.opts.clientId));
    act(() => {
      c.message('dg/f/s1/roster/' + c.opts.clientId, { clientId: c.opts.clientId, userId: 'u1', name: 'Ada', role: 'owner' });
      c.message('dg/f/s1/roster/u2.xx', { clientId: 'u2.xx', userId: 'u2', name: 'Grace', role: 'editor' });
    });
    expect(useSyncStore.getState().clientId).toBe(c.opts.clientId);
    expect(usePresence.getState().users).toHaveLength(2);
    unmount();
    expect(getActiveEngine()).toBeNull();
    expect(usePresence.getState().users).toEqual([]);
  });
  it('another user saves: silently pulls and toasts "Updated by X"', async () => {
    renderHook(() => useProjectSync('s1'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    getFile.mockResolvedValue({ file: sp(2, 'Renamed by Grace'), version: 2 });
    await act(async () => {
      fileEvent({ type: 'file.updated', fileId: 's1', version: 2, by: { userId: 'u2', name: 'Grace' } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(useDiagramStore.getState().projectName).toBe('Renamed by Grace');
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Updated by Grace');
  });
  it('another user restores a version: toasts "X restored an earlier version"; own restore is quiet', async () => {
    renderHook(() => useProjectSync('s1'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    getFile.mockResolvedValue({ file: sp(2), version: 2 });
    await act(async () => {
      fileEvent({ type: 'file.updated', fileId: 's1', version: 2, restored: true, by: { userId: 'u2', name: 'Grace' } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Grace restored an earlier version']);
    useToastStore.getState().clear();
    getFile.mockResolvedValue({ file: sp(3), version: 3 });
    await act(async () => {
      fileEvent({ type: 'file.updated', fileId: 's1', version: 3, restored: true, by: { userId: 'u1', name: 'Ada' } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(useToastStore.getState().toasts).toEqual([]);
  });
  it('the same user saved in ANOTHER TAB: a clean tab reloads silently (no toast, no dialog)', async () => {
    renderHook(() => useProjectSync('s1'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    getFile.mockResolvedValue({ file: sp(2, 'Edited in my other tab'), version: 2 });
    await act(async () => {
      fileEvent({ type: 'file.updated', fileId: 's1', version: 2, by: { userId: 'u1', name: 'Ada' } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(useDiagramStore.getState().projectName).toBe('Edited in my other tab');
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(useDialogStore.getState().stack).toEqual([]);
  });
  it('viewer role is read-only', () => {
    adoptServerFile(localStorage, { ...sp(1), role: 'viewer' });
    renderHook(() => useProjectSync('s1'));
    expect(useEditorSession.getState()).toMatchObject({ readOnly: true, role: 'viewer' });
    expect(useSyncStore.getState().status).toBe('readonly');
  });
});

describe('what counts as an edit for the server', () => {
  it('panning / zooming never uploads by itself; a real edit does (and carries the viewport)', async () => {
    saveFile.mockImplementation(async (_id: string, body: { data: unknown }, v: number) => ({ file: { ...sp(v + 1), data: body.data }, version: v + 1 }));
    renderHook(() => useProjectSync('s1', undefined, 'prj1'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    const page = useDiagramStore.getState().activePageId;
    act(() => useDiagramStore.getState().setPageViewport(page, { x: 5, y: 5, zoom: 1.2 }));
    await act(async () => void (await new Promise((r) => setTimeout(r, 1300))));
    expect(saveFile).not.toHaveBeenCalled();
    expect(getActiveEngine()!.hasUnsavedChanges()).toBe(false);
    act(() => useDiagramStore.getState().addNode({ id: 'n1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'n1' } } as never));
    await act(async () => void (await new Promise((r) => setTimeout(r, 1300))));
    expect(saveFile).toHaveBeenCalledTimes(1);
    const sent = saveFile.mock.calls[0][1] as { data: { pages: { viewport?: unknown }[] } };
    expect(sent.data.pages[0].viewport).toEqual({ x: 5, y: 5, zoom: 1.2 });
  });

  it('a late flush after switching to another file uploads the file it belongs to, never the one on screen', async () => {
    saveFile.mockImplementation(async (id: string, body: { data: unknown }, v: number) => ({ file: { ...sp(v + 1), id, data: body.data }, version: v + 1 }));
    const { unmount } = renderHook(() => useProjectSync('s1', undefined, 'prj1'));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    act(() => useDiagramStore.getState().addNode({ id: 'mine', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'mine' } } as never));
    captureActive('s1'); // what openFile() does before switching tabs
    act(() => useDiagramStore.getState().loadProject({ ...createProject('Other'), id: 'other-file' })); // the editor store now shows another file
    unmount(); // cleanup flushes the engine of s1
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(saveFile).toHaveBeenCalledTimes(1);
    const [id, body] = saveFile.mock.calls[0] as [string, { data: { id: string; pages: { nodes: { id: string }[] }[] } }];
    expect(id).toBe('s1');
    expect(body.data.pages[0].nodes.map((n) => n.id)).toEqual(['mine']);
  });
});


describe('live (Yjs) files never use the REST engine', () => {
  beforeEach(() => {
    useSession.setState({ collab: true, rtc: false });
    useCollabStore.getState().attach(null);
  });
  afterEach(() => useSession.setState({ collab: false }));

  it('no SyncEngine: no If-Match save, no 412 conflict state, no conflict dialog; a live session is attached', async () => {
    saveFile.mockRejectedValue(new Error('must never be called'));
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(getActiveEngine()).toBeNull();
    expect(useCollabStore.getState().session).not.toBeNull();
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    // an edit, and somebody else's file.updated: nothing goes through REST
    act(() => useDiagramStore.getState().addNode({ id: 'n1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x' } } as never));
    await act(async () => {
      fileEvent({ type: 'file.updated', fileId: 's1', version: 9, by: { userId: 'u2', name: 'Grace' }, collab: true });
      await new Promise((r) => setTimeout(r, 1400));
    });
    expect(saveFile).not.toHaveBeenCalled();
    expect(getFile).not.toHaveBeenCalledTimes(2); // only the initial seed of the cache, never a pull
    expect(useSyncStore.getState().status).not.toBe('conflict');
    expect(useDialogStore.getState().stack).toEqual([]);
    expect(useToastStore.getState().toasts.map((t) => t.message)).not.toContain('Updated by Grace');
    unmount();
    expect(useCollabStore.getState().session).toBeNull();
  });

  it('a document that still has several pages keeps the legacy path', () => {
    useDiagramStore.getState().addPage('Second');
    const { unmount } = renderHook(() => useProjectSync('s1'));
    expect(getActiveEngine()).not.toBeNull();
    expect(useCollabStore.getState().session).toBeNull();
    unmount();
  });

  it('viewers get a read-only live session', () => {
    adoptServerFile(localStorage, { ...sp(1), role: 'commenter' });
    renderHook(() => useProjectSync('s1'));
    expect(useCollabStore.getState().readOnly).toBe(true);
    expect(useEditorSession.getState().readOnly).toBe(true);
  });
});
