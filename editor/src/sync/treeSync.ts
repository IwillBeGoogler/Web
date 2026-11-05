import { ApiError } from '../api/client';
import type { Api } from '../api/api';
import type { ServerTree } from '../api/types';
import { clearMeta, freshMeta, getMeta, setMeta } from './meta';
import { createFile, createFolder, deleteEntry, moveEntry, renameEntry } from '../workspace/tree';
import { getWsProject, listWsProjects, loadFile, loadTree, renameWsProject, saveTree, setProjectSync, type Store } from '../workspace/storage';
import type { FileKind, ProjectTree } from '../workspace/types';
import { deleteProject as deleteFileDoc } from '../lib/projects';

/**
 * Offline-first sync of the PROJECT TREE (folders, file entries, names, order). Tree operations are applied to the local
 * tree immediately and queued; the queue is replayed against the server when online. Creates carry client-chosen ids so a
 * replay after a lost response is harmless. Tree ops are last-writer-wins (no If-Match): after the queue drains the server
 * tree is fetched and becomes the truth, with still-pending ops replayed on top.
 */
export type TreeOp =
  | { t: 'createFolder'; id: string; name: string; parentId: string | null; position: number }
  | { t: 'createFile'; id: string; name: string; folderId: string | null; position: number; kind: FileKind }
  | { t: 'patchFolder'; id: string; name?: string; parentId?: string | null; position?: number }
  | { t: 'patchFile'; id: string; name?: string; folderId?: string | null; position?: number }
  | { t: 'deleteFolder'; id: string }
  | { t: 'deleteFile'; id: string }
  | { t: 'renameProject'; name: string };

const qKey = (pid: string) => `sdd:ws:q:${pid}`;
export function readQueue(st: Store, projectId: string): TreeOp[] {
  try {
    const v = JSON.parse(st.getItem(qKey(projectId)) ?? '[]');
    return Array.isArray(v) ? (v as TreeOp[]).filter((o) => o && typeof o.t === 'string') : [];
  } catch {
    return [];
  }
}
function writeQueue(st: Store, projectId: string, ops: TreeOp[]): void {
  try {
    if (ops.length) st.setItem(qKey(projectId), JSON.stringify(ops));
    else st.removeItem(qKey(projectId));
  } catch {
    /* quota */
  }
}
export const queueLength = (st: Store, projectId: string): number => readQueue(st, projectId).length;
/** projects with unsent tree operations */
export const projectsWithQueue = (st: Store): string[] => listWsProjects(st).map((p) => p.id).filter((id) => readQueue(st, id).length > 0);

/** apply one operation to a tree (used to replay the queue on top of the server tree) */
export function applyOp(tree: ProjectTree, op: TreeOp, now = Date.now()): ProjectTree {
  switch (op.t) {
    case 'createFolder':
      return createFolder(tree, { id: op.id, name: op.name, parentId: op.parentId, position: op.position });
    case 'createFile':
      return createFile(tree, { id: op.id, name: op.name, folderId: op.folderId, position: op.position, kind: op.kind, now });
    case 'patchFolder':
    case 'patchFile': {
      const ref = { kind: op.t === 'patchFolder' ? ('folder' as const) : ('file' as const), id: op.id };
      let t = tree;
      if (op.name !== undefined) t = renameEntry(t, ref, op.name, now);
      const parent = op.t === 'patchFolder' ? op.parentId : op.folderId;
      if (parent !== undefined) {
        const r = moveEntry(t, ref, parent);
        if (r.ok) t = r.tree;
      }
      if (op.position !== undefined) {
        const set = (list: { id: string; position: number }[]) => list.map((x) => (x.id === op.id ? { ...x, position: op.position! } : x));
        t = op.t === 'patchFolder' ? { ...t, folders: set(t.folders) as typeof t.folders } : { ...t, files: set(t.files) as typeof t.files };
      }
      return t;
    }
    case 'deleteFolder':
      return deleteEntry(tree, { kind: 'folder', id: op.id }).tree;
    case 'deleteFile':
      return deleteEntry(tree, { kind: 'file', id: op.id }).tree;
    case 'renameProject':
      return tree;
  }
}

/** shrink the queue: merge consecutive patches of one entity, forget files created and deleted while offline */
export function compact(ops: TreeOp[]): TreeOp[] {
  let out: TreeOp[] = [];
  for (const op of ops) {
    if (op.t === 'deleteFile' && out.some((o) => o.t === 'createFile' && o.id === op.id)) {
      // it never reached the server: nothing to send at all
      out = out.filter((o) => !(('id' in o) && o.id === op.id && (o.t === 'createFile' || o.t === 'patchFile')));
      continue;
    }
    const prev = out[out.length - 1];
    if ((op.t === 'patchFile' || op.t === 'patchFolder') && prev && prev.t === op.t && prev.id === op.id) {
      out[out.length - 1] = { ...prev, ...op } as TreeOp;
      continue;
    }
    if (op.t === 'renameProject') out = out.filter((o) => o.t !== 'renameProject');
    out.push(op);
  }
  return out;
}

export function enqueue(st: Store, projectId: string, op: TreeOp | TreeOp[]): void {
  writeQueue(st, projectId, compact([...readQueue(st, projectId), ...(Array.isArray(op) ? op : [op])]));
}

export interface TreeSyncDeps {
  api: Pick<Api, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'createFile' | 'patchFile' | 'deleteFile' | 'renameProject' | 'getTree'>;
  storage: Store;
  online: () => boolean;
  now: () => number;
}
export type FlushResult = { sent: number; dropped: number; left: number; stopped: 'offline' | 'unauthorized' | 'error' | null };

/** Send queued operations in order. Network / auth errors stop the run (the queue stays); a rejected op is dropped and the tree re-pulled. */
export async function flushTreeQueue(d: TreeSyncDeps, projectId: string): Promise<FlushResult> {
  const res: FlushResult = { sent: 0, dropped: 0, left: 0, stopped: null };
  if (!d.online()) return { ...res, left: queueLength(d.storage, projectId), stopped: 'offline' };
  for (let guard = 0; guard < 5000; guard++) {
    const queue = readQueue(d.storage, projectId);
    if (!queue.length) break;
    const op = queue[0];
    try {
      await send(d, projectId, op);
      res.sent++;
    } catch (e) {
      if (!(e instanceof ApiError)) {
        res.stopped = 'error';
        break;
      }
      if (e.isNetwork || e.status >= 500 || e.status === 429) {
        res.stopped = 'offline';
        break;
      }
      if (e.isUnauthorized) {
        res.stopped = 'unauthorized';
        break;
      }
      // 404 on delete = already gone; 4xx otherwise = the world changed under us (parent deleted, cycle, no permission): drop the op, the pull below shows the truth
      res.dropped++;
    }
    writeQueue(d.storage, projectId, readQueue(d.storage, projectId).slice(1));
  }
  res.left = queueLength(d.storage, projectId);
  return res;
}

async function send(d: TreeSyncDeps, projectId: string, op: TreeOp): Promise<void> {
  const { api, storage } = d;
  switch (op.t) {
    case 'createFolder':
      await api.createFolder(projectId, { id: op.id, name: op.name, parentId: op.parentId, position: op.position });
      return;
    case 'createFile': {
      const doc = loadFile(storage, op.id) ?? undefined;
      const saved = await api.createFile(projectId, { id: op.id, name: op.name, kind: op.kind, folderId: op.folderId, position: op.position, ...(doc ? { data: doc } : {}) });
      // the file is now server backed: later edits sync through the file engine with this base version
      const keep = getMeta(storage, op.id);
      if (!keep) setMeta(storage, op.id, freshMeta({ baseVersion: saved.file.version, serverUpdatedAt: saved.file.updatedAt, serverUpdatedBy: saved.file.updatedBy ?? '', role: saved.file.role }, d.now()));
      return;
    }
    case 'patchFolder':
      await api.patchFolder(op.id, { name: op.name, parentId: op.parentId, position: op.position });
      return;
    case 'patchFile':
      await api.patchFile(op.id, { name: op.name, folderId: op.folderId, position: op.position });
      return;
    case 'deleteFolder':
      try {
        await api.deleteFolder(op.id);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      return;
    case 'deleteFile':
      try {
        await api.deleteFile(op.id);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
      return;
    case 'renameProject':
      await api.renameProject(projectId, op.name);
      return;
  }
}

/**
 * Make the local tree match the server tree, then replay still-queued operations on top (so offline work is never undone by a pull).
 * Files that vanished on the server lose their local copy. Returns the ids of removed files.
 */
export function reconcileTree(st: Store, projectId: string, server: ServerTree, now = Date.now()): { removedFiles: string[]; tree: ProjectTree } {
  const pending = readQueue(st, projectId);
  let tree: ProjectTree = {
    folders: server.folders.map((f) => ({ id: f.id, parentId: f.parentId, name: f.name, position: f.position })),
    files: server.files.map((f) => ({ id: f.id, folderId: f.folderId, name: f.name, kind: f.kind, position: f.position, createdAt: f.createdAt, updatedAt: f.updatedAt, pageCount: f.pageCount })),
  };
  const before = loadTree(st, projectId);
  for (const op of pending) tree = applyOp(tree, op, now);
  const keepCreated = new Set(pending.filter((o) => o.t === 'createFile').map((o) => (o as { id: string }).id));
  const removedFiles = before.files.filter((f) => !tree.files.some((x) => x.id === f.id) && !keepCreated.has(f.id)).map((f) => f.id);
  // a file that exists locally and has a pending create stays even if the server does not know it yet
  const stillLocal = before.files.filter((f) => keepCreated.has(f.id) && !tree.files.some((x) => x.id === f.id));
  if (stillLocal.length) tree = { ...tree, files: [...tree.files, ...stillLocal] };
  saveTree(st, projectId, tree, now);
  for (const id of removedFiles) {
    deleteFileDoc(st, id);
    clearMeta(st, id);
  }
  const p = getWsProject(st, projectId);
  if (p && p.name !== server.project.name && !pending.some((o) => o.t === 'renameProject')) renameWsProject(st, projectId, server.project.name, p.updatedAt);
  setProjectSync(st, projectId, { serverBacked: true, role: server.project.role, treeRev: server.treeRev, lastSyncedAt: now });
  return { removedFiles, tree };
}

/** Flush the queue, then pull and reconcile. Safe to call at any time (no-op while offline). */
export async function syncProjectTree(d: TreeSyncDeps, projectId: string): Promise<{ flushed: FlushResult; removedFiles: string[]; pulled: boolean }> {
  const flushed = await flushTreeQueue(d, projectId);
  if (flushed.stopped === 'offline' || flushed.stopped === 'unauthorized') return { flushed, removedFiles: [], pulled: false };
  try {
    const server = await d.api.getTree(projectId);
    const { removedFiles } = reconcileTree(d.storage, projectId, server, d.now());
    return { flushed, removedFiles, pulled: true };
  } catch {
    return { flushed, removedFiles: [], pulled: false };
  }
}

