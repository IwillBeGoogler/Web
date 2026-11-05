import { api as defaultApi } from '../api/api';
import { navigate } from '../lib/router';
import { liveProject } from '../workspace/tabSession';
import { Materializer, type MaterializeDeps } from './materialize';
import { withoutPrivate } from './privateSync';
import { CollabSession, type SessionOptions } from '../collab/session';
import { useCollabStore } from '../collab/store';
import type { Role } from '../lib/roles';
import { setHistoryDriver, useDiagramStore } from '../store/diagramStore';
import { toast } from '../store/toastStore';
import { MqttLink, type MqttConnectFn } from '../realtime/link';
import { useSyncStore } from './status';
import type { BindingStore } from '../collab/binding';
import type { Project } from '../types';

export interface StartCollabOptions {
  fileId: string;
  role: Role;
  shareToken: string | null;
  user: { id: string | null; name: string } | null;
  /** the file's MQTT connection, shared with the events client (the caller closes it); default: this call opens (and closes) its own */
  link?: MqttLink;
  /** tests: the mqtt.js stand-in of the link this call opens */
  connect?: MqttConnectFn;
  /** a single-use broker ticket per connect (default: the host's ticket function) */
  getTicket?: (() => Promise<string>) | null;
  /** tests */
  persistence?: SessionOptions['persistence'];
  /** the REST API used to materialize the document (tests); default the app's */
  api?: Pick<typeof defaultApi, 'getFile' | 'saveFile' | 'getShared' | 'saveShared'>;
  /** the document to materialize (default: the open tab's, minus private stickies) */
  getProject?: MaterializeDeps['getProject'];
  /** put a document the server sent into the editor (default: the store's `loadProject`; the host adds what must survive a reload, e.g. private stickies) */
  reload?: (p: Project) => void;
  materializeMs?: number;
  /** tests: the random extra wait before a peer's change is checked against the REST copy */
  materializeJitterMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/** the handle `startCollab` returns: call it to stop; `setVersion` feeds the version of the file the server holds */
export type CollabHandle = (() => void) & { setVersion: (v: number, force?: boolean) => void; materialize: () => Promise<void> };

let deletedNotice: { id: string; at: number } | null = null;
/** the file is gone (ctl 4404): say so once and go back to the list */
export function fileDeleted(fileId: string): void {
  const now = Date.now();
  if (deletedNotice && deletedNotice.id === fileId && now - deletedNotice.at < 3000) return;
  deletedNotice = { id: fileId, at: now };
  toast.error('This file was deleted.');
  navigate('/projects');
}

/**
 * Open the live (Yjs) session of the file that is open in the editor and keep the toolbar's status in step with it.
 * Used instead of the REST SyncEngine for collaborative files: merges are automatic, so there is no 412 / conflict state.
 * Returns the cleanup function.
 */
export function startCollab(o: StartCollabOptions): CollabHandle {
  const ownLink = !o.link;
  const link = o.link ?? new MqttLink({
    scope: 'file',
    fileId: o.fileId,
    userId: o.user?.id ?? null,
    shareToken: o.shareToken,
    getTicket: o.getTicket,
    connect: o.connect,
    baseDelayMs: o.baseDelayMs,
    maxDelayMs: o.maxDelayMs,
  });
  const build = (): CollabSession => new CollabSession({
    fileId: o.fileId,
    role: o.role,
    user: o.user,
    link,
    store: useDiagramStore as unknown as BindingStore,
    persistence: o.persistence,
    setHistoryDriver,
    onFatalClose: (code) => {
      useCollabStore.getState().setFatal(code);
      sync();
      if (code === 4404) fileDeleted(o.fileId);
    },
    onRestart: () => void restart(),
    onDenied: (reason) => toast.info(reason === 'revoked' ? 'Your access to this file changed. New edits will not be saved.' : 'You can look around but not edit this file.'),
  });
  let session = build();
  const sync = () => {
    const c = useCollabStore.getState();
    c.refresh();
    const now = useCollabStore.getState();
    const sync = useSyncStore.getState();
    if (now.fatal !== null) return sync.set({ status: 'error', connected: false, message: now.fatal === 4404 ? 'This file was deleted' : 'Live editing is unavailable' });
    if (now.readOnly) return sync.set({ status: 'readonly', connected: now.status === 'connected', queued: 0, message: null });
    if (now.status === 'connected') return sync.set({ status: 'saved', connected: true, queued: 0, message: null, lastSyncedAt: Date.now() });
    if (now.status === 'connecting') return sync.set({ status: now.synced ? 'saved' : 'saving', connected: false });
    sync.set({ status: 'offline', connected: false, message: 'Offline: your edits are kept and merge when you reconnect' });
  };

  // the server does not write the live document into the file row: an editor with local changes saves it (debounced PUT)
  const rest = o.api ?? defaultApi;
  const mat = new Materializer({
    debounceMs: o.materializeMs,
    jitterMs: o.materializeJitterMs,
    getProject: o.getProject ?? (() => {
      const p = liveProject(o.fileId);
      return p ? withoutPrivate(p) : null;
    }),
    save: async (data, version) => {
      const r = o.shareToken ? await rest.saveShared(o.shareToken, { data }, version, o.fileId) : await rest.saveFile(o.fileId, { data }, version);
      return typeof r.version === 'number' ? r.version : version;
    },
    peek: async () => {
      const r = o.shareToken ? await rest.getShared(o.shareToken, o.fileId) : await rest.getFile(o.fileId);
      return { version: typeof r.version === 'number' ? r.version : r.file.version, data: r.file.data };
    },
    current: async () => {
      const r = o.shareToken ? await rest.getShared(o.shareToken, o.fileId) : await rest.getFile(o.fileId);
      return typeof r.version === 'number' ? r.version : r.file.version;
    },
  });

  let unsub = () => {};
  let unsubLocal = () => {};
  const wire = () => {
    store.attach(session);
    unsub = session.subscribe(sync);
    const offLocal = session.onLocalChange(() => mat.touch());
    const offRemote = session.onRemoteChange(() => mat.touchRemote());
    unsubLocal = () => {
      offLocal();
      offRemote();
    };
    sync();
    void session.start();
  };
  const unwire = () => {
    unsub();
    unsubLocal();
    session.stop();
  };
  const store = useCollabStore.getState();
  let stopped = false;
  /**
   * The document was replaced on the server (restore): the old session's local copy is already cleared. The server has forgotten the
   * document's Yjs state too, so the first client to join seeds it from ITS editor: the editor must hold the restored document by then
   * (MQTT.md: "reload the file over REST"), or the stale content is seeded back and the restore is silently undone.
   */
  async function restart(): Promise<void> {
    mat.reset(); // the old doc's unsaved edits would overwrite the restored version
    unwire();
    try {
      const r = o.shareToken ? await rest.getShared(o.shareToken, o.fileId) : await rest.getFile(o.fileId);
      if (stopped) return;
      (o.reload ?? ((p: Project) => useDiagramStore.getState().loadProject(p)))({ ...r.file.data, id: o.fileId, name: r.file.name, updatedAt: r.file.updatedAt });
      mat.reset(typeof r.version === 'number' ? r.version : r.file.version);
    } catch {
      /* offline or refused: start from what the editor holds, as before */
    }
    if (stopped) return;
    session = build();
    wire();
  }
  const onOnline = () => session.reconnectNow();
  const onVisible = () => {
    if (document.visibilityState === 'visible') session.reconnectNow();
    else void mat.flush();
  };
  const onHide = () => void mat.flush();
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onHide);
  wire();
  const stop = () => {
    stopped = true;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onHide);
    mat.stop();
    unwire();
    if (ownLink) link.close();
    useCollabStore.getState().attach(null);
  };
  return Object.assign(stop, { setVersion: (v: number, force?: boolean) => (force ? mat.reset(v) : mat.setVersion(v)), materialize: () => mat.flush() });
}
