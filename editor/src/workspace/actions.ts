import { newId } from '../lib/graph';
import { canEdit } from '../lib/roles';
import { flushProject } from '../hooks/useProjectPersistence';
import { dialogs } from '../lib/dialogs';
import { navigate } from '../lib/router';
import { useDiagramStore } from '../store/diagramStore';
import { toast } from '../store/toastStore';
import { clearMeta } from '../sync/meta';
import { requestTreeSync } from '../sync/treeRuntime';
import { enqueue, type TreeOp } from '../sync/treeSync';
import type { DiagramContent, Project } from '../types';
import { splitIntoFiles } from './flatten';
import { addWsFolder, createWsFile, createWsProject, deleteWsEntry, duplicateWsEntry, loadTree, moveWsEntry, projectOfFile, renameWsEntry, renameWsProject, saveFile, syncFileMeta } from './storage';
import { getMeta, setMeta } from '../sync/meta';
import { closeOthers, closeTab, cycleTab, openTab, pruneTabs, reopenClosed, reorderTab } from './tabs';
import { captureActive, dropTabSession } from './tabSession';
import { countFolder, findEntry, nameProblem, parentOf, uniqueName } from './tree';
import { touchRecent, useWorkspace, writeView } from './store';
import type { EntryRef, FileKind } from './types';
import { schedulePrefsPush } from './prefsSync';

const ls = (): Storage => localStorage;
const ws = () => useWorkspace.getState();
export const filePath = (projectId: string, fileId: string) => `/p/${encodeURIComponent(projectId)}/f/${encodeURIComponent(fileId)}`;
export const projectPath = (projectId: string) => `/p/${encodeURIComponent(projectId)}`;

/** read-only roles (viewer) cannot change the tree */
export const canEditTree = (): boolean => canEdit(ws().role);

function queue(op: TreeOp | TreeOp[]): void {
  const { projectId, serverBacked } = ws();
  if (!projectId || !serverBacked) return;
  enqueue(ls(), projectId, op);
  requestTreeSync(projectId);
}

/** persist the explorer / tab state locally and push it to the server preferences */
export function persistView(): void {
  const s = ws();
  if (!s.projectId) return;
  const view = { tabs: s.tabs, expanded: s.expanded, starred: s.starred, recent: s.recent, at: s.at };
  writeView(ls(), s.userKey, s.projectId, view);
  schedulePrefsPush(s.projectId, view);
}
const setView = (patch: Parameters<ReturnType<typeof ws>['setView']>[0]) => {
  ws().setView(patch);
  persistView();
};

// ---------- tabs ----------
/** open a file in a tab and show it. `background` opens the tab without switching. */
export function openFile(fileId: string, opts: { background?: boolean; replace?: boolean } = {}): void {
  const s = ws();
  if (!s.projectId || !s.tree.files.some((f) => f.id === fileId)) return;
  if (!opts.background) {
    flushProject(); // persist the file we are leaving, then remember its undo history / selection / viewport
    captureActive(useDiagramStore.getState().projectId);
  }
  const tabs = openTab(s.tabs, fileId, { activate: !opts.background, after: opts.background ? s.tabs.active : null });
  setView({ tabs, recent: touchRecent(s.recent, fileId) });
  if (!opts.background) navigate(filePath(s.projectId, fileId), { replace: opts.replace });
}

export function activateTab(fileId: string): void {
  if (ws().tabs.active === fileId) return;
  openFile(fileId);
}

export function closeFileTab(fileId: string): void {
  const s = ws();
  if (!s.projectId) return;
  const wasActive = s.tabs.active === fileId;
  if (wasActive) {
    flushProject();
    captureActive(fileId);
  }
  const tabs = closeTab(s.tabs, fileId);
  dropTabSession(fileId);
  setView({ tabs });
  if (wasActive) navigate(tabs.active ? filePath(s.projectId, tabs.active) : projectPath(s.projectId), { replace: true });
}
export function closeOtherTabs(fileId: string): void {
  const s = ws();
  const tabs = closeOthers(s.tabs, fileId);
  for (const id of s.tabs.open) if (id !== fileId) dropTabSession(id);
  setView({ tabs });
  if (s.tabs.active !== fileId && s.projectId) {
    flushProject();
    navigate(filePath(s.projectId, fileId), { replace: true });
  }
}
export function moveTab(fileId: string, toIndex: number): void {
  setView({ tabs: reorderTab(ws().tabs, fileId, toIndex) });
}
/** Ctrl+Tab / Ctrl+Shift+Tab */
export function cycleActiveTab(dir: 1 | -1): void {
  const next = cycleTab(ws().tabs, dir);
  if (next) activateTab(next);
}
/** ⌘⇧T */
export function reopenLastClosed(): string | null {
  const s = ws();
  const exists = (id: string) => s.tree.files.some((f) => f.id === id);
  const r = reopenClosed(s.tabs, exists);
  if (!r.id) {
    setView({ tabs: r.state });
    toast.info('No recently closed tabs');
    return null;
  }
  setView({ tabs: r.state, recent: touchRecent(s.recent, r.id) });
  openFile(r.id);
  return r.id;
}

// ---------- explorer view ----------
export function toggleFolder(id: string, open?: boolean): void {
  const s = ws();
  const isOpen = s.expanded.includes(id);
  const want = open ?? !isOpen;
  if (want === isOpen) return;
  setView({ expanded: want ? [...s.expanded, id] : s.expanded.filter((x) => x !== id) });
}
export function expandTo(ref: EntryRef): void {
  const s = ws();
  const ids = new Set(s.expanded);
  let cur = findEntry(s.tree, ref)?.parent ?? null;
  while (cur) {
    ids.add(cur);
    cur = s.tree.folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  if (ids.size !== s.expanded.length) setView({ expanded: [...ids] });
}
export function toggleStar(fileId: string): void {
  const s = ws();
  setView({ starred: s.starred.includes(fileId) ? s.starred.filter((x) => x !== fileId) : [...s.starred, fileId] });
}

// ---------- tree mutations ----------
function afterTreeChange(): void {
  const s = ws();
  if (!s.projectId) return;
  s.reload(ls());
}

export function createFileIn(folderId: string | null, name: string, opts: { kind?: FileKind; open?: boolean; content?: DiagramContent } = {}): string | null {
  const s = ws();
  if (!s.projectId || !canEditTree()) return null;
  const { file } = createWsFile(ls(), s.projectId, { name, folderId, content: opts.content });
  const entry = loadTree(ls(), s.projectId).files.find((f) => f.id === file.id)!;
  afterTreeChange();
  if (folderId) expandTo({ kind: 'file', id: file.id });
  queue({ t: 'createFile', id: file.id, name: entry.name, folderId, position: entry.position, kind: entry.kind });
  if (opts.open !== false) openFile(file.id);
  return file.id;
}
export function createFolderIn(parentId: string | null, name: string): string | null {
  const s = ws();
  if (!s.projectId || !canEditTree()) return null;
  const { id } = addWsFolder(ls(), s.projectId, { name, parentId });
  const f = loadTree(ls(), s.projectId).folders.find((x) => x.id === id)!;
  afterTreeChange();
  if (parentId) toggleFolder(parentId, true);
  queue({ t: 'createFolder', id, name: f.name, parentId, position: f.position });
  return id;
}

export function renameItem(ref: EntryRef, name: string): void {
  const s = ws();
  if (!s.projectId || !canEditTree()) return;
  const n = name.trim();
  if (!n) return;
  renameWsEntry(ls(), s.projectId, ref, n);
  if (ref.kind === 'file' && useDiagramStore.getState().projectId === ref.id) useDiagramStore.getState().setProjectName(n);
  afterTreeChange();
  queue({ t: ref.kind === 'file' ? 'patchFile' : 'patchFolder', id: ref.id, name: n });
}

export function moveItem(ref: EntryRef, parentId: string | null, index?: number): boolean {
  const s = ws();
  if (!s.projectId || !canEditTree()) return false;
  const r = moveWsEntry(ls(), s.projectId, ref, parentId, index);
  if (!r.ok) return false;
  afterTreeChange();
  if (parentId) toggleFolder(parentId, true);
  queue(ref.kind === 'file' ? { t: 'patchFile', id: ref.id, folderId: parentId, position: r.position } : { t: 'patchFolder', id: ref.id, parentId, position: r.position });
  return true;
}

/** how many things a delete would remove (for the confirm dialog) */
export function deleteImpact(ref: EntryRef): { folders: number; files: number } {
  const t = ws().tree;
  return ref.kind === 'file' ? { folders: 0, files: 1 } : (() => { const c = countFolder(t, ref.id); return { folders: c.folders + 1, files: c.files }; })();
}

export function deleteItem(ref: EntryRef): void {
  const s = ws();
  if (!s.projectId || !canEditTree()) return;
  const wasActive = s.tabs.active;
  const r = deleteWsEntry(ls(), s.projectId, ref);
  if (!r.removedFiles.length && !r.removedFolders.length) return;
  const gone = new Set(r.removedFiles);
  for (const id of gone) {
    dropTabSession(id);
    clearMeta(ls(), id);
  }
  const tabs = pruneTabs(ws().tabs, (id) => !gone.has(id));
  afterTreeChange();
  setView({ tabs, starred: ws().starred.filter((x) => !r.removedFiles.includes(x)), recent: ws().recent.filter((x) => !r.removedFiles.includes(x)) });
  queue({ t: ref.kind === 'file' ? 'deleteFile' : 'deleteFolder', id: ref.id });
  if (wasActive && r.removedFiles.includes(wasActive)) navigate(tabs.active ? filePath(s.projectId, tabs.active) : projectPath(s.projectId), { replace: true });
}

export function duplicateItem(ref: EntryRef): void {
  const s = ws();
  if (!s.projectId || !canEditTree()) return;
  flushProject(); // copy what is on screen
  const r = duplicateWsEntry(ls(), s.projectId, ref);
  if (!r) return;
  afterTreeChange();
  const after = loadTree(ls(), s.projectId);
  const ops: TreeOp[] = [];
  for (const f of after.folders.filter((x) => Object.values(r.folderMap).includes(x.id))) ops.push({ t: 'createFolder', id: f.id, name: f.name, parentId: f.parentId, position: f.position });
  // parents before children
  ops.sort((a, b) => depthOf(after, (a as { id: string }).id) - depthOf(after, (b as { id: string }).id));
  for (const f of after.files.filter((x) => Object.values(r.fileMap).includes(x.id))) ops.push({ t: 'createFile', id: f.id, name: f.name, folderId: f.folderId, position: f.position, kind: f.kind });
  queue(ops);
  if (r.root.kind === 'folder') toggleFolder(r.root.id, true);
  else openFile(r.root.id);
}
const depthOf = (tree: ReturnType<typeof loadTree>, folderId: string): number => {
  let d = 0;
  let cur: string | null = folderId;
  while (cur && d < 100) {
    cur = tree.folders.find((f) => f.id === cur)?.parentId ?? null;
    d++;
  }
  return d;
};

/** Rename the open project itself */
export function renameCurrentProject(name: string): void {
  const s = ws();
  if (!s.projectId || !canEditTree()) return;
  renameWsProject(ls(), s.projectId, name);
  afterTreeChange();
  queue({ t: 'renameProject', name: name.trim() });
}

// ---------- dialog flows ----------
export async function newFileDialog(folderId: string | null): Promise<string | null> {
  const s = ws();
  const name = await dialogs.prompt({
    title: 'New file',
    label: 'File name',
    initial: uniqueName(s.tree, folderId, 'Untitled'),
    confirmLabel: 'Create',
    validate: (v) => nameProblem(ws().tree, folderId, v),
  });
  return name === null ? null : createFileIn(folderId, name);
}
export async function newFolderDialog(parentId: string | null): Promise<string | null> {
  const s = ws();
  const name = await dialogs.prompt({
    title: 'New folder',
    label: 'Folder name',
    initial: uniqueName(s.tree, parentId, 'New folder'),
    confirmLabel: 'Create',
    validate: (v) => nameProblem(ws().tree, parentId, v),
  });
  return name === null ? null : createFolderIn(parentId, name);
}
export async function renameDialog(ref: EntryRef): Promise<string | null> {
  if (!canEditTree()) return null;
  const e = findEntry(ws().tree, ref);
  if (!e) return null;
  const parent = parentOf(e);
  const name = await dialogs.prompt({
    title: ref.kind === 'folder' ? 'Rename folder' : 'Rename file',
    label: 'Name',
    initial: e.name,
    confirmLabel: 'Rename',
    validate: (v) => nameProblem(ws().tree, parent, v, ref.id),
  });
  if (name !== null) renameItem(ref, name);
  return name;
}
export async function deleteDialog(ref: EntryRef): Promise<boolean> {
  const e = findEntry(ws().tree, ref);
  if (!e) return false;
  const impact = deleteImpact(ref);
  const detail =
    ref.kind === 'file'
      ? 'The file and all its pages will be deleted.'
      : `This deletes the folder${impact.folders > 1 ? ` with ${impact.folders - 1} subfolder${impact.folders > 2 ? 's' : ''}` : ''} and ${impact.files} file${impact.files === 1 ? '' : 's'} inside it.`;
  const ok = await dialogs.confirm({ title: `Delete ${ref.kind === 'file' ? 'file' : 'folder'} “${e.name}”?`, message: `${detail} This cannot be undone.`, confirmLabel: 'Delete', danger: true });
  if (ok) deleteItem(ref);
  return ok;
}

/**
 * Place a document that came from outside (an opened .sdd) into the workspace:
 *  - a file with this id already exists -> it is replaced where it is,
 *  - a project is open -> it becomes a new file at the root of that project,
 *  - otherwise -> a new project with that one file.
 */
export function importOpenedFile(doc: Project): { projectId: string; fileId: string; fileIds: string[]; created: 'file' | 'project' | 'replaced' } {
  const existing = projectOfFile(ls(), doc.id);
  if (existing) {
    const first = splitIntoFiles(doc, () => newId('fil'));
    const [head, ...rest] = first;
    saveFile(ls(), head, doc.updatedAt);
    syncFileMeta(ls(), existing, head);
    const m = getMeta(ls(), doc.id);
    if (m) setMeta(ls(), doc.id, { ...m, dirty: true, pending: m.pending + 1 }); // server backed: upload the replacement
    const extra = rest.map((d) => createWsFile(ls(), existing, { name: d.name, doc: d }).file.id);
    if (ws().projectId === existing) ws().reload(ls());
    return { projectId: existing, fileId: doc.id, fileIds: [doc.id, ...extra], created: 'replaced' };
  }
  const s = ws();
  // a document with several pages becomes one file per page
  const parts = splitIntoFiles(doc, () => newId('fil'));
  if (s.projectId && canEditTree()) {
    const ids: string[] = [];
    for (const d of parts) {
      const { file } = createWsFile(ls(), s.projectId, { name: d.name, doc: d });
      const entry = loadTree(ls(), s.projectId).files.find((f) => f.id === file.id)!;
      queue({ t: 'createFile', id: file.id, name: entry.name, folderId: null, position: entry.position, kind: entry.kind });
      ids.push(file.id);
    }
    afterTreeChange();
    return { projectId: s.projectId, fileId: ids[0], fileIds: ids, created: 'file' };
  }
  const { project, fileId } = createWsProject(ls(), doc.name, { doc: parts[0], fileName: parts[0].name });
  const ids = [fileId];
  for (const d of parts.slice(1)) ids.push(createWsFile(ls(), project.id, { name: d.name, doc: d }).file.id);
  return { projectId: project.id, fileId, fileIds: ids, created: 'project' };
}
