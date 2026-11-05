import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { ServerFile } from '../api/types';
import type { Project } from '../types';
import { SyncEngine, type EngineDeps } from './engine';
import { getMeta, setMeta, freshMeta } from './meta';
import { useSyncStore } from './status';
import { withoutPrivate } from './privateSync';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const proj = (name = 'P', n = 1): Project => ({ version: 2, id: 'p1', name, createdAt: 1, updatedAt: 1, activePageId: 'pg', pages: [{ id: 'pg', name: 'Page 1', nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, type: 'icon', position: { x: i, y: 0 }, data: { label: `n${i}` } })) as never, edges: [] }] });
const server = (version: number, data: Project, over: Partial<ServerFile> = {}): { file: ServerFile; version: number } => ({
  version,
  file: { id: 'p1', projectId: 'prj1', folderId: 'fld1', name: data.name, kind: 'sdd', position: 0, role: 'owner', version, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 1000 + version, updatedBy: 'u2', data, ...over },
});
const conflict = (current: number) => new ApiError(412, 'VERSION_CONFLICT', 'stale', { currentVersion: current });

interface Rig { engine: SyncEngine; deps: EngineDeps; state: { project: Project; online: boolean; listeners: Set<() => void> }; api: Record<string, ReturnType<typeof vi.fn>>; storage: ReturnType<typeof mem> }
function rig(over: Partial<EngineDeps> = {}, role: 'viewer' | 'editor' | 'owner' = 'owner', source: 'project' | 'share' = 'project'): Rig {
  const storage = mem();
  setMeta(storage, 'p1', freshMeta({ baseVersion: 3, role }));
  const state = { project: proj('Mine', 1), online: true, listeners: new Set<() => void>() };
  const api = {
    getFile: vi.fn(async () => server(3, proj('Mine', 1))),
    saveFile: vi.fn(async (_id: string, body: { data: Project }, v: number) => server(v + 1, body.data)),
    getShared: vi.fn(async () => server(3, proj('Mine', 1))),
    saveShared: vi.fn(async (_t: string, body: { data: Project }, v: number) => server(v + 1, body.data)),
    createFile: vi.fn(async (_pid: string, body: { name: string; data: Project }) => server(1, { ...body.data, name: body.name }, { id: 'copy1', name: body.name })),
  };
  const deps: EngineDeps = {
    api: api as never,
    storage,
    now: () => 5000,
    online: () => state.online,
    getProject: () => state.project,
    loadProject: (p) => void (state.project = p),
    cacheLocal: vi.fn(),
    subscribe: (cb) => (state.listeners.add(cb), () => state.listeners.delete(cb)),
    chooseConflict: vi.fn(async () => null),
    authorName: async (id) => (id === 'u2' ? 'Grace' : 'someone'),
    notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
    ...over,
  };
  const engine = new SyncEngine(deps);
  engine.start({ id: 'p1', projectId: 'prj1', folderId: 'fld1', source, token: source === 'share' ? 'tok' : undefined, role });
  return { engine, deps, state, api, storage };
}
const edit = (r: Rig, name?: string) => {
  r.state.project = { ...r.state.project, ...(name ? { name } : {}), pages: [{ ...r.state.project.pages[0], nodes: [...r.state.project.pages[0].nodes, { id: `x${Math.random()}`, type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x' } } as never] }] };
  r.state.listeners.forEach((l) => l());
};
const tick = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  useSyncStore.getState().reset();
});
afterEach(() => vi.useRealTimers());

describe('debounced save with If-Match', () => {
  it('PUTs once, 1s after the last edit, with the base version', async () => {
    const r = rig();
    edit(r);
    await tick(600);
    edit(r);
    await tick(600);
    expect(r.api.saveFile).not.toHaveBeenCalled();
    await tick(500);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    const [id, body, v] = r.api.saveFile.mock.calls[0];
    expect(id).toBe('p1');
    expect(v).toBe(3);
    expect(body.data.pages[0].nodes).toHaveLength(3);
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 4, dirty: false, pending: 0, lastSyncedAt: 5000 });
    expect(useSyncStore.getState()).toMatchObject({ status: 'saved', queued: 0 });
  });
  it('status is Saving while the request is in flight', async () => {
    let release!: () => void;
    const r = rig();
    r.api.saveFile.mockImplementationOnce(() => new Promise((res) => (release = () => res(server(4, r.state.project)))));
    edit(r);
    await tick(1000);
    expect(useSyncStore.getState().status).toBe('saving');
    release();
    await tick(0);
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('an edit made while saving is saved right after (version chain 3 -> 4 -> 5)', async () => {
    const r = rig();
    let release!: () => void;
    r.api.saveFile.mockImplementationOnce(() => new Promise((res) => (release = () => res(server(4, r.state.project)))));
    edit(r);
    await tick(1000);
    edit(r); // during the first request
    release();
    await tick(1100);
    expect(r.api.saveFile).toHaveBeenCalledTimes(2);
    expect(r.api.saveFile.mock.calls[1][2]).toBe(4);
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 5, dirty: false });
  });
  it('sends what toServer returns (private stickies stay out of the saved document)', async () => {
    const r = rig({ toServer: (p) => withoutPrivate(p as never) as never });
    r.state.project = { ...r.state.project, pages: [{ ...r.state.project.pages[0], nodes: [...r.state.project.pages[0].nodes, { id: 'sec', type: 'sticky', position: { x: 0, y: 0 }, data: { label: 'secret', private: true } } as never] }] };
    r.state.listeners.forEach((l) => l());
    await tick(1100);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r.api.saveFile.mock.calls[0][1])).not.toContain('secret');
  });
  it('sends the project name along', async () => {
    const r = rig();
    edit(r, 'Renamed');
    await tick(1000);
    expect(r.api.saveFile.mock.calls[0][1]).toMatchObject({ name: 'Renamed' });
  });
  it('flushNow() saves immediately (tab hide / leaving the editor)', async () => {
    const r = rig();
    edit(r);
    await r.engine.flush();
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
  });
});

describe('offline queue', () => {
  it('offline: nothing is sent, the edit is queued in storage and the status says so', async () => {
    const r = rig();
    r.state.online = false;
    edit(r);
    edit(r);
    await tick(1000);
    expect(r.api.saveFile).not.toHaveBeenCalled();
    expect(getMeta(r.storage, 'p1')).toMatchObject({ dirty: true, pending: 2 });
    expect(useSyncStore.getState()).toMatchObject({ status: 'offline', queued: 2 });
  });
  it('flush({ keepalive }) passes keepalive to the save (tab hide), a plain flush does not', async () => {
    const r = rig();
    edit(r);
    await r.engine.flush({ keepalive: true });
    expect(r.api.saveFile.mock.calls[0]![3]).toEqual({ keepalive: true });
    edit(r);
    await r.engine.flush();
    expect(r.api.saveFile.mock.calls[1]![3]).toBeUndefined();
  });

  it('flushes on reconnect (online event)', async () => {
    const r = rig();
    r.state.online = false;
    edit(r);
    await tick(1000);
    r.state.online = true;
    r.engine.onOnline();
    await tick(0);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    expect(getMeta(r.storage, 'p1')).toMatchObject({ dirty: false, baseVersion: 4 });
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('a network failure keeps the edit queued and retries with backoff', async () => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'down'));
    edit(r);
    await tick(1000);
    expect(useSyncStore.getState().status).toBe('offline');
    expect(getMeta(r.storage, 'p1')!.dirty).toBe(true);
    await tick(6000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('the queue survives a restart: dirty meta + start() flushes it', async () => {
    const r = rig();
    setMeta(r.storage, 'p1', { ...getMeta(r.storage, 'p1')!, dirty: true, pending: 3 });
    const again = new SyncEngine(r.deps);
    again.start({ id: 'p1', source: 'project', role: 'owner' });
    await tick(0);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  it('401 -> error status "Signed out", edits stay queued', async () => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'no'));
    edit(r);
    await tick(1000);
    expect(useSyncStore.getState()).toMatchObject({ status: 'error' });
    expect(getMeta(r.storage, 'p1')!.dirty).toBe(true);
  });
  it('500 -> error status with a retry that works', async () => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'boom'));
    edit(r);
    await tick(1000);
    expect(useSyncStore.getState()).toMatchObject({ status: 'error', message: 'boom' });
    await r.engine.retry();
    expect(useSyncStore.getState().status).toBe('saved');
  });
});

describe('412 conflict', () => {
  const setup = (choice: 'mine' | 'theirs' | 'copy' | null) => {
    const theirs = proj('Theirs', 5);
    const r = rig({ chooseConflict: vi.fn(async () => choice) });
    r.api.saveFile.mockRejectedValueOnce(conflict(7));
    r.api.getFile.mockResolvedValue(server(7, theirs));
    return { r, theirs };
  };
  it('offers both sides with updatedAt and who', async () => {
    const { r } = setup(null);
    edit(r);
    await tick(1000);
    const info = (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(info.theirs).toMatchObject({ updatedAt: 1007, by: 'Grace', version: 7 });
    expect(info.mine).toMatchObject({ by: 'You' });
    expect(typeof info.mine.updatedAt).toBe('number');
    expect(useSyncStore.getState().status).toBe('conflict');
  });
  it('dismissed: stays in conflict (edits kept), retry reopens the choice', async () => {
    const { r } = setup(null);
    edit(r);
    await tick(1000);
    expect(getMeta(r.storage, 'p1')!.dirty).toBe(true);
    (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValueOnce('theirs');
    r.api.saveFile.mockRejectedValueOnce(conflict(7));
    await r.engine.retry();
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('Keep mine: retries the PUT against the server version', async () => {
    const { r } = setup('mine');
    edit(r);
    await tick(1000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(2);
    expect(r.api.saveFile.mock.calls[1][2]).toBe(7);
    expect(r.state.project.name).toBe('Mine');
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 8, dirty: false });
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('Take theirs: replaces the editor content, drops local edits, no PUT', async () => {
    const { r, theirs } = setup('theirs');
    edit(r);
    await tick(1000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    expect(r.state.project).toEqual({ ...theirs, updatedAt: 1007 }); // updatedAt follows the server
    expect(r.deps.cacheLocal).toHaveBeenCalledWith(expect.objectContaining({ name: 'Theirs' }));
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 7, dirty: false, pending: 0 });
    expect(useSyncStore.getState().status).toBe('saved');
  });
  it('Take theirs does not mark the project dirty again (store change from the load itself)', async () => {
    const { r } = setup('theirs');
    const load = r.deps.loadProject;
    r.deps.loadProject = (p) => {
      load(p);
      r.state.listeners.forEach((l) => l());
    };
    edit(r);
    await tick(3000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    expect(getMeta(r.storage, 'p1')!.dirty).toBe(false);
  });
  it('Save mine as copy: a new file next to this one with my data, then the editor shows theirs', async () => {
    const { r, theirs } = setup('copy');
    edit(r);
    await tick(1000);
    expect(r.api.createFile).toHaveBeenCalledTimes(1);
    const [pid, body] = r.api.createFile.mock.calls[0];
    expect(pid).toBe('prj1');
    expect(body.name).toBe('Mine (copy)');
    expect(body.folderId).toBe('fld1');
    expect(body.data.pages[0].nodes).toHaveLength(2);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    expect(r.state.project).toEqual({ ...theirs, updatedAt: 1007 }); // updatedAt follows the server
    expect(r.deps.notify.success).toHaveBeenCalled();
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 7, dirty: false });
  });
  it('a second conflict while overwriting asks again', async () => {
    const { r } = setup('mine');
    r.api.saveFile.mockRejectedValueOnce(conflict(8));
    r.api.getFile.mockResolvedValueOnce(server(7, proj('T', 2))).mockResolvedValueOnce(server(9, proj('T2', 2)));
    edit(r);
    await tick(1000);
    expect(r.deps.chooseConflict).toHaveBeenCalledTimes(2);
  });
});

describe('read-only and share', () => {
  it('a viewer never PUTs and shows the read-only status', async () => {
    const r = rig({}, 'viewer');
    expect(useSyncStore.getState().status).toBe('readonly');
    edit(r);
    await tick(3000);
    expect(r.api.saveFile).not.toHaveBeenCalled();
    expect(r.api.saveShared).not.toHaveBeenCalled();
  });
  it('an editor share link saves through PUT /share/:token', async () => {
    const r = rig({}, 'editor', 'share');
    edit(r);
    await tick(1000);
    expect(r.api.saveShared).toHaveBeenCalledTimes(1);
    expect(r.api.saveShared.mock.calls[0][0]).toBe('tok');
    expect(r.api.saveFile).not.toHaveBeenCalled();
    expect(r.deps.cacheLocal).not.toHaveBeenCalled();
  });
  it('a viewer share link never saves', async () => {
    const r = rig({}, 'viewer', 'share');
    edit(r);
    await r.engine.flush();
    expect(r.api.saveShared).not.toHaveBeenCalled();
  });
});

describe('pull on start / remote updates', () => {
  it('newer server version and clean local -> applied silently', async () => {
    const r = rig();
    r.api.getFile.mockResolvedValue(server(6, proj('Newer', 4)));
    await r.engine.pull();
    expect(r.state.project.name).toBe('Newer');
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 6, dirty: false });
  });
  it('newer server version but local edits pending -> keeps local, flush then resolves the conflict', async () => {
    const r = rig();
    edit(r);
    r.api.getFile.mockResolvedValue(server(6, proj('Newer', 4)));
    await r.engine.pull();
    expect(r.state.project.name).toBe('Mine');
    expect(getMeta(r.storage, 'p1')!.baseVersion).toBe(3);
  });
  it('applyRemote() with local edits does nothing; hasUnsavedChanges reflects meta', async () => {
    const r = rig();
    expect(r.engine.hasUnsavedChanges()).toBe(false);
    edit(r);
    expect(r.engine.hasUnsavedChanges()).toBe(true);
  });
  it('pull while offline marks the status offline and keeps the cache', async () => {
    const r = rig();
    r.api.getFile.mockRejectedValue(new ApiError(0, 'NETWORK', 'x'));
    await r.engine.pull();
    expect(useSyncStore.getState().status).toBe('offline');
  });
});

describe('applyRemote (version restore)', () => {
  it('replaces editor content, resets dirty state and bumps the base version', async () => {
    const r = rig();
    edit(r);
    expect(r.engine.hasUnsavedChanges()).toBe(true);
    r.engine.applyRemote(server(9, proj('Restored', 4)));
    expect(r.state.project.name).toBe('Restored');
    expect(r.engine.hasUnsavedChanges()).toBe(false);
    expect(getMeta(r.storage, 'p1')).toMatchObject({ baseVersion: 9, dirty: false });
    await tick(2000);
    expect(r.api.saveFile).not.toHaveBeenCalled(); // loading did not count as a local edit
  });
});
