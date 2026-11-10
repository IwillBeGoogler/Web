import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sync/treeRuntime', () => ({ requestTreeSync: vi.fn(), runTreeSync: vi.fn(), flushAllTreeQueues: vi.fn() }));
vi.mock('./prefsSync', () => ({ schedulePrefsPush: vi.fn() }));
import { requestTreeSync } from '../sync/treeRuntime';
import { schedulePrefsPush } from './prefsSync';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { useDialogStore, type DialogReq } from '../lib/dialogs';
import { readQueue } from '../sync/treeSync';
import { getMeta, setMeta } from '../sync/meta';
import { createProject } from '../lib/project';
import { setProjectSync, createWsProject, loadFile, loadTree } from './storage';
import { clearTabSessions } from './tabSession';
import { useWorkspace } from './store';
import {
  canEditTree, cycleActiveTab, deleteDialog, deleteImpact, deleteItem, duplicateItem, expandTo, importOpenedFile, newFileDialog, newFolderDialog, openFile,
  persistView, projectPath, renameCurrentProject, renameDialog, renameItem, toggleFolder, createFileIn, createFolderIn, closeFileTab, closeOtherTabs, moveItem, reopenLastClosed, moveTab,
} from './actions';

const ws = () => useWorkspace.getState();
let pid: string;
let first: string;
const path = () => window.location.pathname;
const topDialog = (): DialogReq => useDialogStore.getState().stack.at(-1)!;
const answer = (v: unknown) => (topDialog().resolve as (x: unknown) => void)(v);

function serverBacked(role: 'owner' | 'viewer' | 'editor' = 'owner') {
  setProjectSync(localStorage, pid, { serverBacked: true, role, treeRev: 0, lastSyncedAt: null });
  ws().reload(localStorage);
}

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  useDiagramStore.getState().reset();
  useToastStore.getState().clear();
  useDialogStore.setState({ stack: [] } as never);
  vi.mocked(requestTreeSync).mockClear();
  vi.mocked(schedulePrefsPush).mockClear();
  window.history.replaceState({}, '', '/');
  useWorkspace.getState().unload();
  const r = createWsProject(localStorage, 'Platform');
  pid = r.project.id;
  first = r.fileId;
  ws().load(localStorage, pid, 'local');
});

describe('no project open', () => {
  it('every action is a no-op', () => {
    ws().unload();
    expect(canEditTree()).toBe(true);
    persistView();
    expect(schedulePrefsPush).not.toHaveBeenCalled();
    openFile(first);
    closeFileTab(first);
    expect(createFileIn(null, 'x')).toBeNull();
    expect(createFolderIn(null, 'x')).toBeNull();
    renameItem({ kind: 'file', id: first }, 'n');
    expect(moveItem({ kind: 'file', id: first }, null)).toBe(false);
    deleteItem({ kind: 'file', id: first });
    duplicateItem({ kind: 'file', id: first });
    renameCurrentProject('x');
    expect(path()).toBe('/');
  });
});

describe('tabs and explorer view', () => {
  it('opening persists the view and pushes preferences; a background open does not navigate', () => {
    const second = createFileIn(null, 'Two', { open: false })!;
    openFile(first);
    expect(schedulePrefsPush).toHaveBeenCalledWith(pid, expect.objectContaining({ tabs: expect.anything() }));
    openFile(second, { background: true });
    expect(ws().tabs.active).toBe(first);
    expect(ws().tabs.open).toEqual([first, second]);
    openFile(second, { replace: true });
    expect(path()).toBe(`/p/${pid}/f/${second}`);
  });
  it('closing the last tab goes to the project page; closing others keeps one and navigates when needed', () => {
    const second = createFileIn(null, 'Two', { open: false })!;
    openFile(first);
    openFile(second, { background: true });
    closeOtherTabs(second);
    expect(ws().tabs.open).toEqual([second]);
    expect(path()).toBe(`/p/${pid}/f/${second}`);
    closeOtherTabs(second);
    closeFileTab(second);
    expect(path()).toBe(projectPath(pid));
    closeFileTab('not-open');
  });
  it('closing the active tab with another open moves to it; inactive tabs leave the URL alone', () => {
    const second = createFileIn(null, 'Two', { open: false })!;
    openFile(first);
    openFile(second);
    closeFileTab(first);
    expect(path()).toBe(`/p/${pid}/f/${second}`);
    openFile(first);
    const url = path();
    closeFileTab(second);
    expect(ws().tabs.open).toEqual([first]);
    expect(path()).toBe(url);
  });
  it('cycleActiveTab moves between tabs, and does nothing with zero or one tab', () => {
    cycleActiveTab(1);
    const second = createFileIn(null, 'Two', { open: false })!;
    openFile(first);
    cycleActiveTab(1);
    expect(ws().tabs.active).toBe(first);
    openFile(second);
    cycleActiveTab(1);
    expect(ws().tabs.active).toBe(first);
    cycleActiveTab(-1);
    expect(ws().tabs.active).toBe(second);
    moveTab(second, 0);
    expect(ws().tabs.open[0]).toBe(second);
  });
  it('reopening with nothing closed toasts and returns null', () => {
    expect(reopenLastClosed()).toBeNull();
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/No recently closed/);
  });
  it('toggleFolder with an explicit state is idempotent; expandTo of a missing entry does nothing', () => {
    const f = createFolderIn(null, 'F')!;
    toggleFolder(f, true);
    toggleFolder(f, true);
    expect(ws().expanded.filter((x) => x === f)).toHaveLength(1);
    toggleFolder(f);
    expect(ws().expanded).not.toContain(f);
    const before = ws().expanded;
    expandTo({ kind: 'file', id: 'ghost' });
    expect(ws().expanded).toBe(before);
  });
});

describe('tree mutations, local vs server-backed', () => {
  it('local projects queue nothing; server-backed ones queue every operation and request a sync', () => {
    createFileIn(null, 'Local');
    expect(readQueue(localStorage, pid)).toEqual([]);
    serverBacked();
    const f = createFolderIn(null, 'Dir')!;
    const file = createFileIn(f, 'Inside', { open: false })!;
    renameItem({ kind: 'file', id: file }, '  Renamed ');
    renameItem({ kind: 'folder', id: f }, 'Dir2');
    renameItem({ kind: 'folder', id: f }, '   ');
    expect(moveItem({ kind: 'file', id: file }, null, 0)).toBe(true);
    const g = createFolderIn(null, 'Other dir')!;
    expect(moveItem({ kind: 'folder', id: f }, g)).toBe(true);
    renameCurrentProject(' New name ');
    const types = readQueue(localStorage, pid).map((o) => o.t);
    expect(types).toEqual(expect.arrayContaining(['createFolder', 'createFile', 'patchFile', 'patchFolder', 'renameProject']));
    expect(readQueue(localStorage, pid).find((o) => o.t === 'renameProject')).toMatchObject({ name: 'New name' });
    expect(requestTreeSync).toHaveBeenCalledWith(pid);
  });
  it('a failed move (into itself) returns false and queues nothing new', () => {
    serverBacked();
    const f = createFolderIn(null, 'Dir')!;
    const n = readQueue(localStorage, pid).length;
    expect(moveItem({ kind: 'folder', id: f }, f)).toBe(false);
    expect(readQueue(localStorage, pid)).toHaveLength(n);
  });
  it('renaming the open file renames the editor document', () => {
    useDiagramStore.getState().loadProject({ ...createProject('A'), id: first });
    renameItem({ kind: 'file', id: first }, 'Brand new');
    expect(useDiagramStore.getState().projectName).toBe('Brand new');
    const other = createFileIn(null, 'Other', { open: false })!;
    renameItem({ kind: 'file', id: other }, 'Zed');
    expect(useDiagramStore.getState().projectName).toBe('Brand new');
  });
  it('viewers cannot change anything', () => {
    serverBacked('viewer');
    expect(canEditTree()).toBe(false);
    expect(createFileIn(null, 'x')).toBeNull();
    expect(createFolderIn(null, 'x')).toBeNull();
    renameItem({ kind: 'file', id: first }, 'x');
    expect(moveItem({ kind: 'file', id: first }, null)).toBe(false);
    deleteItem({ kind: 'file', id: first });
    duplicateItem({ kind: 'file', id: first });
    renameCurrentProject('x');
    expect(loadTree(localStorage, pid).files).toHaveLength(1);
    expect(readQueue(localStorage, pid)).toEqual([]);
  });
  it('deleting a missing entry is a no-op; deleting a file prunes tabs, stars, recents and meta and moves the URL', () => {
    deleteItem({ kind: 'file', id: 'ghost' });
    const second = createFileIn(null, 'Two', { open: false })!;
    openFile(first);
    openFile(second, { background: true });
    useWorkspace.getState().setView({ starred: [first, second] });
    setMeta(localStorage, first, { baseVersion: 1, role: 'owner', dirty: false, pending: 0, lastSyncedAt: null, serverUpdatedAt: 0, serverUpdatedBy: '' });
    serverBacked();
    deleteItem({ kind: 'file', id: first });
    expect(ws().tabs.open).toEqual([second]);
    expect(ws().starred).toEqual([second]);
    expect(ws().recent).not.toContain(first);
    expect(getMeta(localStorage, first)).toBeNull();
    expect(path()).toBe(`/p/${pid}/f/${second}`);
    expect(readQueue(localStorage, pid).some((o) => o.t === 'deleteFile')).toBe(true);
  });
  it('deleting the only open file sends the user to the project page; deleting a folder queues deleteFolder', () => {
    serverBacked();
    const d = createFolderIn(null, 'D')!;
    openFile(first);
    deleteItem({ kind: 'folder', id: d });
    expect(readQueue(localStorage, pid).some((o) => o.t === 'deleteFolder')).toBe(true);
    expect(path()).toContain(first);
    deleteItem({ kind: 'file', id: first });
    expect(path()).toBe(projectPath(pid));
  });
  it('duplicating a folder queues parents before children; duplicating a file opens the copy', () => {
    serverBacked();
    const a = createFolderIn(null, 'A')!;
    const b = createFolderIn(a, 'B')!;
    createFileIn(b, 'deep', { open: false });
    const before = readQueue(localStorage, pid).length;
    duplicateItem({ kind: 'folder', id: a });
    const ops = readQueue(localStorage, pid).slice(before);
    const folderOps = ops.filter((o) => o.t === 'createFolder') as { id: string; parentId: string | null }[];
    expect(folderOps).toHaveLength(2);
    expect(folderOps[1].parentId).toBe(folderOps[0].id);
    expect(ops.some((o) => o.t === 'createFile')).toBe(true);
    duplicateItem({ kind: 'file', id: first });
    expect(ws().tabs.active).not.toBe(first);
    duplicateItem({ kind: 'file', id: 'ghost' });
  });
  it('deleteImpact counts folders including the root and files inside', () => {
    const a = createFolderIn(null, 'A')!;
    const b = createFolderIn(a, 'B')!;
    createFileIn(a, 'f1', { open: false });
    createFileIn(b, 'f2', { open: false });
    expect(deleteImpact({ kind: 'file', id: first })).toEqual({ folders: 0, files: 1 });
    expect(deleteImpact({ kind: 'folder', id: a })).toEqual({ folders: 2, files: 2 });
  });
});

describe('dialog flows', () => {
  it('newFileDialog / newFolderDialog create on confirm, nothing on cancel, and validate names', async () => {
    createFileIn(null, 'Taken', { open: false });
    const p = newFileDialog(null);
    const req = topDialog() as { opts: { initial: string; validate: (v: string) => string | null | undefined } };
    expect(req.opts.initial).toBeTruthy();
    expect(req.opts.validate('Taken')).toBeTruthy();
    expect(req.opts.validate('Fresh name')).toBeFalsy();
    answer('Fresh name');
    const id = await p;
    expect(loadTree(localStorage, pid).files.some((f) => f.id === id && f.name === 'Fresh name')).toBe(true);

    const c = newFileDialog(null);
    answer(null);
    expect(await c).toBeNull();

    const pf = newFolderDialog(null);
    expect((topDialog() as { opts: { validate: (v: string) => unknown } }).opts.validate('ok')).toBeFalsy();
    answer('Folder X');
    expect(await pf).toBeTruthy();
    const cf = newFolderDialog(null);
    answer(null);
    expect(await cf).toBeNull();
  });
  it('renameDialog renames, can be cancelled, and refuses viewers and unknown entries', async () => {
    expect(await renameDialog({ kind: 'file', id: 'ghost' })).toBeNull();
    const p = renameDialog({ kind: 'file', id: first });
    expect((topDialog() as { opts: { title: string; initial: string } }).opts).toMatchObject({ title: 'Rename file', initial: 'Platform' });
    answer('Renamed');
    expect(await p).toBe('Renamed');
    expect(loadFile(localStorage, first)!.name).toBe('Renamed');
    const f = createFolderIn(null, 'Dir')!;
    const pf = renameDialog({ kind: 'folder', id: f });
    expect((topDialog() as { opts: { title: string; validate: (v: string) => unknown } }).opts.title).toBe('Rename folder');
    answer(null);
    expect(await pf).toBeNull();
    serverBacked('viewer');
    expect(await renameDialog({ kind: 'file', id: first })).toBeNull();
  });
  it('deleteDialog words the confirmation per kind and deletes only when confirmed', async () => {
    expect(await deleteDialog({ kind: 'file', id: 'ghost' })).toBe(false);
    const second = createFileIn(null, 'Two', { open: false })!;
    const a = createFolderIn(null, 'A')!;
    const b = createFolderIn(a, 'B')!;
    const c = createFolderIn(b, 'C')!;
    void c;
    createFileIn(a, 'x', { open: false });
    let p = deleteDialog({ kind: 'file', id: second });
    expect((topDialog() as { opts: { message: string; title: string } }).opts.message).toMatch(/file and all its pages/);
    answer(false);
    expect(await p).toBe(false);
    expect(loadTree(localStorage, pid).files.some((f) => f.id === second)).toBe(true);
    p = deleteDialog({ kind: 'folder', id: a });
    expect((topDialog() as { opts: { message: string } }).opts.message).toMatch(/with 2 subfolders and 1 file inside/);
    answer(true);
    expect(await p).toBe(true);
    expect(loadTree(localStorage, pid).folders).toHaveLength(0);
    const lone = createFolderIn(null, 'Lone')!;
    createFileIn(lone, 'a', { open: false });
    createFileIn(lone, 'b', { open: false });
    const sub = createFolderIn(lone, 'Sub')!;
    void sub;
    p = deleteDialog({ kind: 'folder', id: lone });
    expect((topDialog() as { opts: { message: string } }).opts.message).toMatch(/with 1 subfolder and 2 files/);
    answer(false);
    await p;
    const empty = createFolderIn(null, 'Empty')!;
    p = deleteDialog({ kind: 'folder', id: empty });
    expect((topDialog() as { opts: { message: string } }).opts.message).toMatch(/folder and 0 files/);
    answer(false);
    await p;
  });
});

describe('importOpenedFile', () => {
  const doc = (name: string, pages = 1) => {
    const d = createProject(name);
    for (let i = 1; i < pages; i++) {
      const p = { ...d.pages[0], id: `pg${i}`, name: `Page ${i + 1}` };
      d.pages.push(p);
    }
    return d;
  };
  it('replaces a file that already exists, extra pages become new files, a server-backed file is marked dirty', () => {
    const d = { ...doc('Platform', 2), id: first };
    serverBacked();
    setMeta(localStorage, first, { baseVersion: 3, role: 'owner', dirty: false, pending: 0, lastSyncedAt: null, serverUpdatedAt: 0, serverUpdatedBy: '' });
    const r = importOpenedFile(d);
    expect(r).toMatchObject({ projectId: pid, fileId: first, created: 'replaced' });
    expect(r.fileIds).toHaveLength(2);
    expect(getMeta(localStorage, first)).toMatchObject({ dirty: true, pending: 1 });
    expect(ws().tree.files).toHaveLength(2);
  });
  it('replaces a file of a project that is not the open one without touching the open workspace', () => {
    const other = createWsProject(localStorage, 'Other');
    const d = { ...doc('Other'), id: other.fileId };
    const r = importOpenedFile(d);
    expect(r.created).toBe('replaced');
    expect(r.projectId).toBe(other.project.id);
    expect(ws().projectId).toBe(pid);
  });
  it('with a project open (editable): new files at the root, queued when server-backed', () => {
    serverBacked();
    const r = importOpenedFile(doc('Imported', 2));
    expect(r.created).toBe('file');
    expect(r.projectId).toBe(pid);
    expect(r.fileIds).toHaveLength(2);
    expect(r.fileId).toBe(r.fileIds[0]);
    expect(readQueue(localStorage, pid).filter((o) => o.t === 'createFile')).toHaveLength(2);
    expect(ws().tree.files.map((f) => f.id)).toEqual(expect.arrayContaining(r.fileIds));
  });
  it('without a project, or for a viewer, a new project is created', () => {
    ws().unload();
    const r = importOpenedFile(doc('Fresh', 3));
    expect(r.created).toBe('project');
    expect(r.fileIds).toHaveLength(3);
    expect(r.projectId).not.toBe(pid);
    ws().load(localStorage, pid, 'local');
    serverBacked('viewer');
    expect(importOpenedFile(doc('Another')).created).toBe('project');
  });
});
