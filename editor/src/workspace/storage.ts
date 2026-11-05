import type { DiagramContent, Project } from '../types';
import { isRole } from '../lib/roles';
import { createProject as newFileDoc } from '../lib/project';
import { deleteProject as deleteFileDoc, listProjects as listFileDocs, loadProject as loadFileDoc, migrateLegacy, saveProject as saveFileDoc } from '../lib/projects';
import { newId } from '../lib/graph';
import { clearMeta, getMeta, setMeta, type SyncMeta } from '../sync/meta';
import { flattenWorkspace } from './flatten';
import { dominantKind, createFile, createFolder, deleteEntry, duplicateEntry, moveEntry, renameEntry } from './tree';
import type { EntryRef, FileKind, ProjectTree, WsProject } from './types';
import { emptyTree } from './types';

/**
 * Local persistence of the workspace (works with no server):
 *  - `sdd:ws:version`            storage layout version (2 = Project › Folder › File)
 *  - `sdd:ws:projects`           index of projects [{id,name,createdAt,updatedAt}]
 *  - `sdd:ws:tree:<projectId>`   folders + file metadata of a project
 *  - `sdd:project:<fileId>`      the file documents (pages) via lib/projects, indexed by `sdd:index`
 *  - `sdd:ws:aliases`            legacy project id -> {projectId, fileId} (kept so old /p/:id links keep working)
 */
export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const WS_VERSION_KEY = 'sdd:ws:version';
export const WS_VERSION = 2;
export const PROJECTS_KEY = 'sdd:ws:projects';
export const ALIASES_KEY = 'sdd:ws:aliases';
const treeKey = (pid: string) => `sdd:ws:tree:${pid}`;

export const fileIdFor = (legacyProjectId: string): string => `fil_${legacyProjectId}`;

const readJson = <T>(st: Store, key: string, fallback: T): T => {
  try {
    const v = JSON.parse(st.getItem(key) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (st: Store, key: string, v: unknown) => {
  try {
    st.setItem(key, JSON.stringify(v));
  } catch {
    /* quota */
  }
};

// ---------- projects ----------
export function listWsProjects(st: Store): WsProject[] {
  const v = readJson<unknown>(st, PROJECTS_KEY, []);
  return (Array.isArray(v) ? v : []).filter((p): p is WsProject => !!p && typeof p.id === 'string' && typeof p.name === 'string').sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getWsProject = (st: Store, id: string): WsProject | null => listWsProjects(st).find((p) => p.id === id) ?? null;
export function putWsProject(st: Store, p: WsProject): void {
  writeJson(st, PROJECTS_KEY, [...listWsProjects(st).filter((x) => x.id !== p.id), p]);
}

export function loadTree(st: Store, projectId: string): ProjectTree {
  const t = readJson<Partial<ProjectTree>>(st, treeKey(projectId), {});
  return { folders: Array.isArray(t.folders) ? t.folders : [], files: Array.isArray(t.files) ? t.files : [] };
}
export function saveTree(st: Store, projectId: string, tree: ProjectTree, now = Date.now()): void {
  writeJson(st, treeKey(projectId), tree);
  const p = getWsProject(st, projectId);
  if (p) putWsProject(st, { ...p, updatedAt: now });
}
export const hasTree = (st: Store, projectId: string): boolean => st.getItem(treeKey(projectId)) !== null;

/** Which project holds this file (null when unknown). */
export function projectOfFile(st: Store, fileId: string): string | null {
  for (const p of listWsProjects(st)) if (loadTree(st, p.id).files.some((f) => f.id === fileId)) return p.id;
  return null;
}

// ---------- file documents ----------
export const loadFile = (st: Store, fileId: string): Project | null => loadFileDoc(st, fileId);
export const saveFile = (st: Store, doc: Project, now?: number): Project => saveFileDoc(st, doc, now);
export const fileDocIndex = (st: Store) => listFileDocs(st);

function newDoc(fileId: string, name: string, content?: DiagramContent, pageName = 'Page 1'): Project {
  const base = newFileDoc(name);
  const page = { ...base.pages[0], name: pageName, ...(content ? { nodes: structuredClone(content.nodes), edges: structuredClone(content.edges) } : {}) };
  return { ...base, id: fileId, pages: [page], activePageId: page.id, ...(content?.settings && Object.keys(content.settings).length ? { settings: structuredClone(content.settings) } : {}) };
}

export interface NewFileInput {
  name: string;
  folderId?: string | null;
  content?: DiagramContent;
  pageName?: string;
  id?: string;
  /** an existing document (opened .sdd, import): stored as is under the file id */
  doc?: Project;
}
/** create a file (tree entry + document) */
export function createWsFile(st: Store, projectId: string, input: NewFileInput, now = Date.now()): { tree: ProjectTree; file: Project } {
  // an opened document keeps its id when it is a valid, unused id, so opening the same .sdd again is recognised (Replace / Open as copy)
  const id = input.id ?? (input.doc && /^[A-Za-z0-9_-]{6,64}$/.test(input.doc.id) && !projectOfFile(st, input.doc.id) && !loadFileDoc(st, input.doc.id) ? input.doc.id : newId('fil'));
  const base: Project = input.doc ? { ...input.doc, id, name: input.name } : newDoc(id, input.name, input.content, input.pageName);
  const doc = saveFileDoc(st, base, input.doc ? input.doc.updatedAt : now);
  const kind = dominantKind(doc.pages as { nodes: { type?: string }[] }[]);
  const tree = createFile(loadTree(st, projectId), { id, name: input.name, folderId: input.folderId ?? null, kind, now, pageCount: doc.pages.length });
  saveTree(st, projectId, tree, now);
  return { tree, file: doc };
}

/** create a project with its first file (named like the project unless told otherwise) */
export function createWsProject(st: Store, name: string, o: { content?: DiagramContent; pageName?: string; id?: string; fileId?: string; fileName?: string; doc?: Project } = {}, now = Date.now()): { project: WsProject; fileId: string } {
  const project: WsProject = { id: o.id ?? newId('prj'), name, createdAt: now, updatedAt: now };
  putWsProject(st, project);
  saveTree(st, project.id, emptyTree(), now);
  const { file } = createWsFile(st, project.id, { name: o.fileName ?? name, content: o.content, pageName: o.pageName, id: o.fileId, doc: o.doc }, now);
  return { project: getWsProject(st, project.id) ?? project, fileId: file.id };
}

export function renameWsProject(st: Store, id: string, name: string, now = Date.now()): void {
  const p = getWsProject(st, id);
  if (p && name.trim()) putWsProject(st, { ...p, name: name.trim(), updatedAt: now });
}

export function deleteWsProject(st: Store, id: string): void {
  for (const f of loadTree(st, id).files) {
    deleteFileDoc(st, f.id);
    clearMeta(st, f.id);
  }
  st.removeItem(treeKey(id));
  writeJson(st, PROJECTS_KEY, listWsProjects(st).filter((p) => p.id !== id));
  st.removeItem(`sdd:ws:pmeta:${id}`);
}

// ---------- tree mutations with their file-document side effects ----------
export function renameWsEntry(st: Store, projectId: string, ref: EntryRef, name: string, now = Date.now()): ProjectTree {
  const tree = renameEntry(loadTree(st, projectId), ref, name, now);
  saveTree(st, projectId, tree, now);
  if (ref.kind === 'file') {
    const doc = loadFileDoc(st, ref.id);
    if (doc && doc.name !== name.trim()) saveFileDoc(st, { ...doc, name: name.trim() }, now);
  }
  return tree;
}
export function addWsFolder(st: Store, projectId: string, o: { id?: string; name: string; parentId: string | null }): { tree: ProjectTree; id: string } {
  const id = o.id ?? newId('fld');
  const tree = createFolder(loadTree(st, projectId), { id, name: o.name, parentId: o.parentId });
  saveTree(st, projectId, tree);
  return { tree, id };
}
export function moveWsEntry(st: Store, projectId: string, ref: EntryRef, parentId: string | null, index?: number) {
  const r = moveEntry(loadTree(st, projectId), ref, parentId, index);
  if (r.ok) saveTree(st, projectId, r.tree);
  return r;
}
/** delete from the tree and drop the documents (and sync metadata) of every removed file */
export function deleteWsEntry(st: Store, projectId: string, ref: EntryRef) {
  const r = deleteEntry(loadTree(st, projectId), ref);
  saveTree(st, projectId, r.tree);
  for (const id of r.removedFiles) {
    deleteFileDoc(st, id);
    clearMeta(st, id);
  }
  return r;
}
/** duplicate a file or folder; documents are copied with fresh page ids */
export function duplicateWsEntry(st: Store, projectId: string, ref: EntryRef, now = Date.now()) {
  const tree = loadTree(st, projectId);
  const r = duplicateEntry(tree, ref, (p) => newId(p), now);
  if (!r) return null;
  for (const [oldId, newFileId] of Object.entries(r.fileMap)) {
    const doc = loadFileDoc(st, oldId);
    const entry = r.tree.files.find((f) => f.id === newFileId)!;
    const base = doc ?? newDoc(newFileId, entry.name);
    const pages = base.pages.map((p) => ({ ...structuredClone(p), id: newId('pg') }));
    const active = Math.max(0, base.pages.findIndex((p) => p.id === base.activePageId));
    saveFileDoc(st, { ...structuredClone(base), id: newFileId, name: entry.name, pages, activePageId: pages[active].id, createdAt: now }, now);
  }
  saveTree(st, projectId, r.tree, now);
  return r;
}
/** keep the tree's file metadata (kind icon, page count, updatedAt) in step with a saved document */
export function syncFileMeta(st: Store, projectId: string, doc: Project): void {
  const tree = loadTree(st, projectId);
  const f = tree.files.find((x) => x.id === doc.id);
  if (!f) return;
  const kind: FileKind = dominantKind(doc.pages as { nodes: { type?: string }[] }[]);
  if (f.kind === kind && f.pageCount === doc.pages.length && f.name === doc.name) return;
  writeJson(st, treeKey(projectId), { ...tree, files: tree.files.map((x) => (x.id === doc.id ? { ...x, kind, pageCount: doc.pages.length, name: doc.name } : x)) });
}

// ---------- migration from the pre-workspace layout ----------
type Aliases = Record<string, { projectId: string; fileId: string }>;
export const readAliases = (st: Store): Aliases => readJson<Aliases>(st, ALIASES_KEY, {});
/** an old `/p/:id` link: the legacy project id is still the project's id; the alias also gives the file it became */
export const resolveLegacyId = (st: Store, id: string): { projectId: string; fileId: string } | null => readAliases(st)[id] ?? null;

const SYNC_INDEX_KEY = 'sdd:sync:index';

/**
 * One-time, versioned migration: every legacy project (a document with pages) becomes a Project of the same id and name that
 * holds ONE file (id `fil_<oldId>`, same name and pages). Documents, sync metadata and the sync index are re-keyed to the file id.
 * Idempotent and safe to interrupt: the version marker is written last, and re-running skips what already moved.
 */
export function migrateToWorkspace(st: Store): { migrated: number } {
  let version = 0;
  try {
    version = Number(st.getItem(WS_VERSION_KEY) ?? 0);
  } catch {
    return { migrated: 0 };
  }
  if (version >= WS_VERSION) return { migrated: 0 };
  migrateLegacy(st); // the pre-pages single-diagram autosave first
  const aliases = readAliases(st);
  const known = new Set(listWsProjects(st).map((p) => p.id));
  let migrated = 0;
  for (const meta of fileDocIndex(st)) {
    if (projectOfFile(st, meta.id)) continue; // already a file of some project
    if (known.has(meta.id) && hasTree(st, meta.id)) continue; // interrupted run: project exists
    const doc = loadFileDoc(st, meta.id);
    if (!doc) continue;
    const fileId = fileIdFor(meta.id);
    const projectId = meta.id;
    // 1. the document moves to the file id
    saveFileDoc(st, { ...doc, id: fileId }, doc.updatedAt);
    deleteFileDoc(st, meta.id);
    // 2. sync metadata follows the document (server-backed projects keep their server version chain)
    const sync: SyncMeta | null = getMeta(st, meta.id);
    if (sync) {
      setMeta(st, fileId, sync);
      clearMeta(st, meta.id);
    }
    // 3. the container + one-file tree
    const project: WsProject = { id: projectId, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
    putWsProject(st, project);
    const tree = createFile(emptyTree(), { id: fileId, name: doc.name, folderId: null, kind: dominantKind(doc.pages as { nodes: { type?: string }[] }[]), now: doc.updatedAt, pageCount: doc.pages.length, position: 0 });
    writeJson(st, treeKey(projectId), tree);
    if (sync) writeJson(st, `sdd:ws:pmeta:${projectId}`, { serverBacked: true, role: sync.role, treeRev: 0, lastSyncedAt: sync.lastSyncedAt });
    aliases[meta.id] = { projectId, fileId };
    migrated++;
  }
  writeJson(st, ALIASES_KEY, aliases);
  void SYNC_INDEX_KEY;
  try {
    st.setItem(WS_VERSION_KEY, String(WS_VERSION));
  } catch {
    /* ignore */
  }
  return { migrated };
}

/** server-backed marker for a project (its tree is mirrored to the server) */
export interface ProjectMeta2 {
  serverBacked: boolean;
  role: SyncMeta['role'];
  /** last server tree revision this device reconciled with */
  treeRev: number;
  lastSyncedAt: number | null;
}
export function getProjectSync(st: Store, projectId: string): ProjectMeta2 | null {
  const v = readJson<Partial<ProjectMeta2> | null>(st, `sdd:ws:pmeta:${projectId}`, null);
  if (!v || !v.serverBacked) return null;
  return { serverBacked: true, role: isRole(v.role) ? v.role : 'owner', treeRev: typeof v.treeRev === 'number' ? v.treeRev : 0, lastSyncedAt: typeof v.lastSyncedAt === 'number' ? v.lastSyncedAt : null };
}
export function setProjectSync(st: Store, projectId: string, m: ProjectMeta2): void {
  writeJson(st, `sdd:ws:pmeta:${projectId}`, m);
}
export const clearProjectSync = (st: Store, projectId: string): void => st.removeItem(`sdd:ws:pmeta:${projectId}`);

/** Everything a fresh page load needs: migrate once, then the data is ready. */
export function ensureWorkspace(st: Store): void {
  try {
    migrateToWorkspace(st);
    flattenWorkspace(st);
  } catch {
    /* a failed migration must never block the app; the next load retries */
  }
}

/** drop every file of a freshly created project (import builds its own content) */
export function deleteStarter(st: Store, projectId: string): void {
  for (const f of loadTree(st, projectId).files) {
    deleteFileDoc(st, f.id);
    clearMeta(st, f.id);
  }
  saveTree(st, projectId, emptyTree());
}

/** Deep copy of a whole project (folders, files and their documents) under a new name. */
export function duplicateWsProject(st: Store, projectId: string, name: string, now = Date.now()): WsProject | null {
  const src = getWsProject(st, projectId);
  if (!src) return null;
  const copy: WsProject = { id: newId('prj'), name, createdAt: now, updatedAt: now };
  putWsProject(st, copy);
  const tree = loadTree(st, projectId);
  const folderIds = new Map(tree.folders.map((f) => [f.id, newId('fld')]));
  const files = tree.files.map((f) => {
    const id = newId('fil');
    const doc = loadFileDoc(st, f.id);
    if (doc) {
      const pages = doc.pages.map((p) => ({ ...structuredClone(p), id: newId('pg') }));
      const active = Math.max(0, doc.pages.findIndex((p) => p.id === doc.activePageId));
      saveFileDoc(st, { ...structuredClone(doc), id, pages, activePageId: pages[active].id, createdAt: now }, now);
    }
    return { ...f, id, folderId: f.folderId ? (folderIds.get(f.folderId) ?? null) : null, createdAt: now, updatedAt: now };
  });
  saveTree(st, copy.id, { folders: tree.folders.map((f) => ({ ...f, id: folderIds.get(f.id)!, parentId: f.parentId ? (folderIds.get(f.parentId) ?? null) : null })), files }, now);
  return getWsProject(st, copy.id) ?? copy;
}

/** numbers shown on a project card */
export function projectStats(st: Store, projectId: string): { fileCount: number; folderCount: number; pageCount: number; firstFileId: string | null } {
  const t = loadTree(st, projectId);
  const first = [...t.files].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))[0];
  return { fileCount: t.files.length, folderCount: t.folders.length, pageCount: t.files.reduce((n, f) => n + f.pageCount, 0), firstFileId: first?.id ?? null };
}
