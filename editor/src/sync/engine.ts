import { ApiError } from '../api/client';
import type { Role, ServerFile } from '../api/types';
import type { Project } from '../types';
import { freshMeta, getMeta, setMeta, type SyncMeta } from './meta';
import { useSyncStore } from './status';
import { canEdit } from '../lib/roles';

export type ConflictChoice = 'mine' | 'theirs' | 'copy';
export interface ConflictInfo {
  name: string;
  fileId?: string;
  /** `doc` lets the dialog show "View differences" without another request */
  mine: { updatedAt: number; by: string; doc?: Project };
  theirs: { updatedAt: number; by: string; byId?: string; version: number; name: string; doc?: Project };
}
export type Saved = { file: ServerFile; version: number };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface EngineApi {
  getFile(id: string): Promise<Saved>;
  saveFile(id: string, body: { name?: string; data?: unknown }, version: number, o?: { keepalive?: boolean }): Promise<Saved>;
  /** share links: `fileId` picks the file of a project-wide link */
  getShared(token: string, fileId?: string): Promise<Saved>;
  saveShared(token: string, body: { name?: string; data?: unknown }, version: number, fileId?: string, o?: { keepalive?: boolean }): Promise<Saved>;
  /** "save mine as a copy" after a conflict: a new file next to this one */
  createFile(projectId: string, body: { name: string; folderId?: string | null; data?: unknown }): Promise<Saved>;
}
export interface EngineDeps {
  api: EngineApi;
  storage: Store;
  now: () => number;
  online: () => boolean;
  /** current editor content */
  getProject: () => Project;
  /** replace the editor content (must not be treated as a local edit: the engine mutes `subscribe` while it runs) */
  loadProject: (p: Project) => void;
  /** write the project to the local cache (localStorage) */
  cacheLocal: (p: Project) => void;
  cacheNew?: (sp: ServerFile) => void;
  /** the document as the server may see it (private stickies removed); default: as is */
  toServer?: (p: Project) => Project;
  /** called for every content change in the editor */
  subscribe: (cb: () => void) => () => void;
  chooseConflict: (info: ConflictInfo) => Promise<ConflictChoice | null>;
  authorName: (userId: string) => Promise<string>;
  notify: { info: (m: string) => void; error: (m: string) => void; success: (m: string) => void };
  onSaved?: (project: Project, saved: ServerFile) => void;
  debounceMs?: number;
}
export interface SyncTarget {
  /** the file id */
  id: string;
  /** project the file belongs to (copies after a conflict land next to it) */
  projectId?: string;
  folderId?: string | null;
  source: 'project' | 'share';
  token?: string;
  role: Role;
  /** share links have no stored metadata: the version of the opened state */
  baseVersion?: number;
}

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;
const MAX_CONFLICT_ROUNDS = 3;

/** Offline-first sync of the project open in the editor: debounced If-Match saves, offline queue, 412 conflict choices. */
export class SyncEngine {
  private target: SyncTarget | null = null;
  private meta: SyncMeta | null = null;
  private unsub: (() => void) | null = null;
  private keepalive = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryN = 0;
  private seq = 0;
  private lastEditAt = 0;
  private muted = false;
  private inflight: Promise<void> | null = null;
  private again = false;
  private stopped = true;

  constructor(private d: EngineDeps) {}

  get readOnly(): boolean {
    return !this.target || !canEdit(this.target.role);
  }
  hasUnsavedChanges(): boolean {
    return !!this.meta?.dirty;
  }

  start(target: SyncTarget): void {
    this.stop();
    this.stopped = false;
    this.target = target;
    const stored = target.source === 'project' ? getMeta(this.d.storage, target.id) : null;
    this.meta = stored ?? freshMeta({ baseVersion: target.baseVersion ?? 0, role: target.role }, this.d.now());
    this.meta.role = target.role;
    const st = useSyncStore.getState();
    if (this.readOnly) st.set({ status: 'readonly', queued: 0, message: null, lastSyncedAt: this.meta.lastSyncedAt });
    else {
      st.set({ status: this.meta.dirty ? (this.d.online() ? 'saving' : 'offline') : 'saved', queued: this.meta.pending, message: null, lastSyncedAt: this.meta.lastSyncedAt });
      this.unsub = this.d.subscribe(() => this.markDirty());
      if (this.meta.dirty) this.schedule(0);
    }
  }

  stop(): void {
    this.stopped = true;
    this.unsub?.();
    this.unsub = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = this.retryTimer = null;
    this.target = null;
  }

  private persist(): void {
    if (this.target?.source === 'project' && this.meta) setMeta(this.d.storage, this.target.id, this.meta);
  }

  private markDirty(): void {
    if (this.muted || this.readOnly || !this.meta) return;
    this.seq++;
    this.lastEditAt = this.d.now();
    this.meta = { ...this.meta, dirty: true, pending: this.meta.pending + 1 };
    this.persist();
    useSyncStore.getState().set({ queued: this.meta.pending, ...(this.d.online() ? {} : { status: 'offline' as const }) });
    this.schedule(this.d.debounceMs ?? 1000);
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  /** Reconnected: upload whatever is queued. */
  onOnline(): void {
    this.retryN = 0;
    if (this.meta?.dirty) void this.flush();
    else if (this.target?.source === 'project') void this.pull();
  }

  /** Upload now (tab hide, leaving the editor, retry button). */
  async flush(o: { keepalive?: boolean } = {}): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.readOnly || !this.meta?.dirty || this.stopped) return;
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    if (!this.d.online()) {
      useSyncStore.getState().set({ status: 'offline', queued: this.meta.pending });
      return;
    }
    this.keepalive = !!o.keepalive;
    this.inflight = this.run().finally(() => {
      this.inflight = null;
      if (this.again && !this.stopped) {
        this.again = false;
        if (this.meta?.dirty) this.schedule(this.d.debounceMs ?? 1000);
      }
    });
    return this.inflight;
  }

  /** Retry button: clears an error / conflict and tries again. */
  async retry(): Promise<void> {
    this.retryN = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (!this.meta?.dirty) return this.pull();
    return this.flush();
  }

  private async send(project: Project, version: number): Promise<Saved> {
    const t = this.target!;
    const body = { name: project.name, data: this.d.toServer ? this.d.toServer(project) : project };
    const ka = this.keepalive ? { keepalive: true } : undefined;
    this.keepalive = false;
    if (t.source === 'share') return ka ? this.d.api.saveShared(t.token!, body, version, t.id, ka) : this.d.api.saveShared(t.token!, body, version, t.id);
    return ka ? this.d.api.saveFile(t.id, body, version, ka) : this.d.api.saveFile(t.id, body, version);
  }
  private async fetchServer(): Promise<Saved> {
    const t = this.target!;
    return t.source === 'share' ? this.d.api.getShared(t.token!, t.id) : this.d.api.getFile(t.id);
  }

  private async run(rounds = 0): Promise<void> {
    const t = this.target;
    if (!t || !this.meta) return;
    const set = useSyncStore.getState().set;
    const seq = this.seq;
    const project = this.d.getProject();
    set({ status: 'saving', message: null });
    try {
      const saved = await this.send(project, this.meta.baseVersion);
      this.afterSave(saved, project, seq);
    } catch (e) {
      await this.fail(e, project, rounds);
    }
  }

  private afterSave(saved: Saved, sent: Project, seq: number): void {
    const stillDirty = seq !== this.seq;
    this.meta = {
      ...this.meta!,
      baseVersion: saved.version,
      lastSyncedAt: this.d.now(),
      serverUpdatedAt: saved.file.updatedAt,
      serverUpdatedBy: saved.file.updatedBy ?? '',
      dirty: stillDirty,
      pending: stillDirty ? this.meta!.pending : 0,
    };
    this.persist();
    this.retryN = 0;
    useSyncStore.getState().set({ status: 'saved', queued: this.meta.pending, lastSyncedAt: this.meta.lastSyncedAt, message: null });
    if (stillDirty) this.schedule(this.d.debounceMs ?? 1000);
    this.d.onSaved?.(sent, saved.file);
  }

  private async fail(e: unknown, mine: Project, rounds: number): Promise<void> {
    const set = useSyncStore.getState().set;
    const q = this.meta?.pending ?? 0;
    if (!(e instanceof ApiError)) {
      set({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
      return;
    }
    if (e.isNetwork) {
      set({ status: 'offline', queued: q, message: null });
      this.retryLater();
    } else if (e.isConflict && rounds < MAX_CONFLICT_ROUNDS) {
      await this.resolveConflict(mine, rounds);
    } else if (e.isUnauthorized) {
      set({ status: 'error', message: 'Signed out. Log in again to sync your changes.' });
    } else if (e.status === 403 || e.status === 404) {
      set({ status: 'error', message: e.status === 404 ? 'This file is no longer available on the server.' : 'You no longer have permission to edit this file.' });
    } else if (e.status === 429) {
      set({ status: 'error', message: e.message });
      this.retryLater((e.retryAfter ?? 30) * 1000);
    } else {
      set({ status: 'error', message: e.message });
    }
  }

  private retryLater(ms?: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = ms ?? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retryN++);
    this.retryTimer = setTimeout(() => void this.flush(), delay);
  }

  // ---- conflicts -------------------------------------------------------------------------------
  private async resolveConflict(mine: Project, rounds: number): Promise<void> {
    const set = useSyncStore.getState().set;
    set({ status: 'conflict', message: 'Someone else saved a newer version.' });
    let theirs: Saved;
    try {
      theirs = await this.fetchServer();
    } catch (e) {
      return this.fail(e, mine, rounds + 1);
    }
    const by = await this.d.authorName(theirs.file.updatedBy ?? '').catch(() => 'someone');
    const choice = await this.d.chooseConflict({
      name: mine.name,
      fileId: this.target?.id,
      mine: { updatedAt: this.lastEditAt || this.d.now(), by: 'You', doc: mine },
      theirs: { updatedAt: theirs.file.updatedAt, by, byId: theirs.file.updatedBy ?? undefined, version: theirs.version, name: theirs.file.name, doc: theirs.file.data },
    });
    if (choice === null) return; // decide later: stays in "Conflict", the indicator offers Retry
    if (choice === 'theirs') {
      this.applyServer(theirs);
      this.d.notify.info('Took the other version.');
      return;
    }
    if (choice === 'copy') {
      try {
        const copy = await this.d.api.createFile(this.target!.projectId ?? theirs.file.projectId, { name: `${mine.name} (copy)`, folderId: this.target!.folderId ?? theirs.file.folderId, data: mine });
        this.d.cacheNew?.(copy.file);
        this.applyServer(theirs);
        this.d.notify.success(`Your version was saved as “${copy.file.name}”.`);
      } catch (e) {
        await this.fail(e, mine, rounds + 1);
      }
      return;
    }
    // keep mine: overwrite the version we just fetched
    const seq = this.seq;
    try {
      const saved = await this.send(mine, theirs.version);
      this.afterSave(saved, mine, seq);
    } catch (e) {
      if (e instanceof ApiError && e.isConflict && rounds + 1 < MAX_CONFLICT_ROUNDS) return this.resolveConflict(mine, rounds + 1);
      await this.fail(e, mine, rounds + 1);
    }
  }

  /** Replace the editor content with the server state and mark everything synced. */
  private applyServer(s: Saved): void {
    const data: Project = { ...s.file.data, id: this.target!.id, name: s.file.name, updatedAt: s.file.updatedAt };
    this.muted = true;
    try {
      this.d.loadProject(data);
    } finally {
      this.muted = false;
    }
    if (this.target!.source === 'project') this.d.cacheLocal(data);
    this.seq++;
    this.meta = { ...this.meta!, baseVersion: s.version, dirty: false, pending: 0, lastSyncedAt: this.d.now(), serverUpdatedAt: s.file.updatedAt, serverUpdatedBy: s.file.updatedBy ?? '', role: s.file.role ?? this.meta!.role };
    this.persist();
    useSyncStore.getState().set({ status: this.readOnly ? 'readonly' : 'saved', queued: 0, lastSyncedAt: this.meta.lastSyncedAt, message: null });
  }

  // ---- pulling ---------------------------------------------------------------------------------
  /** Fetch the server state. Clean local copy: take a newer version silently; local edits pending: keep them (the next save resolves it). */
  async pull(): Promise<void> {
    if (!this.target || !this.meta) return;
    let s: Saved;
    try {
      s = await this.fetchServer();
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) useSyncStore.getState().set({ status: this.readOnly ? 'readonly' : 'offline', queued: this.meta.pending });
      else if (e instanceof ApiError && !e.isUnauthorized) useSyncStore.getState().set({ status: 'error', message: e.message });
      return;
    }
    if (!this.target || !this.meta) return;
    if (s.version > this.meta.baseVersion && !this.meta.dirty) this.applyServer(s);
    else if (s.file.role && s.file.role !== this.meta.role) {
      this.meta = { ...this.meta, role: s.file.role };
      this.persist();
    }
    if (this.meta.dirty && !this.readOnly) this.schedule(0);
  }

  /** WebSocket `file.updated` from someone else. Returns true when it was applied without asking. */
  async applyRemoteUpdate(version: number): Promise<'applied' | 'dirty' | 'stale'> {
    if (!this.meta || version <= this.meta.baseVersion) return 'stale';
    if (this.meta.dirty) return 'dirty';
    await this.pull();
    return 'applied';
  }

  /** Take a server state fetched elsewhere (version restore): replaces the editor content and marks it synced. */
  applyRemote(s: Saved): void {
    if (this.target) this.applyServer(s);
  }

  /** The user chose "Reload" in the toast: take the server version, dropping local edits. */
  async reloadFromServer(): Promise<void> {
    if (!this.target) return;
    try {
      this.applyServer(await this.fetchServer());
    } catch (e) {
      await this.fail(e, this.d.getProject(), 0);
    }
  }

  get baseVersion(): number {
    return this.meta?.baseVersion ?? 0;
  }
}
