import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { ServerFile, ServerTree } from '../api/types';
import { addWsFolder, createWsFile, createWsProject, deleteWsEntry, getProjectSync, loadFile, loadTree, moveWsEntry, renameWsEntry } from '../workspace/storage';
import type { ProjectTree } from '../workspace/types';
import { getMeta } from './meta';
import { applyOp, compact, enqueue, flushTreeQueue, projectsWithQueue, queueLength, readQueue, reconcileTree, syncProjectTree, type TreeOp, type TreeSyncDeps } from './treeSync';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let st: ReturnType<typeof mem>;
beforeEach(() => {
  st = mem();
});

const file = (over: Partial<ServerFile> = {}): ServerFile => ({
  id: 'f', projectId: 'p', folderId: null, name: 'f', kind: 'sdd', position: 0, version: 1, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 2, updatedBy: 'u', role: 'owner',
  data: { version: 2, id: 'f', name: 'f', createdAt: 1, updatedAt: 1, activePageId: 'pg', pages: [{ id: 'pg', name: 'P', nodes: [], edges: [] }] }, ...over,
});
const api = () => ({
  createFolder: vi.fn(async (_p: string, b: { id?: string; name: string }) => ({ id: b.id!, projectId: 'p', parentId: null, name: b.name, position: 0, createdAt: 1, updatedAt: 1 })),
  patchFolder: vi.fn(async () => ({}) as never),
  deleteFolder: vi.fn(async () => ({ deletedFolders: 1, deletedFiles: 0 })),
  createFile: vi.fn(async (_p: string, b: { id?: string }) => ({ file: file({ id: b.id! }), version: 1 })),
  patchFile: vi.fn(async () => ({}) as never),
  deleteFile: vi.fn(async () => undefined),
  renameProject: vi.fn(async () => ({}) as never),
  getTree: vi.fn(async (): Promise<ServerTree> => ({ project: { id: 'p', name: 'P', role: 'owner', treeRev: 1, createdAt: 1, updatedAt: 1, updatedBy: 'u' }, treeRev: 1, folders: [], files: [] })),
});
const deps = (a: ReturnType<typeof api>, online = true): TreeSyncDeps => ({ api: a as never, storage: st, online: () => online, now: () => 5000 });

describe('applyOp (pure replay)', () => {
  const base = (): ProjectTree => ({ folders: [{ id: 'a', parentId: null, name: 'a', position: 0 }], files: [{ id: 'f', folderId: null, name: 'f', kind: 'sdd', position: 1, createdAt: 0, updatedAt: 0, pageCount: 1 }] });
  it('creates, renames, moves, deletes', () => {
    let t = applyOp(base(), { t: 'createFolder', id: 'b', name: 'b', parentId: 'a', position: 0 });
    t = applyOp(t, { t: 'createFile', id: 'g', name: 'g', folderId: 'b', position: 0, kind: 'erd' });
    t = applyOp(t, { t: 'patchFile', id: 'f', name: 'renamed', folderId: 'a' });
    expect(t.files.find((x) => x.id === 'f')).toMatchObject({ name: 'renamed', folderId: 'a' });
    expect(t.files.find((x) => x.id === 'g')?.kind).toBe('erd');
    t = applyOp(t, { t: 'deleteFolder', id: 'a' });
    expect(t).toEqual({ folders: [], files: [] });
  });
  it('ignores impossible ops (cycle, unknown parent) instead of corrupting the tree', () => {
    let t = applyOp(base(), { t: 'createFolder', id: 'b', name: 'b', parentId: 'a', position: 0 });
    expect(applyOp(t, { t: 'patchFolder', id: 'a', parentId: 'b' })).toEqual(t);
    expect(applyOp(t, { t: 'createFile', id: 'x', name: 'x', folderId: 'ghost', position: 0, kind: 'sdd' })).toEqual(t);
    t = applyOp(t, { t: 'patchFile', id: 'f', position: 99 });
    expect(t.files[0].position).toBe(99);
  });
});

describe('compact', () => {
  it('merges consecutive patches of the same entity', () => {
    const ops: TreeOp[] = [{ t: 'patchFile', id: 'f', name: 'x' }, { t: 'patchFile', id: 'f', folderId: 'a' }, { t: 'patchFile', id: 'f', name: 'y' }];
    expect(compact(ops)).toEqual([{ t: 'patchFile', id: 'f', name: 'y', folderId: 'a' }]);
  });
  it('forgets a file created and deleted offline, and everything done to it', () => {
    const ops: TreeOp[] = [{ t: 'createFile', id: 'n', name: 'n', folderId: null, position: 0, kind: 'sdd' }, { t: 'patchFile', id: 'n', name: 'm' }, { t: 'patchFile', id: 'other', name: 'o' }, { t: 'deleteFile', id: 'n' }];
    expect(compact(ops)).toEqual([{ t: 'patchFile', id: 'other', name: 'o' }]);
  });
  it('keeps a delete of an existing file, and only the last project rename', () => {
    expect(compact([{ t: 'deleteFile', id: 'old' }])).toEqual([{ t: 'deleteFile', id: 'old' }]);
    expect(compact([{ t: 'renameProject', name: 'a' }, { t: 'renameProject', name: 'b' }])).toEqual([{ t: 'renameProject', name: 'b' }]);
  });
  it('different entities are never merged', () => {
    const ops: TreeOp[] = [{ t: 'patchFile', id: 'a', name: 'x' }, { t: 'patchFile', id: 'b', name: 'y' }];
    expect(compact(ops)).toEqual(ops);
  });
});

describe('queue persistence', () => {
  it('is per project, survives reload, and is listed', () => {
    enqueue(st, 'p1', { t: 'deleteFile', id: 'a' });
    enqueue(st, 'p1', [{ t: 'deleteFile', id: 'b' }]);
    expect(queueLength(st, 'p1')).toBe(2);
    expect(readQueue(st, 'p2')).toEqual([]);
    st.setItem('sdd:ws:q:broken', '{nope');
    expect(readQueue(st, 'broken')).toEqual([]);
  });
});

describe('flushTreeQueue', () => {
  it('sends queued ops in order and empties the queue', async () => {
    const { project } = createWsProject(st, 'P');
    const a = api();
    enqueue(st, project.id, [
      { t: 'createFolder', id: 'fld_1', name: 'infra', parentId: null, position: 1 },
      { t: 'createFile', id: 'fil_2', name: 'db', folderId: 'fld_1', position: 0, kind: 'sdd' },
      { t: 'patchFile', id: 'fil_2', name: 'database' },
      { t: 'deleteFile', id: 'old' },
      { t: 'renameProject', name: 'Renamed' },
    ]);
    const r = await flushTreeQueue(deps(a), project.id);
    expect(r).toMatchObject({ sent: 5, dropped: 0, left: 0, stopped: null });
    expect(a.createFolder).toHaveBeenCalledWith(project.id, { id: 'fld_1', name: 'infra', parentId: null, position: 1 });
    expect(a.createFile.mock.invocationCallOrder[0]).toBeGreaterThan(a.createFolder.mock.invocationCallOrder[0]);
    expect(a.deleteFile).toHaveBeenCalledWith('old');
    expect(a.renameProject).toHaveBeenCalledWith(project.id, 'Renamed');
    expect(queueLength(st, project.id)).toBe(0);
  });

  it('sends the local document with a queued create and marks the file server backed', async () => {
    const { project } = createWsProject(st, 'P');
    const { file: doc } = createWsFile(st, project.id, { name: 'new', id: 'fil_offline' });
    enqueue(st, project.id, { t: 'createFile', id: 'fil_offline', name: 'new', folderId: null, position: 1, kind: 'sdd' });
    const a = api();
    await flushTreeQueue(deps(a), project.id);
    expect(a.createFile.mock.calls[0][1]).toMatchObject({ id: 'fil_offline', data: expect.objectContaining({ id: doc.id }) });
    expect(getMeta(st, 'fil_offline')).toMatchObject({ baseVersion: 1, dirty: false });
  });

  it('stays queued while offline and stops at the first network error', async () => {
    const { project } = createWsProject(st, 'P');
    enqueue(st, project.id, [{ t: 'deleteFile', id: 'a' }, { t: 'deleteFile', id: 'b' }]);
    const off = await flushTreeQueue(deps(api(), false), project.id);
    expect(off).toMatchObject({ sent: 0, left: 2, stopped: 'offline' });
    const a = api();
    a.deleteFile.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'down'));
    const r = await flushTreeQueue(deps(a), project.id);
    expect(r).toMatchObject({ sent: 0, left: 2, stopped: 'offline' });
    const again = await flushTreeQueue(deps(a), project.id);
    expect(again).toMatchObject({ sent: 2, left: 0, stopped: null });
  });

  it('stops on 401/5xx, drops ops the server rejects, treats 404 on delete as done', async () => {
    const { project } = createWsProject(st, 'P');
    const a = api();
    enqueue(st, project.id, [{ t: 'patchFolder', id: 'x', parentId: 'y' }, { t: 'deleteFile', id: 'gone' }, { t: 'deleteFolder', id: 'gone2' }]);
    a.patchFolder.mockRejectedValueOnce(new ApiError(409, 'CYCLE', 'cycle'));
    a.deleteFile.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'nf'));
    a.deleteFolder.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'nf'));
    expect(await flushTreeQueue(deps(a), project.id)).toMatchObject({ sent: 2, dropped: 1, left: 0 });
    enqueue(st, project.id, { t: 'deleteFile', id: 'z' });
    a.deleteFile.mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'no'));
    expect(await flushTreeQueue(deps(a), project.id)).toMatchObject({ stopped: 'unauthorized', left: 1 });
    a.deleteFile.mockRejectedValueOnce(new ApiError(503, 'HTTP_503', 'down'));
    expect(await flushTreeQueue(deps(a), project.id)).toMatchObject({ stopped: 'offline', left: 1 });
  });

  it('an empty queue is a no-op', async () => {
    const a = api();
    expect(await flushTreeQueue(deps(a), 'nothing')).toMatchObject({ sent: 0, left: 0, stopped: null });
    expect(projectsWithQueue(st)).toEqual([]);
  });
});

describe('reconcileTree (server truth + pending ops on top)', () => {
  const server = (over: Partial<ServerTree> = {}): ServerTree => ({
    project: { id: 'p', name: 'P', role: 'owner', treeRev: 7, createdAt: 1, updatedAt: 1, updatedBy: 'u' }, treeRev: 7,
    folders: [], files: [], ...over,
  });
  const sf = (id: string, name: string, folderId: string | null = null, position = 0) => ({ id, projectId: 'p', folderId, name, kind: 'sdd' as const, position, version: 1, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 1, updatedBy: 'u' });

  it("takes the server's tree (others' renames, moves, deletes) and records the revision", () => {
    const { project, fileId } = createWsProject(st, 'P');
    const r = reconcileTree(st, project.id, server({ files: [sf(fileId, 'Renamed by someone', null, 3)], folders: [{ id: 'fld_x', projectId: 'p', parentId: null, name: 'theirs', position: 1, createdAt: 1, updatedAt: 1 }] }));
    expect(loadTree(st, project.id).files[0]).toMatchObject({ name: 'Renamed by someone', position: 3 });
    expect(loadTree(st, project.id).folders.map((f) => f.name)).toEqual(['theirs']);
    expect(r.removedFiles).toEqual([]);
    expect(getProjectSync(st, project.id)).toMatchObject({ serverBacked: true, treeRev: 7, role: 'owner' });
  });

  it('files deleted on the server lose their local copy', () => {
    const { project, fileId } = createWsProject(st, 'P');
    const { file } = createWsFile(st, project.id, { name: 'doomed' });
    const r = reconcileTree(st, project.id, server({ files: [sf(fileId, 'P')] }));
    expect(r.removedFiles).toEqual([file.id]);
    expect(loadFile(st, file.id)).toBeNull();
  });

  it('offline work wins over a pull: pending creates survive, pending renames and deletes are replayed', () => {
    const { project, fileId } = createWsProject(st, 'P');
    const { file: mine } = createWsFile(st, project.id, { name: 'offline file', id: 'fil_mine1' });
    renameWsEntry(st, project.id, { kind: 'file', id: fileId }, 'my rename');
    addWsFolder(st, project.id, { id: 'fld_mine', name: 'mine', parentId: null });
    deleteWsEntry(st, project.id, { kind: 'file', id: 'ghost' });
    enqueue(st, project.id, [
      { t: 'createFile', id: mine.id, name: 'offline file', folderId: null, position: 5, kind: 'sdd' },
      { t: 'patchFile', id: fileId, name: 'my rename' },
      { t: 'createFolder', id: 'fld_mine', name: 'mine', parentId: null, position: 6 },
    ]);
    const r = reconcileTree(st, project.id, server({ files: [sf(fileId, 'server name')] }));
    const names = loadTree(st, project.id).files.map((f) => f.name).sort();
    expect(names).toEqual(['my rename', 'offline file']);
    expect(loadTree(st, project.id).folders.map((f) => f.id)).toEqual(['fld_mine']);
    expect(r.removedFiles).toEqual([]);
    expect(loadFile(st, mine.id)).not.toBeNull();
  });

  it('a project renamed elsewhere is renamed here unless a local rename is pending', () => {
    const { project } = createWsProject(st, 'Old');
    reconcileTree(st, project.id, server({ project: { id: 'p', name: 'From server', role: 'owner', treeRev: 1, createdAt: 1, updatedAt: 1, updatedBy: 'u' } }));
    expect(JSON.parse(st.getItem('sdd:ws:projects')!)[0].name).toBe('From server');
    enqueue(st, project.id, { t: 'renameProject', name: 'Local' });
    reconcileTree(st, project.id, server({ project: { id: 'p', name: 'Again', role: 'owner', treeRev: 2, createdAt: 1, updatedAt: 1, updatedBy: 'u' } }));
    expect(JSON.parse(st.getItem('sdd:ws:projects')!)[0].name).toBe('From server');
  });

  it('move into a folder the server already deleted is dropped silently', () => {
    const { project, fileId } = createWsProject(st, 'P');
    enqueue(st, project.id, { t: 'patchFile', id: fileId, folderId: 'fld_deleted_remotely' });
    reconcileTree(st, project.id, server({ files: [sf(fileId, 'P')] }));
    expect(loadTree(st, project.id).files[0].folderId).toBeNull();
  });
});

describe('syncProjectTree', () => {
  it('flush then pull; skips the pull when the queue could not be sent', async () => {
    const { project, fileId } = createWsProject(st, 'P');
    moveWsEntry(st, project.id, { kind: 'file', id: fileId }, null, 0);
    enqueue(st, project.id, { t: 'patchFile', id: fileId, name: 'n' });
    const a = api();
    a.getTree.mockResolvedValue({ project: { id: project.id, name: 'P', role: 'owner', treeRev: 4, createdAt: 1, updatedAt: 1, updatedBy: 'u' }, treeRev: 4, folders: [], files: [{ id: fileId, projectId: project.id, folderId: null, name: 'n', kind: 'sdd', position: 0, version: 1, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 1, updatedBy: 'u' }] });
    const r = await syncProjectTree(deps(a), project.id);
    expect(r).toMatchObject({ pulled: true, flushed: { sent: 1, left: 0 } });
    expect(getProjectSync(st, project.id)?.treeRev).toBe(4);
    enqueue(st, project.id, { t: 'deleteFile', id: 'x' });
    a.deleteFile.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'down'));
    a.getTree.mockClear();
    const off = await syncProjectTree(deps(a), project.id);
    expect(off.pulled).toBe(false);
    expect(a.getTree).not.toHaveBeenCalled();
    expect(queueLength(st, project.id)).toBe(1);
  });
});
