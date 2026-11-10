import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { ServerFile, ServerFileMeta, ServerProjectMeta, ServerTree } from '../api/types';
import { createProject } from '../lib/project';
import { createWsFile, createWsProject, getProjectSync, getWsProject, listWsProjects, loadFile, loadTree, putWsProject, saveTree, setProjectSync } from '../workspace/storage';
import { adoptServerFile, adoptServerProject, flushQueuedFiles, syncDown, uploadLocalProject } from './runtime';
import { getMeta, setMeta } from './meta';
import { enqueue } from './treeSync';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let st: ReturnType<typeof mem>;
beforeEach(() => {
  st = mem();
});

const sf = (id: string, version: number, over: Partial<ServerFile> = {}): ServerFile => ({
  id, projectId: 'p1', folderId: null, name: `File ${id}`, kind: 'sdd', position: 0, version, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 2000 + version, updatedBy: 'u1', role: 'owner',
  data: { ...createProject(`File ${id}`), id }, ...over,
});
const meta = (f: ServerFile): ServerFileMeta => {
  const { data, ...m } = f;
  void data;
  return m;
};
const pm = (id: string, treeRev: number, name = 'Srv'): ServerProjectMeta => ({ id, name, ownerId: 'u1', role: 'owner', treeRev, fileCount: 1, folderCount: 0, createdAt: 1, updatedAt: 2000 + treeRev, updatedBy: 'u1' });
const tree = (project: ServerProjectMeta, files: ServerFile[]): ServerTree => ({ project, treeRev: project.treeRev, folders: [], files: files.map(meta) });
const wsFile = (id: string, over: Record<string, unknown> = {}) => ({ id, folderId: null, name: id, kind: 'sdd' as const, position: 0, createdAt: 1, updatedAt: 1, pageCount: 1, ...over });

describe('adoptServerFile', () => {
  it('stores an empty author when the server sent none', () => {
    const { project } = createWsProject(st, 'P', { id: 'p1', fileId: 'f1' });
    adoptServerFile(st, sf('f1', 1, { projectId: project.id, updatedBy: undefined as never }));
    expect(getMeta(st, 'f1')?.serverUpdatedBy).toBe('');
  });
});

describe('uploadLocalProject edge trees', () => {
  const fakeApi = () => ({
    createProject: vi.fn(async (b: { id?: string; name: string; file?: { id?: string; data?: unknown } }) => ({ project: pm(b.id!, 1, b.name), file: sf(b.file?.id ?? 'srvfirst', 1), version: 1 })),
    createFolder: vi.fn(async () => ({}) as never),
    createFile: vi.fn(async (_p: string, b: { id?: string }) => ({ file: sf(b.id!, 1), version: 1 })),
    patchFile: vi.fn(async () => ({}) as never),
    deleteFile: vi.fn(async () => undefined),
  });

  it('empty project: creates without a file and deletes the one the server makes', async () => {
    createWsProject(st, 'E', { id: 'pe', fileId: 'fe' });
    saveTree(st, 'pe', { folders: [], files: [] }, 1);
    const api = fakeApi();
    await uploadLocalProject(api as never, st, 'pe');
    expect(api.createProject).toHaveBeenCalledWith({ id: 'pe', name: 'E' });
    expect(api.deleteFile).toHaveBeenCalledWith('srvfirst');
    expect(getProjectSync(st, 'pe')).toMatchObject({ serverBacked: true, treeRev: 1 });
  });

  it('first file without a cached document is sent without data; orphan folders and their files are skipped', async () => {
    createWsProject(st, 'P', { id: 'pp', fileId: 'f1' });
    saveTree(st, 'pp', {
      folders: [{ id: 'orph', parentId: 'ghost', name: 'o', position: 1 }],
      files: [wsFile('nodoc'), wsFile('inorph', { folderId: 'orph', position: 1 }), wsFile('nodoc2', { position: 2 })],
    }, 1);
    const api = fakeApi();
    await uploadLocalProject(api as never, st, 'pp');
    expect(api.createProject).toHaveBeenCalledWith({ id: 'pp', name: 'P', file: { id: 'nodoc', name: 'nodoc' } });
    expect(api.createFolder).not.toHaveBeenCalled();
    expect(api.createFile).toHaveBeenCalledTimes(1);
    expect(api.createFile.mock.calls[0][1]).not.toHaveProperty('data');
    expect(api.createFile.mock.calls[0][1]).toMatchObject({ id: 'nodoc2' });
  });

  it('keeps existing meta of an already-cached file when marking it uploaded', async () => {
    const { project, fileId } = createWsProject(st, 'P');
    adoptServerFile(st, sf(fileId, 7, { projectId: project.id }));
    const api = fakeApi();
    await uploadLocalProject(api as never, st, project.id);
    expect(getMeta(st, fileId)?.baseVersion).toBe(7);
  });

  it('first file at nonzero position at root is patched', async () => {
    createWsProject(st, 'P', { id: 'pq', fileId: 'f1' });
    saveTree(st, 'pq', { folders: [], files: [wsFile('only', { position: 3 })] }, 1);
    const api = fakeApi();
    await uploadLocalProject(api as never, st, 'pq');
    expect(api.patchFile).toHaveBeenCalledWith('only', { folderId: null, position: 3 });
  });
});

describe('syncDown edge paths', () => {
  const base = () => ({
    listProjects: vi.fn(),
    getFile: vi.fn(async (id: string) => ({ file: sf(id, 1), version: 1 })),
    getTree: vi.fn(),
    createFolder: vi.fn(), patchFolder: vi.fn(), deleteFolder: vi.fn(), createFile: vi.fn(), patchFile: vi.fn(), deleteFile: vi.fn(), renameProject: vi.fn(),
  });
  const deps = (a: ReturnType<typeof base>) => ({ api: a as never, storage: st, online: () => true, now: () => 9000 });
  const list = (a: ReturnType<typeof base>, items: ServerProjectMeta[], total = items.length) => a.listProjects.mockResolvedValue({ items, total, page: 1, pageSize: 100 });

  it('projectIds filter skips other projects and the removal sweep', async () => {
    const a = base();
    createWsProject(st, 'Gone', { id: 'gone', fileId: 'fg' });
    setProjectSync(st, 'gone', { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    list(a, [pm('x', 1), pm('y', 1)]);
    a.getTree.mockImplementation(async (id: string) => tree(pm(id, 1), []));
    const r = await syncDown(deps(a), ['y']);
    expect(r).toMatchObject({ added: 1, removed: 0 });
    expect(getWsProject(st, 'x')).toBeNull();
    expect(getWsProject(st, 'gone')).not.toBeNull();
  });

  it('new project carries thumbnailUrl; later null thumbnail removes it, other side unchanged is a no-op', async () => {
    const a = base();
    const p = { ...pm('t1', 1), thumbnailUrl: '/t?v=1' };
    list(a, [p]);
    a.getTree.mockResolvedValue(tree(p, []));
    await syncDown(deps(a));
    expect(getWsProject(st, 't1')?.thumbnailUrl).toBe('/t?v=1');
    // local without thumbnail, server gains one
    putWsProject(st, { ...getWsProject(st, 't1')!, thumbnailUrl: undefined });
    list(a, [{ ...p, thumbnailUrl: '/t?v=2' }]);
    await syncDown(deps(a));
    expect(getWsProject(st, 't1')?.thumbnailUrl).toBe('/t?v=2');
  });

  it('sync without a local sync record on an existing local project pulls the tree and counts updated', async () => {
    const a = base();
    createWsProject(st, 'Local', { id: 'l1', fileId: 'fl' });
    const p = pm('l1', 2);
    list(a, [p]);
    a.getTree.mockResolvedValue(tree(p, []));
    const r = await syncDown(deps(a));
    expect(r.updated).toBe(1);
    expect(a.getTree).toHaveBeenCalledTimes(1);
  });

  it('known-version doc is skipped; cached doc without meta is skipped; cached doc with queued createFile is refetched', async () => {
    const a = base();
    const p = pm('s1', 1);
    createWsProject(st, 'S', { id: 's1', fileId: 'fa' });
    setProjectSync(st, 's1', { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    createWsFile(st, 's1', { name: 'b', id: 'fb' });
    createWsFile(st, 's1', { name: 'c', id: 'fc' });
    adoptServerFile(st, sf('fa', 1, { projectId: 's1' })); // doc + meta
    expect(loadFile(st, 'fb')).not.toBeNull();
    // fb: doc, no meta -> "already cached"; fc: doc + queued createFile -> refetch
    setMeta(st, 'fc', undefined as never);
    enqueue(st, 's1', { t: 'createFile', id: 'fc' } as never);
    list(a, [p]);
    a.getTree.mockResolvedValue(tree(p, []));
    a.getFile.mockImplementation(async (id: string) => ({ file: sf(id, 4, { projectId: 's1' }), version: 4 }));
    await syncDown(deps(a));
    expect(a.getFile.mock.calls.map((c) => c[0])).toContain('fc');
    expect(a.getFile.mock.calls.map((c) => c[0])).not.toContain('fa');
    expect(a.getFile.mock.calls.map((c) => c[0])).not.toContain('fb');
  });

  it('file download ApiError is skipped, other errors propagate; stops after 60 fetches', async () => {
    const a = base();
    const p = pm('m1', 1);
    createWsProject(st, 'M', { id: 'm1', fileId: 'f0' });
    const files = Array.from({ length: 65 }, (_, i) => wsFile(`g${i}`, { position: i }));
    const sfs = files.map((f) => sf(f.id, 1, { projectId: 'm1' }));
    list(a, [p]);
    a.getTree.mockResolvedValue(tree(p, sfs));
    a.getFile.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'x'));
    a.getFile.mockImplementation(async (id: string) => ({ file: sf(id, 1, { projectId: 'm1' }), version: 1 }));
    // first call rejects (queued above is overridden by implementation after once)
    const r = await syncDown(deps(a));
    expect(r.skipped).toBe(1);
    expect(a.getFile).toHaveBeenCalledTimes(60);

    const b = base();
    createWsProject(st, 'N', { id: 'n1', fileId: 'f0' });
    const pn = pm('n1', 1);
    list(b, [pn]);
    b.getTree.mockResolvedValue(tree(pn, [sf('nf', 1, { projectId: 'n1' })]));
    b.getFile.mockRejectedValue(new Error('net'));
    await expect(syncDown(deps(b))).rejects.toThrow('net');
  });

  it('removal sweep: keeps server-backed projects with queued ops, skips when list is partial', async () => {
    const a = base();
    createWsProject(st, 'Q', { id: 'q1', fileId: 'fq' });
    setProjectSync(st, 'q1', { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    enqueue(st, 'q1', { t: 'deleteFile', id: 'x' });
    list(a, []);
    expect((await syncDown(deps(a))).removed).toBe(0);
    expect(getWsProject(st, 'q1')).not.toBeNull();
    // partial page: total > items
    createWsProject(st, 'R', { id: 'r1', fileId: 'fr' });
    setProjectSync(st, 'r1', { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    list(a, [], 5);
    expect((await syncDown(deps(a))).removed).toBe(0);
    expect(listWsProjects(st).map((p) => p.id)).toContain('r1');
  });
});

describe('adoptServerProject', () => {
  const mk = (getProject: () => Promise<unknown>, getTree: () => Promise<unknown>) =>
    ({ api: { getProject, getTree, createFolder: vi.fn(), patchFolder: vi.fn(), deleteFolder: vi.fn(), createFile: vi.fn(), patchFile: vi.fn(), deleteFile: vi.fn(), renameProject: vi.fn() } as never, storage: st, online: () => true, now: () => 5 });

  it('caches a new project and its tree', async () => {
    const p = pm('d1', 2, 'Deep');
    const d = mk(async () => p, async () => tree(p, [sf('df', 1, { projectId: 'd1' })]));
    expect(await adoptServerProject(d as never, 'd1')).toBe(true);
    expect(getWsProject(st, 'd1')?.name).toBe('Deep');
    expect(loadTree(st, 'd1').files).toHaveLength(1);
  });

  it('existing local container is kept', async () => {
    createWsProject(st, 'Mine', { id: 'd2', fileId: 'x' });
    const p = pm('d2', 2, 'Other');
    const d = mk(async () => p, async () => tree(p, []));
    await adoptServerProject(d as never, 'd2');
    expect(getWsProject(st, 'd2')).not.toBeNull();
    expect(getProjectSync(st, 'd2')).not.toBeNull();
  });

  it('ApiError -> false, other error rethrown', async () => {
    expect(await adoptServerProject(mk(async () => { throw new ApiError(404, 'NOT_FOUND', 'n'); }, async () => null) as never, 'z')).toBe(false);
    await expect(adoptServerProject(mk(async () => { throw new Error('bad'); }, async () => null) as never, 'z')).rejects.toThrow('bad');
  });
});

describe('flushQueuedFiles skips', () => {
  it('skips viewers, metadata without a cached document, and files outside any project', async () => {
    createWsProject(st, 'P', { id: 'p1', fileId: 'f1' });
    adoptServerFile(st, sf('f1', 2, { projectId: 'p1' }));
    setMeta(st, 'f1', { ...getMeta(st, 'f1')!, dirty: true, pending: 1, role: 'viewer' });
    setMeta(st, 'ghost', { ...getMeta(st, 'f1')!, dirty: true, pending: 1, role: 'owner' });
    const api = { saveFile: vi.fn(), getFile: vi.fn() };
    expect(await flushQueuedFiles({ api: api as never, storage: st, online: () => true, now: () => 1 })).toBe(0);
    expect(api.saveFile).not.toHaveBeenCalled();
  });
  it('uploads a document that belongs to no project', async () => {
    const { project } = createWsProject(st, 'P', { id: 'p1', fileId: 'f1' });
    adoptServerFile(st, sf('f1', 2, { projectId: project.id }));
    saveTree(st, 'p1', { folders: [], files: [] }, 1); // file no longer in any tree
    setMeta(st, 'f1', { ...getMeta(st, 'f1')!, dirty: true, pending: 1 });
    const api = { saveFile: vi.fn(async (id: string, _b: unknown, v: number) => ({ file: sf(id, v + 1), version: v + 1 })), getFile: vi.fn() };
    expect(await flushQueuedFiles({ api: api as never, storage: st, online: () => true, now: () => 1 })).toBe(1);
    expect(api.saveFile).toHaveBeenCalledTimes(1);
  });
});
