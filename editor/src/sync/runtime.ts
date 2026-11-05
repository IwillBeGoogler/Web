import { ApiError } from '../api/client';
import type { Api } from '../api/api';
import type { ServerFile } from '../api/types';
import type { Project } from '../types';
import { siblings } from '../workspace/tree';
import {
  deleteWsProject, getProjectSync, getWsProject, listWsProjects, loadFile, loadTree, projectOfFile, putWsProject, saveFile, saveTree, setProjectSync, syncFileMeta, type Store,
} from '../workspace/storage';
import type { WsProject } from '../workspace/types';
import { SyncEngine, type EngineApi } from './engine';
import { useSyncStore } from './status';
import { freshMeta, getMeta, queuedIds, setMeta } from './meta';
import { projectsWithQueue, readQueue, syncProjectTree, type TreeSyncDeps } from './treeSync';
import { canEdit } from '../lib/roles';

/** Cache a server file locally (id = server id) and mark it as synced at that version. */
export function adoptServerFile(st: Store, f: ServerFile): Project {
  const saved = saveFile(st, { ...f.data, id: f.id, name: f.name }, f.updatedAt);
  setMeta(st, f.id, freshMeta({ baseVersion: f.version, role: f.role, serverUpdatedAt: f.updatedAt, serverUpdatedBy: f.updatedBy ?? '' }));
  syncFileMeta(st, f.projectId, saved);
  return saved;
}

/** Projects that exist only in this browser. */
export function localOnlyProjects(st: Store): WsProject[] {
  return listWsProjects(st).filter((p) => !getProjectSync(st, p.id));
}

/**
 * First upload of a local-only project. Ids are chosen by the client and kept by the server, so nothing is re-keyed:
 * the project + one file first, then folders (parents before children), then the remaining files with their documents.
 */
export async function uploadLocalProject(api: Pick<Api, 'createProject' | 'createFolder' | 'createFile' | 'patchFile' | 'deleteFile'>, st: Store, projectId: string): Promise<void> {
  const project = getWsProject(st, projectId);
  if (!project) throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  const tree = loadTree(st, projectId);
  const rootFiles = siblings(tree, null).filter((e) => e.kind === 'file');
  const files = tree.files;
  const first = tree.files.find((f) => f.id === rootFiles[0]?.id) ?? files[0];
  const firstDoc = first ? loadFile(st, first.id) : null;
  const created = await api.createProject({ id: projectId, name: project.name, ...(first ? { file: { id: first.id, name: first.name, ...(firstDoc ? { data: firstDoc } : {}) } } : {}) });
  const done = new Set<string>();
  const mark = (f: ServerFile) => {
    setMeta(st, f.id, getMeta(st, f.id) ?? freshMeta({ baseVersion: f.version, role: f.role, serverUpdatedAt: f.updatedAt, serverUpdatedBy: f.updatedBy ?? '' }));
    done.add(f.id);
  };
  mark(created.file);
  if (!first) await api.deleteFile(created.file.id); // an empty project: the server always makes a first file
  // folders, parents first
  const placed = new Set<string | null>([null]);
  let pending = [...tree.folders];
  while (pending.length) {
    const ready = pending.filter((f) => placed.has(f.parentId));
    if (!ready.length) break; // orphans (corrupt tree): skip
    for (const f of ready) {
      await api.createFolder(projectId, { id: f.id, name: f.name, parentId: f.parentId, position: f.position });
      placed.add(f.id);
    }
    pending = pending.filter((f) => !placed.has(f.id));
  }
  for (const f of files) {
    if (f.id === first?.id) {
      if (f.folderId !== null || f.position !== 0) await api.patchFile(f.id, { folderId: f.folderId, position: f.position });
      continue;
    }
    if (f.folderId !== null && !placed.has(f.folderId)) continue;
    const doc = loadFile(st, f.id);
    const r = await api.createFile(projectId, { id: f.id, name: f.name, kind: f.kind, folderId: f.folderId, position: f.position, ...(doc ? { data: doc } : {}) });
    mark(r.file);
  }
  setProjectSync(st, projectId, { serverBacked: true, role: 'owner', treeRev: created.project.treeRev, lastSyncedAt: Date.now() });
}

export interface SyncDownDeps extends TreeSyncDeps {
  api: TreeSyncDeps['api'] & Pick<Api, 'listProjects' | 'getFile'>;
}
export interface SyncDownResult {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
}
const MAX_DOC_FETCHES = 60;

/**
 * Mirror the server into the local cache: new projects, changed trees (queued tree ops are flushed first, then replayed on top),
 * and file documents that are missing or newer on the server. Dirty local documents are never overwritten.
 */
export async function syncDown(d: SyncDownDeps, projectIds?: string[]): Promise<SyncDownResult> {
  const { api, storage: st } = d;
  const { items, total } = await api.listProjects();
  const out: SyncDownResult = { added: 0, updated: 0, skipped: 0, removed: 0 };
  let fetches = 0;
  const only = projectIds ? new Set(projectIds) : null;
  for (const row of items) {
    if (only && !only.has(row.id)) continue;
    const local = getWsProject(st, row.id);
    const sync = getProjectSync(st, row.id);
    const queued = readQueue(st, row.id).length > 0;
    if (!local) {
      // unknown here: create the container, then the tree pull below fills it
      const now = Date.now();
      saveTree(st, row.id, { folders: [], files: [] }, now);
      putWsProject(st, { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt, ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}) });
      out.added++;
    } else {
      if (!(sync && sync.treeRev >= row.treeRev && !queued)) out.updated++;
      if ((local.thumbnailUrl ?? null) !== (row.thumbnailUrl ?? null)) {
        const { thumbnailUrl: _old, ...rest } = local;
        void _old;
        putWsProject(st, { ...rest, ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}) });
      }
    }
    if (!local || !sync || sync.treeRev < row.treeRev || queued) {
      try {
        await syncProjectTree(d, row.id);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        out.skipped++;
        continue;
      }
    }
    // documents
    for (const f of loadTree(st, row.id).files) {
      if (fetches >= MAX_DOC_FETCHES) break;
      const meta = getMeta(st, f.id);
      if (meta?.dirty) continue;
      const doc = loadFile(st, f.id);
      if (doc && meta) continue; // known version: a newer one arrives through the file channel / next open
      if (doc && !readQueue(st, row.id).some((o) => o.t === 'createFile' && o.id === f.id)) continue; // already cached
      try {
        fetches++;
        adoptServerFile(st, (await api.getFile(f.id)).file);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        out.skipped++;
      }
    }
  }
  // server-backed projects that are gone from the server (deleted / access removed): drop the cache unless something is unsent
  if (!only && items.length === total) {
    const live = new Set(items.map((p) => p.id));
    for (const p of listWsProjects(st)) {
      if (live.has(p.id) || !getProjectSync(st, p.id) || readQueue(st, p.id).length) continue;
      const dirty = loadTree(st, p.id).files.some((f) => getMeta(st, f.id)?.dirty);
      if (dirty) continue;
      deleteWsProject(st, p.id);
      out.removed++;
    }
  }
  return out;
}


export interface FlushDeps {
  api: EngineApi;
  storage: Store;
  online: () => boolean;
  now: () => number;
  /** the file open in the editor has its own engine */
  exceptId?: string;
}
/** Offline queue for documents: upload every dirty cached file that is not open. Conflicts are left for when the file is opened. Returns how many were attempted. */
export async function flushQueuedFiles(d: FlushDeps): Promise<number> {
  if (!d.online()) return 0;
  let n = 0;
  for (const id of queuedIds(d.storage)) {
    if (id === d.exceptId) continue;
    const meta = getMeta(d.storage, id);
    if (!meta || !canEdit(meta.role) || !loadFile(d.storage, id)) continue;
    const projectId = projectOfFile(d.storage, id) ?? undefined;
    const engine = new SyncEngine({
      api: d.api,
      storage: d.storage,
      now: d.now,
      online: d.online,
      getProject: () => loadFile(d.storage, id)!,
      loadProject: (p) => void saveFile(d.storage, p),
      cacheLocal: (p) => void saveFile(d.storage, p),
      subscribe: () => () => undefined,
      chooseConflict: async () => null,
      authorName: async () => 'someone',
      notify: { info: () => undefined, error: () => undefined, success: () => undefined },
    });
    const { status, queued, message, lastSyncedAt } = useSyncStore.getState(); // the background engine shares the status store
    engine.start({ id, projectId, source: 'project', role: meta.role });
    n++;
    await engine.flush();
    engine.stop();
    useSyncStore.getState().set({ status, queued, message, lastSyncedAt });
  }
  return n;
}

/** Unsent work anywhere (documents or tree operations) */
export const hasUnsent = (st: Store): boolean => queuedIds(st).length > 0 || projectsWithQueue(st).length > 0;

/** A project the server knows but this browser does not (deep link, shared with me): cache its container and tree. Returns false when it does not exist / is not accessible. */
export async function adoptServerProject(d: TreeSyncDeps & { api: Pick<Api, 'getProject'> }, projectId: string): Promise<boolean> {
  try {
    const p = await d.api.getProject(projectId);
    if (!getWsProject(d.storage, projectId)) {
      putWsProject(d.storage, { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt });
      saveTree(d.storage, projectId, { folders: [], files: [] }, p.updatedAt);
    }
    await syncProjectTree(d, projectId);
    return !!getProjectSync(d.storage, projectId);
  } catch (e) {
    if (e instanceof ApiError) return false;
    throw e;
  }
}
