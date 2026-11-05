import { newId } from '../lib/graph';
import { buildSddProj, readSddProj, type ProjFile } from '../lib/sdd/sddproj';
import type { SddLimits } from '../lib/sdd/sdd';
import { createProject as emptyDoc } from '../lib/project';
import { createWsProject, deleteStarter, getWsProject, loadFile, loadTree, saveFile, saveTree, type Store } from './storage';
import type { ProjectTree } from './types';

/** Whole project -> .sddproj bytes (folders, files, kinds, order). Files without a cached document export as empty files. */
export function exportProjectBytes(st: Store, projectId: string): Uint8Array {
  const project = getWsProject(st, projectId);
  if (!project) throw new Error('Project not found');
  const tree = loadTree(st, projectId);
  const files: ProjFile[] = tree.files.map((f) => ({
    id: f.id, folderId: f.folderId, name: f.name, kind: f.kind, position: f.position,
    doc: loadFile(st, f.id) ?? { ...emptyDoc(f.name), id: f.id },
  }));
  return buildSddProj({ name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, folders: tree.folders, files });
}

/** .sddproj bytes -> a NEW local project (fresh ids everywhere). Throws SddError for anything unsafe or invalid; nothing is written then. */
export function importProjectBytes(st: Store, bytes: Uint8Array, limits?: SddLimits): { projectId: string; firstFileId: string | null; warnings: string[] } {
  const r = readSddProj(bytes, limits); // validates everything before the first write
  const { project } = createWsProject(st, r.name.trim() || 'Imported project', {});
  deleteStarter(st, project.id); // createWsProject makes a starter file: the archive defines the content instead
  const folderIds = new Map(r.folders.map((f) => [f.id, newId('fld')]));
  let tree: ProjectTree = { folders: r.folders.map((f) => ({ id: folderIds.get(f.id)!, parentId: f.parentId ? folderIds.get(f.parentId)! : null, name: f.name.trim() || 'Folder', position: f.position })), files: [] };
  const now = Date.now();
  let first: string | null = null;
  for (const f of r.files) {
    const id = newId('fil');
    first ??= id;
    const doc = saveFile(st, { ...f.doc, id, name: f.name }, f.doc.updatedAt);
    tree = { ...tree, files: [...tree.files, { id, folderId: f.folderId ? folderIds.get(f.folderId)! : null, name: f.name.trim() || 'Untitled', kind: f.kind, position: f.position, createdAt: f.doc.createdAt || now, updatedAt: doc.updatedAt, pageCount: doc.pages.length }] };
  }
  saveTree(st, project.id, tree, now);
  return { projectId: project.id, firstFileId: first, warnings: r.warnings };
}
