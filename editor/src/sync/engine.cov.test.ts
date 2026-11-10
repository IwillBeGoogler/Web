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

const status = () => useSyncStore.getState().status;
const msg = () => useSyncStore.getState().message;
const net = () => new ApiError(0, 'NETWORK', 'down');

describe('flush / retry / online edges', () => {
  it('flush while a save is in flight queues exactly one follow-up save', async () => {
    let release: (v: unknown) => void = () => {};
    const r = rig({ debounceMs: 10 });
    r.api.saveFile.mockImplementationOnce(() => new Promise((res) => (release = res)) as never);
    edit(r);
    const first = r.engine.flush();
    edit(r);
    const second = r.engine.flush();
    release(server(4, r.state.project));
    await first;
    await second;
    await tick(50);
    expect(r.api.saveFile.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it('flush offline reports offline; flush with nothing dirty or after stop is a no-op', async () => {
    const r = rig();
    await r.engine.flush();
    expect(r.api.saveFile).not.toHaveBeenCalled();
    edit(r);
    r.state.online = false;
    await r.engine.flush();
    expect(status()).toBe('offline');
    r.engine.stop();
    await r.engine.flush();
  });
  it('keepalive flush passes the keepalive option for project and share targets', async () => {
    const r = rig();
    edit(r);
    await r.engine.flush({ keepalive: true });
    expect(r.api.saveFile.mock.calls[0][3]).toEqual({ keepalive: true });
    const s = rig({}, 'editor', 'share');
    edit(s);
    await s.engine.flush({ keepalive: true });
    expect(s.api.saveShared.mock.calls[0][4]).toEqual({ keepalive: true });
    edit(s);
    await s.engine.flush();
    expect(s.api.saveShared.mock.calls[1]).toHaveLength(4);
  });
  it('retry(): clean pulls, dirty flushes; onOnline: clean pulls, dirty flushes', async () => {
    const r = rig();
    await r.engine.retry();
    expect(r.api.getFile).toHaveBeenCalledTimes(1);
    r.engine.onOnline();
    await tick();
    expect(r.api.getFile).toHaveBeenCalledTimes(2);
    edit(r);
    await r.engine.retry();
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
    edit(r);
    r.engine.onOnline();
    await tick();
    expect(r.api.saveFile).toHaveBeenCalledTimes(2);
  });
  it('a share target is not pulled on reconnect', async () => {
    const r = rig({}, 'editor', 'share');
    r.engine.onOnline();
    await tick();
    expect(r.api.getShared).not.toHaveBeenCalled();
  });
  it('starting offline with queued edits shows offline; starting read-only shows readonly and ignores edits', async () => {
    const storage = mem();
    setMeta(storage, 'p1', freshMeta({ baseVersion: 3, role: 'owner', dirty: true, pending: 2 } as never));
    const r = rig({ storage, online: () => false });
    expect(status()).toBe('offline');
    r.engine.stop();
    const v = rig({}, 'viewer');
    expect(status()).toBe('readonly');
    edit(v);
    await tick(2000);
    expect(v.api.saveFile).not.toHaveBeenCalled();
    expect(v.engine.baseVersion).toBe(3);
  });
  it('markDirty while offline marks the status offline', async () => {
    const r = rig();
    r.state.online = false;
    edit(r);
    expect(status()).toBe('offline');
  });
  it('a dirty queue found at start is uploaded right away', async () => {
    const storage = mem();
    setMeta(storage, 'p1', freshMeta({ baseVersion: 3, role: 'owner', dirty: true, pending: 1 } as never));
    const r = rig({ storage });
    await tick(5);
    expect(r.api.saveFile).toHaveBeenCalledTimes(1);
  });
});

describe('save failures', () => {
  it.each([
    [new Error('boom'), 'boom'],
    ['plain string', 'Unknown error'],
    [new ApiError(401, 'UNAUTH', 'x'), 'Signed out'],
    [new ApiError(403, 'FORBIDDEN', 'x'), 'permission'],
    [new ApiError(404, 'NOT_FOUND', 'x'), 'no longer available'],
    [new ApiError(500, 'SERVER', 'server exploded'), 'server exploded'],
  ])('%s', async (err, text) => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(err);
    edit(r);
    await r.engine.flush();
    expect(status()).toBe('error');
    expect(msg()).toContain(text);
  });
  it('429 retries after retryAfter seconds, default 30 s; network errors back off exponentially', async () => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(new ApiError(429, 'RATE', 'slow down', undefined, undefined, 2));
    edit(r);
    await r.engine.flush();
    await tick(2100);
    expect(r.api.saveFile).toHaveBeenCalledTimes(2);
    r.api.saveFile.mockRejectedValueOnce(new ApiError(429, 'RATE', 'slow down'));
    edit(r);
    await r.engine.flush();
    await tick(29_000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(3);
    await tick(2000);
    expect(r.api.saveFile).toHaveBeenCalledTimes(4);
    r.api.saveFile.mockRejectedValue(net());
    edit(r);
    await r.engine.flush();
    expect(status()).toBe('offline');
    await tick(5100);
    await tick(10_100);
    expect(r.api.saveFile.mock.calls.length).toBeGreaterThan(5);
  });
});

describe('conflicts', () => {
  const conflicted = () => {
    const r = rig();
    r.api.saveFile.mockRejectedValueOnce(conflict(4));
    r.api.getFile.mockResolvedValue(server(4, proj('Theirs', 2), { updatedBy: 'u2' } as never));
    return r;
  };
  it('fetching the server version fails: the failure is reported', async () => {
    const r = conflicted();
    r.api.getFile.mockRejectedValue(new ApiError(500, 'SERVER', 'cannot fetch'));
    edit(r);
    await r.engine.flush();
    expect(status()).toBe('error');
    expect(msg()).toContain('cannot fetch');
  });
  it('a failing author lookup falls back to "someone"; no decision keeps the conflict state', async () => {
    const chooseConflict = vi.fn(async () => null);
    const r = rig({ chooseConflict, authorName: async () => { throw new Error('x'); } });
    r.api.saveFile.mockRejectedValueOnce(conflict(4));
    r.api.getFile.mockResolvedValue(server(4, proj('Theirs', 2)));
    edit(r);
    await r.engine.flush();
    expect(chooseConflict.mock.calls[0][0].theirs.by).toBe('someone');
    expect(status()).toBe('conflict');
  });
  it('theirs replaces the editor content', async () => {
    const r = conflicted();
    (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('theirs');
    edit(r);
    await r.engine.flush();
    expect(r.state.project.name).toBe('Theirs');
    expect(r.deps.notify.info).toHaveBeenCalled();
    expect(status()).toBe('saved');
  });
  it('copy saves a new file then takes theirs; a failing copy reports the error', async () => {
    const r = conflicted();
    (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('copy');
    edit(r);
    await r.engine.flush();
    expect(r.api.createFile).toHaveBeenCalled();
    expect(r.deps.notify.success).toHaveBeenCalled();
    const f = conflicted();
    (f.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('copy');
    f.api.createFile.mockRejectedValueOnce(new ApiError(500, 'SERVER', 'no copy'));
    edit(f);
    await f.engine.flush();
    expect(msg()).toContain('no copy');
  });
  it('mine overwrites; a second conflict asks again; after the max rounds it errors', async () => {
    const r = conflicted();
    (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('mine');
    edit(r);
    await r.engine.flush();
    expect(r.api.saveFile).toHaveBeenLastCalledWith('p1', expect.anything(), 4);
    const m = rig();
    (m.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('mine');
    m.api.saveFile.mockRejectedValueOnce(conflict(9)).mockRejectedValueOnce(conflict(9)).mockRejectedValueOnce(conflict(9)).mockRejectedValueOnce(new ApiError(500, 'SERVER', 'gave up'));
    m.api.getFile.mockResolvedValue(server(9, proj('Theirs', 2)));
    edit(m);
    await m.engine.flush();
    expect((m.deps.chooseConflict as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    const o = rig();
    (o.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('mine');
    o.api.saveFile.mockRejectedValueOnce(conflict(4)).mockRejectedValueOnce(new ApiError(500, 'SERVER', 'second failed'));
    o.api.getFile.mockResolvedValue(server(4, proj('Theirs', 2)));
    edit(o);
    await o.engine.flush();
    expect(msg()).toContain('second failed');
  });
  it('a server that keeps conflicting stops after the max rounds with an error instead of looping forever', async () => {
    const r = rig();
    (r.deps.chooseConflict as ReturnType<typeof vi.fn>).mockResolvedValue('mine');
    r.api.saveFile.mockRejectedValue(conflict(9));
    r.api.getFile.mockResolvedValue(server(9, proj('Theirs', 2)));
    edit(r);
    await r.engine.flush();
    expect(status()).toBe('error');
    expect((r.deps.chooseConflict as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('conflict on a share target fetches the shared file', async () => {
    const r = rig({}, 'editor', 'share');
    r.api.saveShared.mockRejectedValueOnce(conflict(4));
    r.api.getShared.mockResolvedValue(server(4, proj('Theirs', 2)));
    edit(r);
    await r.engine.flush();
    expect(r.api.getShared).toHaveBeenCalled();
  });
});

describe('pull and remote updates', () => {
  it('pull applies a newer version when clean and ignores it when dirty (then schedules a save)', async () => {
    const r = rig();
    r.api.getFile.mockResolvedValue(server(7, proj('Newer', 3)));
    await r.engine.pull();
    expect(r.state.project.name).toBe('Newer');
    const d = rig();
    d.api.getFile.mockResolvedValue(server(7, proj('Newer', 3)));
    edit(d);
    await d.engine.pull();
    expect(d.state.project.name).not.toBe('Newer');
    await tick(5);
    expect(d.api.saveFile).toHaveBeenCalled();
  });
  it('pull picks up a role change; errors set the status by kind; stopped engines ignore pulls', async () => {
    const r = rig();
    r.api.getFile.mockResolvedValue(server(3, proj('Mine', 1), { role: 'viewer' } as never));
    await r.engine.pull();
    expect(r.api.getFile).toHaveBeenCalled();
    const n = rig();
    n.api.getFile.mockRejectedValue(net());
    await n.engine.pull();
    expect(status()).toBe('offline');
    const o = rig();
    o.api.getFile.mockRejectedValue(new ApiError(500, 'SERVER', 'bad'));
    await o.engine.pull();
    expect(status()).toBe('error');
    const u = rig();
    u.api.getFile.mockRejectedValue(new ApiError(401, 'UNAUTH', 'x'));
    await u.engine.pull();
    const s = rig();
    s.engine.stop();
    await s.engine.pull();
    const ro = rig({}, 'viewer');
    ro.api.getFile.mockRejectedValue(net());
    await ro.engine.pull();
    expect(status()).toBe('readonly');
  });
  it('applyRemoteUpdate: stale, dirty, applied; applyRemote and reloadFromServer', async () => {
    const r = rig();
    expect(await r.engine.applyRemoteUpdate(3)).toBe('stale');
    edit(r);
    expect(await r.engine.applyRemoteUpdate(9)).toBe('dirty');
    const c = rig();
    c.api.getFile.mockResolvedValue(server(9, proj('Remote', 2)));
    expect(await c.engine.applyRemoteUpdate(9)).toBe('applied');
    c.engine.applyRemote(server(10, proj('Restored', 1)));
    expect(c.state.project.name).toBe('Restored');
    c.api.getFile.mockResolvedValue(server(11, proj('Reloaded', 1)));
    await c.engine.reloadFromServer();
    expect(c.state.project.name).toBe('Reloaded');
    c.api.getFile.mockRejectedValue(net());
    await c.engine.reloadFromServer();
    expect(status()).toBe('offline');
    c.engine.stop();
    await c.engine.reloadFromServer();
    c.engine.applyRemote(server(12, proj('x')));
  });
  it('a clean engine without meta never applies remote updates', async () => {
    const engine = new SyncEngine({ ...rig().deps });
    expect(await engine.applyRemoteUpdate(5)).toBe('stale');
    expect(engine.baseVersion).toBe(0);
  });
});
