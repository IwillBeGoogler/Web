import { create } from 'zustand';
import type { Role } from '../lib/roles';

export type SyncStatus = 'idle' | 'saved' | 'saving' | 'offline' | 'conflict' | 'error' | 'readonly';
interface SyncState {
  status: SyncStatus;
  /** edit batches waiting for upload */
  queued: number;
  lastSyncedAt: number | null;
  message: string | null;
  /** from the WebSocket hello */
  clientId: string | null;
  connected: boolean;
  set: (p: Partial<Omit<SyncState, 'set' | 'reset'>>) => void;
  reset: () => void;
}
const initial = { status: 'idle' as SyncStatus, queued: 0, lastSyncedAt: null, message: null, clientId: null, connected: false };
export const useSyncStore = create<SyncState>((set) => ({ ...initial, set: (p) => set(p), reset: () => set({ ...initial }) }));

export interface Presence {
  clientId: string;
  userId: string | null;
  name: string;
  role: string;
}
interface PresenceState {
  users: Presence[];
  set: (u: Presence[]) => void;
}
export const usePresence = create<PresenceState>((set) => ({ users: [], set: (users) => set({ users }) }));

/** project channel: everybody who has a file of the open project open (one entry per connection; `fileId` = which file) */
export interface ProjectPresenceUser extends Presence {
  fileId?: string | null;
}
export const useProjectPresence = create<{ users: ProjectPresenceUser[]; set: (u: ProjectPresenceUser[]) => void }>((set) => ({ users: [], set: (users) => set({ users }) }));

/** what the editor is currently showing */
export interface EditorSession {
  source: 'local' | 'server' | 'share';
  role: Role;
  shareToken: string | null;
  /** viewer role / viewer share link: nothing may be edited or saved */
  readOnly: boolean;
}
interface SessionState extends EditorSession {
  set: (s: Partial<EditorSession>) => void;
  reset: () => void;
}
const localSession: EditorSession = { source: 'local', role: 'owner', shareToken: null, readOnly: false };
export const useEditorSession = create<SessionState>((set) => ({ ...localSession, set: (s) => set(s), reset: () => set({ ...localSession }) }));
