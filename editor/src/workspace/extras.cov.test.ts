import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../lib/project';
import { navigate } from './nav';
import { exportProjectBytes, importProjectBytes } from './projectFile';
import {
  addWsFolder, clearProjectSync, createWsFile, createWsProject, deleteWsProject, duplicateWsProject, getProjectSync, getWsProject, listWsProjects, loadFile, loadTree,
  projectStats, putWsProject, renameWsProject, saveFile, setProjectSync, syncFileMeta, moveWsEntry,
} from './storage';
import { emptyView, parseView, pruneView, readView, touchRecent, useWorkspace, viewKey, writeView, selectRows } from './store';
import type { Row } from './tree';

beforeEach(() => localStorage.clear());

describe('workspace/nav keyboard model', () => {
  const row = (id: string, kind: 'file' | 'folder', o: Partial<Row> = {}): Row => ({ ref: { kind, id }, depth: 0, name: id, parentId: null, expanded: false, ...o }) as Row;
  const rows = [row('f', 'folder', { expanded: true }), row('a', 'file', { parentId: 'f' }), row('g', 'folder'), row('z', 'file')];
  it('empty list focuses nothing', () => expect(navigate([], 'a', 'Home')).toEqual({ focus: null }));
  it('up/down start at the ends when nothing is focused and clamp otherwise', () => {
    expect(navigate(rows, null, 'ArrowDown')).toEqual({ focus: 'f' });
    expect(navigate(rows, null, 'ArrowUp')).toEqual({ focus: 'z' });
    expect(navigate(rows, 'z', 'ArrowDown')).toEqual({ focus: 'z' });
    expect(navigate(rows, 'f', 'ArrowUp')).toEqual({ focus: 'f' });
    expect(navigate(rows, 'a', 'ArrowDown')).toEqual({ focus: 'g' });
    expect(navigate(rows, 'a', 'Home')).toEqual({ focus: 'f' });
    expect(navigate(rows, 'a', 'End')).toEqual({ focus: 'z' });
  });
  it('right: first row without focus, expands a closed folder, enters an open one, stays on files', () => {
    expect(navigate(rows, null, 'ArrowRight')).toEqual({ focus: 'f' });
    expect(navigate(rows, 'g', 'ArrowRight')).toEqual({ focus: 'g', toggle: { id: 'g', open: true } });
    expect(navigate(rows, 'f', 'ArrowRight')).toEqual({ focus: 'a' });
    expect(navigate(rows, 'z', 'ArrowRight')).toEqual({ focus: 'z' });
    const emptyOpen = [row('f', 'folder', { expanded: true }), row('x', 'file')];
    expect(navigate(emptyOpen, 'f', 'ArrowRight')).toEqual({ focus: 'f' });
    expect(navigate([row('f', 'folder', { expanded: true })], 'f', 'ArrowRight')).toEqual({ focus: 'f' });
  });
  it('left: first row without focus, collapses an open folder, else goes to the parent or stays', () => {
    expect(navigate(rows, null, 'ArrowLeft')).toEqual({ focus: 'f' });
    expect(navigate(rows, 'f', 'ArrowLeft')).toEqual({ focus: 'f', toggle: { id: 'f', open: false } });
    expect(navigate(rows, 'a', 'ArrowLeft')).toEqual({ focus: 'f' });
    expect(navigate(rows, 'z', 'ArrowLeft')).toEqual({ focus: 'z' });
  });
  it('enter opens files and toggles folders; nothing focused does nothing', () => {
    expect(navigate(rows, null, 'Enter')).toEqual({ focus: null });
    expect(navigate(rows, 'z', 'Enter')).toEqual({ focus: 'z', open: 'z' });
    expect(navigate(rows, 'g', 'Enter')).toEqual({ focus: 'g', toggle: { id: 'g', open: true } });
    expect(navigate(rows, 'f', 'Enter')).toEqual({ focus: 'f', toggle: { id: 'f', open: false } });
  });
});

describe('workspace storage extras', () => {
  it('project list tolerates junk, sorts newest first, and renames/deletes', () => {
    localStorage.setItem('sdd:ws:projects', '{"not":"an array"}');
    expect(listWsProjects(localStorage)).toEqual([]);
    const a = createWsProject(localStorage, 'A', {}, 1000).project;
    const b = createWsProject(localStorage, 'B', {}, 2000).project;
    expect(listWsProjects(localStorage).map((p) => p.id)).toEqual([b.id, a.id]);
    renameWsProject(localStorage, a.id, '  Alpha  ', 3000);
    renameWsProject(localStorage, a.id, '   ');
    renameWsProject(localStorage, 'ghost', 'x');
    expect(getWsProject(localStorage, a.id)).toMatchObject({ name: 'Alpha', updatedAt: 3000 });
    putWsProject(localStorage, { ...b, name: 'B2' });
    expect(getWsProject(localStorage, b.id)!.name).toBe('B2');
    expect(getWsProject(localStorage, 'ghost')).toBeNull();
    deleteWsProject(localStorage, a.id);
    expect(getWsProject(localStorage, a.id)).toBeNull();
  });
  it('project sync marker defaults, roundtrips and clears', () => {
    const { project } = createWsProject(localStorage, 'S');
    expect(getProjectSync(localStorage, project.id)).toBeNull();
    setProjectSync(localStorage, project.id, { serverBacked: true, role: 'editor', treeRev: 4, lastSyncedAt: 9 });
    expect(getProjectSync(localStorage, project.id)).toEqual({ serverBacked: true, role: 'editor', treeRev: 4, lastSyncedAt: 9 });
    localStorage.setItem(`sdd:ws:pmeta:${project.id}`, JSON.stringify({ serverBacked: true, role: 'weird', treeRev: 'x', lastSyncedAt: 'y' }));
    expect(getProjectSync(localStorage, project.id)).toEqual({ serverBacked: true, role: 'owner', treeRev: 0, lastSyncedAt: null });
    localStorage.setItem(`sdd:ws:pmeta:${project.id}`, JSON.stringify({ serverBacked: false }));
    expect(getProjectSync(localStorage, project.id)).toBeNull();
    clearProjectSync(localStorage, project.id);
    expect(localStorage.getItem(`sdd:ws:pmeta:${project.id}`)).toBeNull();
  });
  it('duplicateWsProject deep-copies folders, files and documents with fresh ids; unknown source returns null', () => {
    const { project, fileId } = createWsProject(localStorage, 'Src');
    const { id: fid } = addWsFolder(localStorage, project.id, { name: 'D', parentId: null });
    const { id: sub } = addWsFolder(localStorage, project.id, { name: 'Sub', parentId: fid });
    const inner = createWsFile(localStorage, project.id, { name: 'Inner', folderId: sub }).file;
    expect(duplicateWsProject(localStorage, 'ghost', 'x')).toBeNull();
    const copy = duplicateWsProject(localStorage, project.id, 'Copy', 5000)!;
    expect(copy.name).toBe('Copy');
    const t = loadTree(localStorage, copy.id);
    expect(t.folders).toHaveLength(2);
    expect(t.files).toHaveLength(2);
    const newSub = t.folders.find((f) => f.name === 'Sub')!;
    expect(newSub.parentId).toBe(t.folders.find((f) => f.name === 'D')!.id);
    expect(newSub.id).not.toBe(sub);
    const nf = t.files.find((f) => f.name === 'Inner')!;
    expect(nf.id).not.toBe(inner.id);
    expect(nf.folderId).toBe(newSub.id);
    expect(loadFile(localStorage, nf.id)!.pages[0].id).not.toBe(inner.pages[0].id);
    expect(loadFile(localStorage, fileId)).toBeTruthy();
  });
  it('duplicateWsProject tolerates a file without a cached document', () => {
    const { project, fileId } = createWsProject(localStorage, 'Src');
    localStorage.removeItem(Object.keys(localStorage).find((k) => k.includes(fileId) && !k.includes('pmeta') && !k.includes('tree'))!);
    const copy = duplicateWsProject(localStorage, project.id, 'C')!;
    expect(loadTree(localStorage, copy.id).files).toHaveLength(1);
  });
  it('projectStats counts and picks the first file by position then name', () => {
    const { project, fileId } = createWsProject(localStorage, 'S');
    addWsFolder(localStorage, project.id, { name: 'F', parentId: null });
    createWsFile(localStorage, project.id, { name: 'Another' });
    const s = projectStats(localStorage, project.id);
    expect(s).toMatchObject({ fileCount: 2, folderCount: 1, pageCount: 2 });
    expect([fileId]).toContain(s.firstFileId);
    expect(projectStats(localStorage, 'nothing')).toEqual({ fileCount: 0, folderCount: 0, pageCount: 0, firstFileId: null });
  });
  it('syncFileMeta updates kind/page count/name only when something changed, and ignores unknown files', () => {
    const { project, fileId } = createWsProject(localStorage, 'S');
    const doc = loadFile(localStorage, fileId)!;
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    syncFileMeta(localStorage, project.id, doc);
    expect(spy).not.toHaveBeenCalled();
    syncFileMeta(localStorage, project.id, { ...doc, id: 'ghost' });
    expect(spy).not.toHaveBeenCalled();
    syncFileMeta(localStorage, project.id, { ...doc, name: 'Renamed', pages: [...doc.pages, { ...doc.pages[0], id: 'p2' }] });
    expect(loadTree(localStorage, project.id).files[0]).toMatchObject({ name: 'Renamed', pageCount: 2 });
    spy.mockRestore();
  });
  it('saveFile / moveWsEntry keep the tree consistent', () => {
    const { project, fileId } = createWsProject(localStorage, 'S');
    const doc = loadFile(localStorage, fileId)!;
    expect(saveFile(localStorage, { ...doc, name: 'Q' }).name).toBe('Q');
    const { id } = addWsFolder(localStorage, project.id, { name: 'F', parentId: null });
    expect(moveWsEntry(localStorage, project.id, { kind: 'file', id: fileId }, id).ok).toBe(true);
    expect(moveWsEntry(localStorage, project.id, { kind: 'file', id: 'ghost' }, id).ok).toBe(false);
    expect(loadTree(localStorage, project.id).files[0].folderId).toBe(id);
  });
});

describe('workspace view helpers', () => {
  it('parseView sanitizes, readView survives garbage, writeView survives quota errors', () => {
    expect(parseView(null)).toEqual(emptyView());
    expect(parseView({ expanded: ['a', 'a', 1], recent: Array.from({ length: 20 }, (_, i) => `r${i}`), at: 'x' }).recent).toHaveLength(12);
    localStorage.setItem(viewKey('u', 'p'), '{bad');
    expect(readView(localStorage, 'u', 'p')).toEqual(emptyView());
    localStorage.setItem(viewKey('u', 'p'), 'null');
    expect(readView(localStorage, 'u', 'p')).toEqual(emptyView());
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => writeView(localStorage, 'u', 'p', emptyView())).not.toThrow();
    spy.mockRestore();
    writeView(localStorage, 'u', 'p', { ...emptyView(), starred: ['x'] });
    expect(readView(localStorage, 'u', 'p').starred).toEqual(['x']);
  });
  it('pruneView and touchRecent', () => {
    const tree = { folders: [{ id: 'd', parentId: null, name: 'd', position: 0 }], files: [{ id: 'f' }] } as never;
    const pruned = pruneView({ tabs: { open: ['f', 'x'], active: 'x', closed: [] }, expanded: ['d', 'y'], starred: ['f', 'z'], recent: ['z', 'f'], at: 1 }, tree);
    expect(pruned).toMatchObject({ expanded: ['d'], starred: ['f'], recent: ['f'] });
    expect(pruned.tabs.open).toEqual(['f']);
    expect(touchRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(touchRecent(Array.from({ length: 12 }, (_, i) => `r${i}`), 'new')).toHaveLength(12);
  });
  it('workspace store: load fails for unknown projects; reload of an unknown/removed project unloads; setters', () => {
    const w = () => useWorkspace.getState();
    expect(w().load(localStorage, 'ghost', 'u')).toBe(false);
    w().reload(localStorage); // nothing loaded: no-op
    const { project } = createWsProject(localStorage, 'P');
    expect(w().load(localStorage, project.id, 'u')).toBe(true);
    w().setFilter('abc');
    w().setFilesOpen(true);
    w().setQuickOpen(true);
    w().setFocus('x');
    w().setQueued(3);
    w().setPresence({ f: ['Ann'] });
    expect(w()).toMatchObject({ filter: 'abc', filesOpen: true, quickOpen: true, focusId: 'x', queued: 3, presenceByFile: { f: ['Ann'] } });
    expect(selectRows(w()).length).toBeGreaterThanOrEqual(0);
    deleteWsProject(localStorage, project.id);
    w().reload(localStorage);
    expect(w().projectId).toBeNull();
    w().unload();
  });
});

describe('.sddproj export / import', () => {
  it('roundtrips a project with folders and files into a NEW project with fresh ids', () => {
    const { project, fileId } = createWsProject(localStorage, 'Proj');
    const { id: fid } = addWsFolder(localStorage, project.id, { name: 'Dir', parentId: null });
    const f2 = createWsFile(localStorage, project.id, { name: 'Two', folderId: fid }).file;
    const bytes = exportProjectBytes(localStorage, project.id);
    const r = importProjectBytes(localStorage, bytes);
    expect(r.projectId).not.toBe(project.id);
    const t = loadTree(localStorage, r.projectId);
    expect(t.folders.map((f) => f.name)).toEqual(['Dir']);
    expect(t.files.map((f) => f.name).sort()).toEqual(['Proj', 'Two']);
    expect(t.files.some((f) => f.id === fileId || f.id === f2.id)).toBe(false);
    expect(t.files.find((f) => f.name === 'Two')!.folderId).toBe(t.folders[0].id);
    expect(r.firstFileId).toBeTruthy();
    expect(getWsProject(localStorage, r.projectId)!.name).toBe('Proj');
  });
  it('export throws for unknown projects and exports files without cached documents as empty files', () => {
    expect(() => exportProjectBytes(localStorage, 'ghost')).toThrow('Project not found');
    const { project, fileId } = createWsProject(localStorage, 'P');
    for (const k of Object.keys(localStorage)) if (k.includes(fileId) && !k.includes('tree') && !k.includes('pmeta')) localStorage.removeItem(k);
    const r = importProjectBytes(localStorage, exportProjectBytes(localStorage, project.id));
    expect(loadTree(localStorage, r.projectId).files).toHaveLength(1);
  });
  it('import rejects garbage without writing anything', () => {
    const before = listWsProjects(localStorage).length;
    expect(() => importProjectBytes(localStorage, new Uint8Array([1, 2, 3]))).toThrow();
    expect(listWsProjects(localStorage)).toHaveLength(before);
    void createProject;
  });
});
