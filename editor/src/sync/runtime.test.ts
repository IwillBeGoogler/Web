import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { ServerFile, ServerFileMeta, ServerFolder, ServerProjectMeta, ServerTree } from '../api/types';
import { createProject } from '../lib/project';
import { addWsFolder, createWsFile, createWsProject, getProjectSync, getWsProject, listWsProjects, loadFile, loadTree, moveWsEntry, saveFile } from '../workspace/storage';
import { adoptServerFile, flushQueuedFiles, hasUnsent, localOnlyProjects, syncDown, uploadLocalProject } from './runtime';
import { freshMeta, getMeta, setMeta } from './meta';
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
const tree = (project: ServerProjectMeta, files: ServerFile[], folders: ServerFolder[] = []): ServerTree => ({ project, treeRev: project.treeRev, folders, files: files.map(meta) });

describe('adoptServerFile', () => {
  it('caches the file under its id with sync metadata', () => {
    const { project } = createWsProject(st, 'P', { id: 'p1', fileId: 'f1' });
    adoptServerFile(st, sf('f1', 4, { name: 'Hello', projectId: project.id }));
    expect(loadFile(st, 'f1')?.name).toBe('Hello');
    expect(getMeta(st, 'f1')).toMatchObject({ baseVersion: 4, dirty: false, role: 'owner' });
    expect(loadTree(st, 'p1').files[0].name).toBe('Hello');
  });
});

describe('uploadLocalProject', () => {
  const fakeApi = () => {
    const calls: string[] = [];
    return {
      calls,
      createProject: vi.fn(async (b: { id?: string; name: string; file?: { id?: string } }) => {
        calls.push(`project:${b.id}`);
        return { project: pm(b.id!, 1, b.name), file: sf(b.file?.id ?? 'first', 1), version: 1 };
      }),
      createFolder: vi.fn(async (_p: string, b: { id?: string; name: string }) => {
        calls.push(`folder:${b.id}`);
        return { id: b.id!, projectId: 'p', parentId: null, name: b.name, position: 0, createdAt: 1, updatedAt: 1 } as ServerFolder;
      }),
      createFile: vi.fn(async (_p: string, b: { id?: string }) => {
        calls.push(`file:${b.id}`);
        return { file: sf(b.id!, 1), version: 1 };
      }),
      patchFile: vi.fn(async (id: string) => {
        calls.push(`patch:${id}`);
        return {} as never;
      }),
      deleteFile: vi.fn(async (id: string) => void calls.push(`delete:${id}`)),
    };
  };

  it('keeps every id: project + first file, then folders parents-first, then the other files with their documents', async () => {
    const { project, fileId } = createWsProject(st, 'Plat');
    const a = addWsFolder(st, project.id, { id: 'fld_a', name: 'a', parentId: null });
    addWsFolder(st, project.id, { id: 'fld_b', name: 'b', parentId: a.id });
    createWsFile(st, project.id, { name: 'deep', id: 'fil_deep', folderId: 'fld_b' });
    const api = fakeApi();
    await uploadLocalProject(api as never, st, project.id);
    expect(api.createProject).toHaveBeenCalledWith({ id: project.id, name: 'Plat', file: expect.objectContaining({ id: fileId, name: 'Plat', data: expect.anything() }) });
    expect(api.calls).toEqual([`project:${project.id}`, 'folder:fld_a', 'folder:fld_b', 'file:fil_deep']);
    expect(api.createFile.mock.calls[0][1]).toMatchObject({ id: 'fil_deep', folderId: 'fld_b', data: expect.objectContaining({ id: 'fil_deep' }) });
    expect(getProjectSync(st, project.id)).toMatchObject({ serverBacked: true });
    expect(getMeta(st, fileId)).toMatchObject({ baseVersion: 1 });
    expect(getMeta(st, 'fil_deep')).not.toBeNull();
    expect(localOnlyProjects(st)).toEqual([]);
  });

  it('places the first file when it lives in a folder', async () => {
    const { project, fileId } = createWsProject(st, 'P');
    addWsFolder(st, project.id, { id: 'fld_x', name: 'x', parentId: null });
    moveWsEntry(st, project.id, { kind: 'file', id: fileId }, 'fld_x');
    const api = fakeApi();
    await uploadLocalProject(api as never, st, project.id);
    expect(api.calls).toEqual([`project:${project.id}`, 'folder:fld_x', `patch:${fileId}`]);
    expect(api.patchFile).toHaveBeenCalledWith(fileId, { folderId: 'fld_x', position: expect.any(Number) });
  });

  it('keeps the project local when the upload fails', async () => {
    const { project } = createWsProject(st, 'Mine');
    const api = fakeApi();
    api.createProject.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'down'));
    await expect(uploadLocalProject(api as never, st, project.id)).rejects.toBeInstanceOf(ApiError);
    expect(localOnlyProjects(st).map((p) => p.name)).toEqual(['Mine']);
    expect(getProjectSync(st, project.id)).toBeNull();
  });

  it('unknown project', async () => {
    await expect(uploadLocalProject(fakeApi() as never, st, 'nope')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('syncDown', () => {
  const base = () => {
    const a = {
      listProjects: vi.fn(),
      getFile: vi.fn(async (id: string) => ({ file: sf(id, 1), version: 1 })),
      getTree: vi.fn(),
      createFolder: vi.fn(), patchFolder: vi.fn(), deleteFolder: vi.fn(), createFile: vi.fn(async (_p: string, b: { id?: string }) => ({ file: sf(b.id!, 1), version: 1 })), patchFile: vi.fn(), deleteFile: vi.fn(), renameProject: vi.fn(),
    };
    return a;
  };
  const deps = (a: ReturnType<typeof base>) => ({ api: a as never, storage: st, online: () => true, now: () => 9000 });

  it('adds server projects with their tree and downloads the file documents', async () => {
    const a = base();
    const p = pm('srv1', 3, 'From server');
    const f = sf('fil_s1', 2, { projectId: 'srv1' });
    a.listProjects.mockResolvedValue({ items: [p], total: 1, page: 1, pageSize: 100 });
    a.getTree.mockResolvedValue(tree(p, [f]));
    a.getFile.mockResolvedValue({ file: f, version: 2 });
    const r = await syncDown(deps(a));
    expect(r).toMatchObject({ added: 1, skipped: 0, removed: 0 });
    expect(getWsProject(st, 'srv1')?.name).toBe('From server');
    expect(loadTree(st, 'srv1').files.map((x) => x.id)).toEqual(['fil_s1']);
    expect(loadFile(st, 'fil_s1')).not.toBeNull();
    expect(getMeta(st, 'fil_s1')?.baseVersion).toBe(2);
    expect(getProjectSync(st, 'srv1')?.treeRev).toBe(3);
  });

  it('keeps the server preview url of a project on its local record', async () => {
    const a = base();
    const p = { ...pm('srv1', 3), thumbnailUrl: '/api/files/fil_s1/thumbnail?v=aaa' };
    const f = sf('fil_s1', 2, { projectId: 'srv1' });
    a.listProjects.mockResolvedValue({ items: [p], total: 1, page: 1, pageSize: 100 });
    a.getTree.mockResolvedValue(tree(p, [f]));
    await syncDown(deps(a));
    expect(getWsProject(st, 'srv1')?.thumbnailUrl).toBe('/api/files/fil_s1/thumbnail?v=aaa');
    a.listProjects.mockResolvedValue({ items: [{ ...p, thumbnailUrl: '/api/files/fil_s1/thumbnail?v=bbb' }], total: 1, page: 1, pageSize: 100 });
    await syncDown(deps(a));
    expect(getWsProject(st, 'srv1')?.thumbnailUrl).toBe('/api/files/fil_s1/thumbnail?v=bbb');
    a.listProjects.mockResolvedValue({ items: [{ ...p, thumbnailUrl: null }], total: 1, page: 1, pageSize: 100 });
    await syncDown(deps(a));
    expect(getWsProject(st, 'srv1')?.thumbnailUrl).toBeUndefined();
  });

  it('does not re-download an unchanged project (tree revision equal, nothing queued)', async () => {
    const a = base();
    const p = pm('srv1', 3);
    const f = sf('fil_s1', 2, { projectId: 'srv1' });
    a.listProjects.mockResolvedValue({ items: [p], total: 1, page: 1, pageSize: 100 });
    a.getTree.mockResolvedValue(tree(p, [f]));
    await syncDown(deps(a));
    a.getTree.mockClear();
    a.getFile.mockClear();
    await syncDown(deps(a));
    expect(a.getTree).not.toHaveBeenCalled();
    expect(a.getFile).not.toHaveBeenCalled();
  });

  it('pulls again when the server tree revision moved, flushing queued tree operations first', async () => {
    const a = base();
    const { project, fileId } = createWsProject(st, 'P', { id: 'srv1', fileId: 'fil_1' });
    adoptServerFile(st, sf(fileId, 1, { projectId: project.id }));
    await (async () => {
      const p0 = pm('srv1', 1);
      a.listProjects.mockResolvedValue({ items: [p0], total: 1, page: 1, pageSize: 100 });
      a.getTree.mockResolvedValue(tree(p0, [sf(fileId, 1, { projectId: 'srv1' })]));
      await syncDown(deps(a));
    })();
    enqueue(st, 'srv1', { t: 'deleteFile', id: 'something' });
    const p1 = pm('srv1', 5);
    a.listProjects.mockResolvedValue({ items: [p1], total: 1, page: 1, pageSize: 100 });
    a.getTree.mockResolvedValue(tree(p1, [sf(fileId, 1, { projectId: 'srv1', name: 'renamed elsewhere' })]));
    await syncDown(deps(a));
    expect(a.deleteFile).toHaveBeenCalledWith('something');
    expect(loadTree(st, 'srv1').files[0].name).toBe('renamed elsewhere');
    expect(getProjectSync(st, 'srv1')?.treeRev).toBe(5);
  });

  it('never overwrites a dirty local document', async () => {
    const a = base();
    const { project, fileId } = createWsProject(st, 'P', { id: 'srv1', fileId: 'fil_1' });
    adoptServerFile(st, sf(fileId, 1, { projectId: project.id }));
    setMeta(st, fileId, { ...getMeta(st, fileId)!, dirty: true, pending: 2 });
    const p = pm('srv1', 9);
    a.listProjects.mockResolvedValue({ items: [p], total: 1, page: 1, pageSize: 100 });
    a.getTree.mockResolvedValue(tree(p, [sf(fileId, 5, { projectId: 'srv1' })]));
    await syncDown(deps(a));
    expect(a.getFile).not.toHaveBeenCalled();
    expect(getMeta(st, fileId)?.dirty).toBe(true);
  });

  it('removes cached projects that are gone from the server unless something is unsent', async () => {
    const a = base();
    const gone = createWsProject(st, 'Gone', { id: 'gone1', fileId: 'fil_g' });
    const keep = createWsProject(st, 'Dirty', { id: 'keep1', fileId: 'fil_k' });
    createWsProject(st, 'Local only', { id: 'loc1', fileId: 'fil_l' });
    for (const [p, f] of [[gone.project.id, gone.fileId], [keep.project.id, keep.fileId]] as const) {
      adoptServerFile(st, sf(f, 1, { projectId: p }));
      st.setItem(`sdd:ws:pmeta:${p}`, JSON.stringify({ serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 }));
    }
    setMeta(st, keep.fileId, { ...getMeta(st, keep.fileId)!, dirty: true, pending: 1 });
    a.listProjects.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const r = await syncDown(deps(a));
    expect(r.removed).toBe(1);
    expect(listWsProjects(st).map((p) => p.id).sort()).toEqual(['keep1', 'loc1']);
  });

  it('a project that fails with an API error is skipped, the rest still sync', async () => {
    const a = base();
    const good = pm('good', 1);
    a.listProjects.mockResolvedValue({ items: [pm('bad', 1), good], total: 2, page: 1, pageSize: 100 });
    a.getTree.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new ApiError(403, 'FORBIDDEN', 'no');
      return tree(good, []);
    });
    const r = await syncDown(deps(a));
    expect(getWsProject(st, 'good')).not.toBeNull();
    expect(r.added).toBe(2);
  });
});

describe('flushQueuedFiles (offline queue for documents that are not open)', () => {
  const setup = () => {
    const { project } = createWsProject(st, 'P', { id: 'p1', fileId: 'f1' });
    adoptServerFile(st, sf('f1', 2, { projectId: project.id }));
    createWsFile(st, project.id, { name: 'two', id: 'f2' });
    adoptServerFile(st, sf('f2', 2, { projectId: project.id }));
  };
  it('uploads each dirty file with its base version and clears the queue', async () => {
    setup();
    setMeta(st, 'f1', { ...getMeta(st, 'f1')!, dirty: true, pending: 3 });
    const api = { saveFile: vi.fn(async (id: string, _b: unknown, v: number) => ({ file: sf(id, v + 1), version: v + 1 })), getFile: vi.fn() };
    const n = await flushQueuedFiles({ api: api as never, storage: st, online: () => true, now: () => 1 });
    expect(n).toBe(1);
    expect(api.saveFile).toHaveBeenCalledTimes(1);
    expect(api.saveFile.mock.calls[0][0]).toBe('f1');
    expect(api.saveFile.mock.calls[0][2]).toBe(2);
    expect(getMeta(st, 'f1')).toMatchObject({ dirty: false, baseVersion: 3 });
  });
  it('skips the open file and does nothing offline', async () => {
    setup();
    setMeta(st, 'f1', { ...getMeta(st, 'f1')!, dirty: true, pending: 1 });
    const api = { saveFile: vi.fn(), getFile: vi.fn() };
    expect(await flushQueuedFiles({ api: api as never, storage: st, online: () => false, now: () => 1 })).toBe(0);
    expect(await flushQueuedFiles({ api: api as never, storage: st, online: () => true, now: () => 1, exceptId: 'f1' })).toBe(0);
    expect(api.saveFile).not.toHaveBeenCalled();
  });
  it('hasUnsent sees dirty documents and queued tree operations', () => {
    setup();
    expect(hasUnsent(st)).toBe(false);
    enqueue(st, 'p1', { t: 'deleteFile', id: 'x' });
    expect(hasUnsent(st)).toBe(true);
  });
});
void freshMeta;
void saveFile;
