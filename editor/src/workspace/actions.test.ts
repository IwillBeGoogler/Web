import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sync/treeRuntime', () => ({ requestTreeSync: vi.fn(), runTreeSync: vi.fn(), flushAllTreeQueues: vi.fn() }));
import { requestTreeSync } from '../sync/treeRuntime';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { readQueue } from '../sync/treeSync';
import { setProjectSync, createWsProject, loadFile, loadTree } from './storage';
import { activateTab, closeFileTab, closeOtherTabs, createFileIn, createFolderIn, deleteItem, duplicateItem, expandTo, filePath, moveItem, moveTab, openFile, projectPath, renameCurrentProject, renameDialog, renameItem, reopenLastClosed, toggleFolder, toggleStar } from './actions';
import { readView, useWorkspace } from './store';
import { activateFile, captureActive, clearTabSessions, hasTabSession } from './tabSession';
import { createProject } from '../lib/project';
import { useDialogStore } from '../lib/dialogs';

const ws = () => useWorkspace.getState();
let pid: string;
let first: string;
const path = () => window.location.pathname;

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  useDiagramStore.getState().reset();
  useToastStore.getState().clear();
  vi.mocked(requestTreeSync).mockClear();
  window.history.replaceState({}, '', '/');
  useWorkspace.getState().unload();
  const r = createWsProject(localStorage, 'Platform');
  pid = r.project.id;
  first = r.fileId;
  expect(ws().load(localStorage, pid, 'local')).toBe(true);
});

describe('opening files and tabs', () => {
  it('opening a file adds a tab, activates it, tracks recents and navigates to /p/:project/f/:file', () => {
    openFile(first);
    expect(ws().tabs).toMatchObject({ open: [first], active: first });
    expect(ws().recent).toEqual([first]);
    expect(path()).toBe(filePath(pid, first));
  });

  it('opening an unknown file does nothing', () => {
    openFile('ghost');
    expect(ws().tabs.open).toEqual([]);
    expect(path()).toBe('/');
  });

  it('background open keeps the active tab and the URL', () => {
    openFile(first);
    const second = createFileIn(null, 'Second', { open: false })!;
    openFile(second, { background: true });
    expect(ws().tabs).toMatchObject({ open: [first, second], active: first });
    expect(path()).toBe(filePath(pid, first));
  });

  it('activateTab switches and is a no-op for the active tab', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    expect(path()).toBe(filePath(pid, b));
    activateTab(first);
    expect(ws().tabs.active).toBe(first);
    expect(path()).toBe(filePath(pid, first));
  });

  it('closing the active tab activates its neighbour and navigates; closing the last one goes to the project page', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    const c = createFileIn(null, 'C')!;
    activateTab(b);
    closeFileTab(b);
    expect(ws().tabs).toMatchObject({ open: [first, c], active: c });
    expect(path()).toBe(filePath(pid, c));
    closeFileTab(first);
    closeFileTab(c);
    expect(ws().tabs).toMatchObject({ open: [], active: null });
    expect(path()).toBe(projectPath(pid));
  });

  it('closing a background tab leaves the URL alone', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    closeFileTab(first);
    expect(ws().tabs.active).toBe(b);
    expect(path()).toBe(filePath(pid, b));
  });

  it('close others', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    createFileIn(null, 'C');
    closeOtherTabs(b);
    expect(ws().tabs).toMatchObject({ open: [b], active: b });
    expect(path()).toBe(filePath(pid, b));
  });

  it('reorder by drag: the new order is kept', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    const c = createFileIn(null, 'C')!;
    moveTab(c, 0);
    expect(ws().tabs.open).toEqual([c, first, b]);
    moveTab(first, 99);
    expect(ws().tabs.open).toEqual([c, b, first]);
  });

  it('⌘⇧T reopens the most recently closed tab, and says so when there is none', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    closeFileTab(b);
    expect(reopenLastClosed()).toBe(b);
    expect(ws().tabs).toMatchObject({ open: [first, b], active: b });
    expect(path()).toBe(filePath(pid, b));
    closeFileTab(b);
    closeFileTab(first);
    expect(reopenLastClosed()).toBe(first);
    expect(reopenLastClosed()).toBe(b);
    expect(reopenLastClosed()).toBeNull();
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('No recently closed tabs');
  });

  it('closing a tab drops its in-memory editor session', () => {
    openFile(first);
    activateFile(first, () => ({ ...createProject('x'), id: first }));
    captureActive(first);
    expect(hasTabSession(first)).toBe(true);
    closeFileTab(first);
    expect(hasTabSession(first)).toBe(false);
  });
});

describe('restoring open tabs', () => {
  it('tabs, active tab, expanded folders, stars and recents survive a reload (per project and user)', () => {
    openFile(first);
    const folder = createFolderIn(null, 'docs')!;
    const b = createFileIn(folder, 'Inside')!;
    toggleStar(b);
    moveTab(b, 0);
    const saved = { tabs: ws().tabs, expanded: ws().expanded, starred: ws().starred, recent: ws().recent };

    useWorkspace.getState().unload(); // "reload the page"
    expect(ws().load(localStorage, pid, 'local')).toBe(true);
    expect(ws().tabs).toEqual(saved.tabs);
    expect(ws().expanded).toEqual(saved.expanded);
    expect(ws().starred).toEqual(saved.starred);
    expect(ws().recent).toEqual(saved.recent);
  });

  it('is separate per user and per project', () => {
    openFile(first);
    ws().unload();
    expect(ws().load(localStorage, pid, 'someone-else')).toBe(true);
    expect(ws().tabs.open).toEqual([]);
    const other = createWsProject(localStorage, 'Other');
    expect(ws().load(localStorage, other.project.id, 'local')).toBe(true);
    expect(ws().tabs.open).toEqual([]);
    expect(readView(localStorage, 'local', pid).tabs.open).toEqual([first]);
  });

  it('tabs of files that no longer exist are dropped on load', () => {
    openFile(first);
    const b = createFileIn(null, 'B')!;
    ws().unload();
    deleteFromStorageOnly(b);
    ws().load(localStorage, pid, 'local');
    expect(ws().tabs.open).toEqual([first]);
    expect(ws().tabs.active).toBe(first);
  });
});

function deleteFromStorageOnly(fileId: string) {
  const t = loadTree(localStorage, pid);
  localStorage.setItem(`sdd:ws:tree:${pid}`, JSON.stringify({ ...t, files: t.files.filter((f) => f.id !== fileId) }));
}

describe('explorer actions', () => {
  it('create file in a folder expands it; create folder', () => {
    const f = createFolderIn(null, 'infra')!;
    const file = createFileIn(f, 'db')!;
    expect(ws().tree.files.find((x) => x.id === file)?.folderId).toBe(f);
    expect(ws().expanded).toContain(f);
    expect(ws().tabs.active).toBe(file);
  });

  it('rename updates tree, document and the open editor name', () => {
    openFile(first);
    activateFile(first, () => loadFile(localStorage, first));
    renameItem({ kind: 'file', id: first }, '  Renamed  ');
    expect(ws().tree.files.find((x) => x.id === first)?.name).toBe('Renamed');
    expect(loadFile(localStorage, first)?.name).toBe('Renamed');
    expect(useDiagramStore.getState().projectName).toBe('Renamed');
    renameItem({ kind: 'file', id: first }, '   ');
    expect(ws().tree.files.find((x) => x.id === first)?.name).toBe('Renamed');
  });

  it('move refuses cycles and unknown targets', () => {
    const a = createFolderIn(null, 'a')!;
    const b = createFolderIn(a, 'b')!;
    expect(moveItem({ kind: 'folder', id: a }, b)).toBe(false);
    expect(moveItem({ kind: 'folder', id: a }, a)).toBe(false);
    expect(moveItem({ kind: 'file', id: first }, b, 0)).toBe(true);
    expect(ws().tree.files.find((x) => x.id === first)?.folderId).toBe(b);
    expect(ws().expanded).toContain(b);
  });

  it('delete a file closes its tab; delete a folder removes everything inside and the tabs of those files', () => {
    openFile(first);
    const f = createFolderIn(null, 'f')!;
    const x = createFileIn(f, 'x')!;
    const y = createFileIn(f, 'y')!;
    expect(ws().tabs.open).toEqual([first, x, y]);
    deleteItem({ kind: 'folder', id: f });
    expect(ws().tree.folders).toEqual([]);
    expect(ws().tabs.open).toEqual([first]);
    expect(ws().tabs.closed).not.toContain(x);
    expect(loadFile(localStorage, x)).toBeNull();
    expect(path()).toBe(filePath(pid, first));
    deleteItem({ kind: 'file', id: first });
    expect(ws().tabs).toMatchObject({ open: [], active: null });
    expect(path()).toBe(projectPath(pid));
  });

  it('delete also forgets stars and recents', () => {
    openFile(first);
    toggleStar(first);
    deleteItem({ kind: 'file', id: first });
    expect(ws().starred).toEqual([]);
    expect(ws().recent).toEqual([]);
  });

  it('duplicate a file opens the copy; duplicate a folder expands the copy', () => {
    const copy = (() => {
      duplicateItem({ kind: 'file', id: first });
      return ws().tabs.active!;
    })();
    expect(ws().tree.files.find((x) => x.id === copy)?.name).toBe('Platform (copy)');
    const f = createFolderIn(null, 'f')!;
    createFileIn(f, 'inside', { open: false });
    duplicateItem({ kind: 'folder', id: f });
    expect(ws().tree.folders.filter((x) => x.name.startsWith('f')).map((x) => x.name).sort()).toEqual(['f', 'f (copy)']);
    expect(ws().expanded.length).toBeGreaterThan(1);
  });

  it('toggleFolder / expandTo / toggleStar', () => {
    const a = createFolderIn(null, 'a')!;
    const b = createFolderIn(a, 'b')!;
    const file = createFileIn(b, 'f', { open: false })!;
    ws().setView({ expanded: [] });
    expandTo({ kind: 'file', id: file });
    expect(new Set(ws().expanded)).toEqual(new Set([a, b]));
    toggleFolder(a, false);
    expect(ws().expanded).toEqual([b]);
    toggleFolder(a);
    expect(ws().expanded).toContain(a);
    toggleStar(file);
    toggleStar(file);
    expect(ws().starred).toEqual([]);
  });

  it('viewers cannot change the tree', () => {
    setProjectSync(localStorage, pid, { serverBacked: true, role: 'viewer', treeRev: 1, lastSyncedAt: 1 });
    ws().load(localStorage, pid, 'local');
    expect(createFileIn(null, 'nope')).toBeNull();
    expect(createFolderIn(null, 'nope')).toBeNull();
    renameItem({ kind: 'file', id: first }, 'hacked');
    renameCurrentProject('hacked project');
    deleteItem({ kind: 'file', id: first });
    expect(moveItem({ kind: 'file', id: first }, null, 0)).toBe(false);
    expect(ws().tree.files.map((f) => f.name)).toEqual(['Platform']);
    expect(ws().project?.name).not.toBe('hacked project');
    expect(readQueue(localStorage, pid)).toEqual([]);
  });
  it('viewers get no rename dialog at all', async () => {
    setProjectSync(localStorage, pid, { serverBacked: true, role: 'viewer', treeRev: 1, lastSyncedAt: 1 });
    ws().load(localStorage, pid, 'local');
    expect(await renameDialog({ kind: 'file', id: first })).toBeNull();
    expect(useDialogStore.getState().stack).toHaveLength(0);
  });
});

describe('sync queue (server backed project)', () => {
  beforeEach(() => {
    setProjectSync(localStorage, pid, { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    ws().load(localStorage, pid, 'local');
  });

  it('every tree change is queued (compacted) and a sync is requested', () => {
    const folder = createFolderIn(null, 'docs')!;
    const file = createFileIn(folder, 'a', { open: false })!;
    renameItem({ kind: 'file', id: file }, 'b');
    expect(readQueue(localStorage, pid).map((o) => o.t)).toEqual(['createFolder', 'createFile', 'patchFile']);
    moveItem({ kind: 'file', id: file }, null, 0);
    // consecutive patches of one file are merged into a single operation
    const ops = readQueue(localStorage, pid);
    expect(ops.map((o) => o.t)).toEqual(['createFolder', 'createFile', 'patchFile']);
    expect(ops[2]).toMatchObject({ t: 'patchFile', id: file, name: 'b', folderId: null });
    expect(requestTreeSync).toHaveBeenCalledWith(pid);
  });

  it('local-only projects queue nothing and do not request a sync', () => {
    const other = createWsProject(localStorage, 'Local only');
    ws().load(localStorage, other.project.id, 'local');
    vi.mocked(requestTreeSync).mockClear();
    createFolderIn(null, 'x');
    expect(readQueue(localStorage, other.project.id)).toEqual([]);
    expect(requestTreeSync).not.toHaveBeenCalled();
  });

  it('a file created and deleted while offline never reaches the queue', () => {
    const file = createFileIn(null, 'temp', { open: false })!;
    deleteItem({ kind: 'file', id: file });
    expect(readQueue(localStorage, pid)).toEqual([]);
  });

  it('duplicating a folder queues parents before children, with documents added at send time', () => {
    const a = createFolderIn(null, 'a')!;
    const b = createFolderIn(a, 'b')!;
    createFileIn(b, 'leaf', { open: false });
    localStorage.removeItem(`sdd:ws:q:${pid}`);
    duplicateItem({ kind: 'folder', id: a });
    const ops = readQueue(localStorage, pid);
    expect(ops.map((o) => o.t)).toEqual(['createFolder', 'createFolder', 'createFile']);
    const [p, c] = ops as { id: string; parentId: string | null }[];
    expect(c.parentId).toBe(p.id);
  });

  it('rename then move of an existing file is one patch with both changes', () => {
    renameItem({ kind: 'file', id: first }, 'new name');
    const f = createFolderIn(null, 'f')!;
    moveItem({ kind: 'file', id: first }, f, 0);
    const ops = readQueue(localStorage, pid);
    expect(ops.map((o) => o.t)).toEqual(['patchFile', 'createFolder', 'patchFile']); // the folder create sits between, so no merge across it
    expect(ops[0]).toMatchObject({ id: first, name: 'new name' });
    expect(ops[2]).toMatchObject({ id: first, folderId: f, position: expect.any(Number) });
  });

  it('deleting a folder is a single delete operation', () => {
    const a = createFolderIn(null, 'a')!;
    localStorage.removeItem(`sdd:ws:q:${pid}`);
    createFileIn(a, 'inside', { open: false });
    localStorage.removeItem(`sdd:ws:q:${pid}`);
    deleteItem({ kind: 'folder', id: a });
    expect(readQueue(localStorage, pid)).toEqual([{ t: 'deleteFolder', id: a }]);
  });
});
