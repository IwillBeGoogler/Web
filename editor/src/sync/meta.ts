import type { Role } from '../api/types';
import { isRole } from '../lib/roles';

/**
 * Per-project sync metadata kept next to the local copy (localStorage is the cache and the offline queue: a project with
 * `dirty` set is waiting to be uploaded; only the latest whole-project state is kept, see docs/api-client.md).
 * A project with metadata is "server backed": its local id IS the server id.
 */
export interface SyncMeta {
  /** version (ETag) of the last state known to match the server */
  baseVersion: number;
  dirty: boolean;
  /** local edit batches not uploaded yet (for "Offline (queued N)") */
  pending: number;
  lastSyncedAt: number | null;
  /** server's updatedAt / updatedBy at baseVersion */
  serverUpdatedAt: number;
  serverUpdatedBy: string;
  role: Role;
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const key = (id: string) => `sdd:sync:${id}`;
export const SYNC_INDEX_KEY = 'sdd:sync:index';
export const SERVER_LIST_KEY = 'sdd:server-list';

const readIds = (st: Store): string[] => {
  try {
    const v = JSON.parse(st.getItem(SYNC_INDEX_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export function getMeta(st: Store, id: string): SyncMeta | null {
  try {
    const raw = st.getItem(key(id));
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<SyncMeta>;
    if (typeof m.baseVersion !== 'number') return null;
    return {
      baseVersion: m.baseVersion,
      dirty: !!m.dirty,
      pending: typeof m.pending === 'number' ? m.pending : 0,
      lastSyncedAt: typeof m.lastSyncedAt === 'number' ? m.lastSyncedAt : null,
      serverUpdatedAt: typeof m.serverUpdatedAt === 'number' ? m.serverUpdatedAt : 0,
      serverUpdatedBy: typeof m.serverUpdatedBy === 'string' ? m.serverUpdatedBy : '',
      role: isRole(m.role) ? m.role : 'owner',
    };
  } catch {
    return null;
  }
}

export function setMeta(st: Store, id: string, m: SyncMeta): void {
  try {
    st.setItem(key(id), JSON.stringify(m));
    const ids = readIds(st);
    if (!ids.includes(id)) st.setItem(SYNC_INDEX_KEY, JSON.stringify([...ids, id]));
  } catch {
    /* quota */
  }
}

export function clearMeta(st: Store, id: string): void {
  st.removeItem(key(id));
  st.setItem(SYNC_INDEX_KEY, JSON.stringify(readIds(st).filter((x) => x !== id)));
}

export const syncedIds = (st: Store): Set<string> => new Set(readIds(st));
export const isServerBacked = (st: Store, id: string): boolean => getMeta(st, id) !== null;
/** projects waiting to be uploaded (the offline queue) */
export const queuedIds = (st: Store): string[] => readIds(st).filter((id) => getMeta(st, id)?.dirty);
export const queuedCount = (st: Store): number => queuedIds(st).length;

export const freshMeta = (over: Partial<SyncMeta> & Pick<SyncMeta, 'baseVersion'>, now = Date.now()): SyncMeta => ({
  dirty: false,
  pending: 0,
  lastSyncedAt: now,
  serverUpdatedAt: now,
  serverUpdatedBy: '',
  role: 'owner',
  ...over,
});
