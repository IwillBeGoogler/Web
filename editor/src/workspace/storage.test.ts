import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../lib/project';
import { LEGACY_KEY, listProjects, loadProject, saveProject } from '../lib/projects';
import { freshMeta, getMeta, setMeta, syncedIds } from '../sync/meta';
import type { DiagramNode } from '../types';
import {
  addWsFolder, createWsFile, createWsProject, deleteWsEntry, deleteWsProject, duplicateWsEntry, ensureWorkspace, fileIdFor, getProjectSync, getWsProject, listWsProjects, loadFile, loadTree, migrateToWorkspace, moveWsEntry,
  projectOfFile, readAliases, renameWsEntry, renameWsProject, resolveLegacyId, setProjectSync, syncFileMeta, WS_VERSION_KEY,
} from './storage';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let st: ReturnType<typeof mem>;
beforeEach(() => {
  st = mem();
});
const icon = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
const legacy = (name: string, nodes: DiagramNode[] = []) => {
  const p = createProject(name);
  return saveProject(st, { ...p, pages: [{ ...p.pages[0], nodes }, { id: 'pg_second', name: 'Second', nodes: [], edges: [] }] }, 5000);
};

describe('migration: every legacy project becomes a Project with one File', () => {
  it('keeps the project id and name, moves the document to fil_<id> with the same pages', () => {
    const a = legacy('Payments', [icon('a'), icon('b')]);
    legacy('Billing');
    expect(migrateToWorkspace(st)).toEqual({ migrated: 2 });

    expect(listWsProjects(st).map((p) => p.name).sort()).toEqual(['Billing', 'Payments']);
    expect(listWsProjects(st).find((p) => p.name === 'Payments')?.id).toBe(a.id);
    const tree = loadTree(st, a.id);
    expect(tree.folders).toEqual([]);
    expect(tree.files).toHaveLength(1);
    expect(tree.files[0]).toMatchObject({ id: fileIdFor(a.id), name: 'Payments', folderId: null, kind: 'sdd', pageCount: 2 });

    const doc = loadFile(st, fileIdFor(a.id))!;
    expect(doc.id).toBe(fileIdFor(a.id));
    expect(doc.name).toBe('Payments');
    expect(doc.pages.map((p) => p.name)).toEqual(['Page 1', 'Second']);
    expect(doc.pages[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(doc.updatedAt).toBe(5000);
    // the old key is gone and the index only lists file documents
    expect(loadProject(st, a.id)).toBeNull();
    expect(listProjects(st).every((m) => m.id.startsWith('fil_'))).toBe(true);
  });

  it('keeps old ids resolvable', () => {
    const a = legacy('Old');
    migrateToWorkspace(st);
    expect(resolveLegacyId(st, a.id)).toEqual({ projectId: a.id, fileId: fileIdFor(a.id) });
    expect(readAliases(st)[a.id]).toBeTruthy();
    expect(getWsProject(st, a.id)?.name).toBe('Old');
    expect(projectOfFile(st, fileIdFor(a.id))).toBe(a.id);
    expect(resolveLegacyId(st, 'nope')).toBeNull();
  });

  it('is versioned and idempotent', () => {
    legacy('One');
    expect(migrateToWorkspace(st).migrated).toBe(1);
    expect(st.getItem(WS_VERSION_KEY)).toBe('2');
    expect(migrateToWorkspace(st).migrated).toBe(0);
    expect(listWsProjects(st)).toHaveLength(1);
    // new files created after the migration are not touched by a (forced) re-run
    const p = listWsProjects(st)[0];
    createWsFile(st, p.id, { name: 'later' });
    st.removeItem(WS_VERSION_KEY);
    migrateToWorkspace(st);
    expect(loadTree(st, p.id).files).toHaveLength(2);
    expect(listWsProjects(st)).toHaveLength(1);
  });

  it('survives an interrupted run (version marker missing, half the data moved)', () => {
    const a = legacy('A');
    const b = legacy('B');
    migrateToWorkspace(st);
    st.removeItem(WS_VERSION_KEY);
    expect(() => migrateToWorkspace(st)).not.toThrow();
    expect(listWsProjects(st)).toHaveLength(2);
    expect(loadFile(st, fileIdFor(a.id))?.name).toBe('A');
    expect(loadFile(st, fileIdFor(b.id))?.name).toBe('B');
  });

  it('moves server sync metadata with the document and marks the project server backed', () => {
    const a = legacy('Synced');
    setMeta(st, a.id, freshMeta({ baseVersion: 7, role: 'editor' }));
    setMeta(st, a.id, { ...getMeta(st, a.id)!, dirty: true, pending: 2 });
    migrateToWorkspace(st);
    expect(getMeta(st, a.id)).toBeNull();
    expect(getMeta(st, fileIdFor(a.id))).toMatchObject({ baseVersion: 7, dirty: true, pending: 2, role: 'editor' });
    expect(syncedIds(st).has(fileIdFor(a.id))).toBe(true);
    expect(syncedIds(st).has(a.id)).toBe(false);
    expect(getProjectSync(st, a.id)).toMatchObject({ serverBacked: true, role: 'editor' });
  });

  it('adopts the very old single-diagram autosave too', () => {
    st.setItem(LEGACY_KEY, JSON.stringify({ version: 1, nodes: [icon('x')], edges: [] }));
    ensureWorkspace(st);
    const [p] = listWsProjects(st);
    expect(p.name).toBe('Untitled');
    expect(loadFile(st, loadTree(st, p.id).files[0].id)?.pages[0].nodes).toHaveLength(1);
  });

  it('an empty browser just gets the version marker; garbage storage never throws', () => {
    ensureWorkspace(st);
    expect(st.getItem(WS_VERSION_KEY)).toBe('2');
    expect(listWsProjects(st)).toEqual([]);
    st.setItem('sdd:ws:projects', '{broken');
    st.setItem('sdd:index', 'nonsense');
    expect(() => ensureWorkspace(st)).not.toThrow();
    expect(listWsProjects(st)).toEqual([]);
  });

  it('a broken legacy document is skipped, the others still migrate', () => {
    legacy('Good');
    const bad = legacy('Bad');
    st.setItem(`sdd:project:${bad.id}`, '{not json');
    expect(migrateToWorkspace(st).migrated).toBe(1);
    expect(listWsProjects(st).map((p) => p.name)).toEqual(['Good']);
  });
});

describe('local workspace operations', () => {
  it('createWsProject makes the project and its first file (named like the project)', () => {
    const { project, fileId } = createWsProject(st, 'Platform');
    expect(getWsProject(st, project.id)?.name).toBe('Platform');
    expect(loadTree(st, project.id).files.map((f) => [f.id, f.name])).toEqual([[fileId, 'Platform']]);
    expect(loadFile(st, fileId)?.pages).toHaveLength(1);
  });

  it('files and folders: create, rename (document follows), move, delete (documents follow), duplicate', () => {
    const { project, fileId } = createWsProject(st, 'P');
    const pid = project.id;
    const { id: folder } = addWsFolder(st, pid, { name: 'infra', parentId: null });
    const { file } = createWsFile(st, pid, { name: 'db', folderId: folder });
    expect(loadTree(st, pid).files.find((f) => f.id === file.id)?.folderId).toBe(folder);

    renameWsEntry(st, pid, { kind: 'file', id: file.id }, 'database');
    expect(loadFile(st, file.id)?.name).toBe('database');
    expect(loadTree(st, pid).files.find((f) => f.id === file.id)?.name).toBe('database');

    expect(moveWsEntry(st, pid, { kind: 'file', id: fileId }, folder, 0).ok).toBe(true);
    expect(moveWsEntry(st, pid, { kind: 'folder', id: folder }, folder).ok).toBe(false);

    const dup = duplicateWsEntry(st, pid, { kind: 'folder', id: folder })!;
    const copies = Object.values(dup.fileMap);
    expect(copies).toHaveLength(2);
    for (const id of copies) expect(loadFile(st, id)?.id).toBe(id);
    // copied documents have their own page ids
    const orig = loadFile(st, file.id)!;
    expect(loadFile(st, dup.fileMap[file.id])!.pages[0].id).not.toBe(orig.pages[0].id);

    const del = deleteWsEntry(st, pid, { kind: 'folder', id: folder });
    expect(del.removedFiles.sort()).toEqual([fileId, file.id].sort());
    expect(loadFile(st, file.id)).toBeNull();
    expect(loadFile(st, fileId)).toBeNull();
    expect(loadFile(st, copies[0])).not.toBeNull();
  });

  it('delete removes documents and sync metadata of every file; deleteWsProject cleans everything', () => {
    const { project, fileId } = createWsProject(st, 'P');
    setMeta(st, fileId, freshMeta({ baseVersion: 1 }));
    setProjectSync(st, project.id, { serverBacked: true, role: 'owner', treeRev: 3, lastSyncedAt: 1 });
    deleteWsProject(st, project.id);
    expect(listWsProjects(st)).toEqual([]);
    expect(loadFile(st, fileId)).toBeNull();
    expect(getMeta(st, fileId)).toBeNull();
    expect(getProjectSync(st, project.id)).toBeNull();
    expect(loadTree(st, project.id)).toEqual({ folders: [], files: [] });
  });

  it('syncFileMeta mirrors kind, page count and name from the saved document', () => {
    const { project, fileId } = createWsProject(st, 'P');
    const doc = loadFile(st, fileId)!;
    const stickies = [1, 2, 3].map((i) => ({ ...icon(`s${i}`), type: 'sticky' }) as DiagramNode);
    syncFileMeta(st, project.id, { ...doc, name: 'Renamed', pages: [{ ...doc.pages[0], nodes: stickies }, { id: 'p2', name: 'P2', nodes: [], edges: [] }] });
    expect(loadTree(st, project.id).files[0]).toMatchObject({ kind: 'board', pageCount: 2, name: 'Renamed' });
  });

  it('renaming a project and the updatedAt bookkeeping', () => {
    const { project } = createWsProject(st, 'P', {}, 1000);
    renameWsProject(st, project.id, ' New name ', 2000);
    expect(getWsProject(st, project.id)).toMatchObject({ name: 'New name', updatedAt: 2000 });
    renameWsProject(st, project.id, '   ', 3000);
    expect(getWsProject(st, project.id)?.name).toBe('New name');
  });

  it('a first file can start from template content', () => {
    const { fileId } = createWsProject(st, 'T', { content: { nodes: [icon('t1')], edges: [] }, pageName: 'Template' });
    expect(loadFile(st, fileId)?.pages[0]).toMatchObject({ name: 'Template' });
    expect(loadFile(st, fileId)?.pages[0].nodes).toHaveLength(1);
  });
});
