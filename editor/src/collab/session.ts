import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { canEdit, type Role } from '../lib/roles';
import { SEED_ORIGIN, StoreBinding, type BindingStore } from './binding';
import { CollabProvider, type CollabStatus, type ProviderOptions } from './provider';
import { collaborators as listCollaborators, colorForUser, jsonEqualPoint, presenceStatus, type Collaborator, type PresenceStatus, type Pt, type Rect, type RemoteState } from './presenceMath';
import { isDocEmpty } from './yproject';
import type { HistoryDriver } from '../store/diagramStore';

export interface PersistenceLike {
  whenSynced: Promise<unknown>;
  destroy: () => unknown;
  /** y-indexeddb: delete the stored copy */
  clearData?: () => unknown;
}
export interface SessionOptions {
  fileId: string;
  role: Role;
  user: { id: string | null; name: string } | null;
  /** the file's MQTT connection (its owner closes it) */
  link: ProviderOptions['link'];
  store: BindingStore;
  /** local persistence of the doc (offline edits survive a reload): a factory, `null` for none; default = y-indexeddb when the browser has IndexedDB */
  persistence?: ((doc: Y.Doc, name: string) => PersistenceLike) | null;
  setHistoryDriver?: (d: HistoryDriver | null) => void;
  /** nothing cached and no server after this long: start from the editor content (offline-first) */
  seedTimeoutMs?: number;
  onStatus?: (s: CollabStatus) => void;
  onFatalClose?: (code: number) => void;
  onDenied?: (reason: string) => void;
  onSynced?: () => void;
  /** ctl 1012 (the document was restored on the server): the local copy was cleared; the owner starts a fresh session */
  onRestart?: () => void;
}

const defaultPersistence = (doc: Y.Doc, name: string): PersistenceLike | null => {
  try {
    if (typeof indexedDB === 'undefined') return null;
    return new IndexeddbPersistence(name, doc);
  } catch {
    return null;
  }
};
const PUBLISH_MS = 30;
const IDB_WAIT_MS = 1500;

/**
 * Everything for ONE collaboratively edited file: Y.Doc + awareness + local persistence + the network provider + the store binding.
 *
 * Opening order (the server is the only party that ever seeds a doc from JSON, so two clients never duplicate content):
 *   1. IndexedDB content (offline edits, last session) is applied to the editor right away
 *   2. the provider connects; the first sync makes the server's doc the truth (an EMPTY server doc is seeded from the editor)
 *   3. server unreachable and nothing cached: after `seedTimeoutMs` the editor content is seeded locally (offline-first)
 * Edits made offline merge on reconnect; there is no conflict dialog for these files.
 */
export class CollabSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly binding: StoreBinding;
  readonly provider: CollabProvider;
  readonly readOnly: boolean;
  private persistence: PersistenceLike | null = null;
  private started = false;
  private bound = false;
  private seedTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Partial<RemoteState> = {};
  private unsubStore: (() => void) | null = null;
  private lastActive = Date.now();
  private listeners = new Set<() => void>();
  private lastSel = '';
  private stopped = false;

  constructor(private o: SessionOptions) {
    this.readOnly = !canEdit(o.role);
    this.binding = new StoreBinding({ doc: this.doc, store: o.store, fileId: o.fileId, readOnly: this.readOnly });
    this.provider = new CollabProvider({
      doc: this.doc,
      awareness: this.awareness,
      link: o.link,
      fileId: o.fileId,
      readOnly: this.readOnly,
      onStatus: (s) => {
        o.onStatus?.(s);
        this.emit();
      },
      onDenied: o.onDenied,
      onFatalClose: o.onFatalClose,
      onRestart: o.onRestart ? () => void this.clearLocal().finally(() => !this.stopped && o.onRestart?.()) : undefined,
    });
    this.provider.on('synced', () => this.onSynced());
    this.awareness.on('change', () => this.emit());
  }

  get status(): CollabStatus {
    return this.provider.status;
  }
  get synced(): boolean {
    return this.provider.synced;
  }
  get clientId(): number {
    return this.doc.clientID;
  }

  /** forget this browser's copy of the file (after a restore replaced the document on the server) */
  async clearLocal(): Promise<void> {
    const p = this.persistence;
    this.persistence = null;
    try {
      if (p?.clearData) await p.clearData();
      else {
        p?.destroy();
        if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(`sdd-collab-${this.o.fileId}`);
      }
    } catch {
      /* best effort */
    }
  }

  /** `cb` runs for every change THIS user made to the doc (not for remote peers, nor for what the local copy replays) */
  onLocalChange(cb: () => void): () => void {
    const h = (_u: Uint8Array, origin: unknown) => {
      if (origin === this.provider || origin === SEED_ORIGIN || (origin !== null && origin === this.persistence)) return; // the seed is the file's own content: already stored
      if (!this.readOnly) cb();
    };
    this.doc.on('update', h);
    return () => this.doc.off('update', h);
  }

  /** `cb` runs for every change that arrived from a peer through the relay (including the merge after an offline stretch) */
  onRemoteChange(cb: () => void): () => void {
    const h = (_u: Uint8Array, origin: unknown) => {
      if (origin === this.provider && !this.readOnly) cb();
    };
    this.doc.on('update', h);
    return () => this.doc.off('update', h);
  }

  /** subscribe to status / people changes (a store or a React hook) */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const f of this.listeners) f();
  }

  collaborators(): Collaborator[] {
    return listCollaborators(this.awareness.getStates() as Map<number, RemoteState>, this.doc.clientID, this.o.user?.id ?? null);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const u = this.o.user;
    const key = u?.id ?? `anon-${this.doc.clientID}`;
    this.awareness.setLocalState({ user: { ...(u?.id ? { id: u.id } : {}), name: u?.name || 'Guest', color: colorForUser(key) }, status: 'active', lastActive: this.lastActive, cursor: null, selection: { nodes: [], edges: [] } } satisfies RemoteState);
    this.idleTimer = setInterval(() => this.updateStatus(), 5000);
    this.unsubStore = this.o.store.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges) return;
      const sel = { nodes: s.nodes.filter((n) => n.selected).map((n) => n.id), edges: s.edges.filter((e) => (e as { selected?: boolean }).selected).map((e) => e.id) };
      const k = JSON.stringify(sel);
      if (k === this.lastSel) return;
      this.lastSel = k;
      this.publish({ selection: sel });
    });
    // 1. what this browser remembers
    const factory = this.o.persistence === undefined ? defaultPersistence : this.o.persistence;
    this.persistence = factory ? factory(this.doc, `sdd-collab-${this.o.fileId}`) : null;
    if (this.persistence) await Promise.race([this.persistence.whenSynced.catch(() => undefined), new Promise((r) => setTimeout(r, IDB_WAIT_MS))]);
    if (this.stopped) return;
    if (!isDocEmpty(this.doc)) this.bind();
    // 2. the server
    this.provider.connect();
    // 3. offline-first fallback
    if (!this.bound) {
      this.seedTimer = setTimeout(() => {
        if (this.bound || this.stopped) return;
        this.bind();
        this.binding.seed();
      }, this.o.seedTimeoutMs ?? 2500);
    }
  }

  private bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.binding.start();
    this.o.setHistoryDriver?.({ undo: () => this.binding.undo(), redo: () => this.binding.redo(), checkpoint: () => this.binding.stopCapturing() });
  }

  private onSynced(): void {
    if (this.seedTimer) clearTimeout(this.seedTimer);
    this.seedTimer = null;
    if (!this.bound) {
      const empty = isDocEmpty(this.doc);
      this.bind();
      if (empty) this.binding.seed(); // the server had nothing: the very first open of this file
    }
    this.o.onSynced?.();
    this.emit();
  }

  // ---- presence ----
  private publish(patch: Partial<RemoteState>): void {
    Object.assign(this.pending, patch);
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      const p = this.pending;
      this.pending = {};
      const cur = this.awareness.getLocalState() as RemoteState | null;
      if (!cur) return;
      this.awareness.setLocalState({ ...cur, ...p });
    }, PUBLISH_MS);
  }
  setCursor(pt: Pt | null): void {
    const cur = this.awareness.getLocalState() as RemoteState | null;
    if (pt === null ? cur?.cursor === null : jsonEqualPoint(cur?.cursor, pt)) return;
    this.publish({ cursor: pt });
    this.touch();
  }
  setViewport(rect: Rect): void {
    this.publish({ viewport: rect });
  }
  /** Board facilitation state (presenting, summon, laser, reaction): whatever is in `patch` replaces that key; `undefined` clears it */
  setPresence(patch: Partial<Pick<RemoteState, 'presenting' | 'summon' | 'laser' | 'reaction'>>): void {
    this.publish(patch);
    this.touch();
  }
  setAudio(audio: NonNullable<RemoteState['audio']>): void {
    this.publish({ audio });
  }
  /** the user did something: active again */
  touch(): void {
    this.lastActive = Date.now();
    const cur = this.awareness.getLocalState() as RemoteState | null;
    if (cur && cur.status !== 'active') this.publish({ status: 'active', lastActive: this.lastActive });
  }
  private updateStatus(): void {
    const cur = this.awareness.getLocalState() as RemoteState | null;
    if (!cur) return;
    const st: PresenceStatus = presenceStatus(this.lastActive, Date.now(), typeof document === 'undefined' || document.visibilityState !== 'hidden');
    if (cur.status !== st) this.publish({ status: st, lastActive: this.lastActive });
  }

  /** the browser is back online */
  reconnectNow(): void {
    this.provider.reconnectNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.seedTimer) clearTimeout(this.seedTimer);
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.unsubStore?.();
    this.provider.destroy();
    this.binding.stop();
    this.o.setHistoryDriver?.(null);
    this.awareness.destroy();
    try {
      this.persistence?.destroy();
    } catch {
      /* ignore */
    }
    this.doc.destroy();
    this.listeners.clear();
  }
}
