import { useEffect } from 'react';
import { api, setClientId } from '../api/api';
import { ApiError } from '../api/client';
import { MqttLink } from '../realtime/link';
import { useSession } from '../api/session';
import type { Role } from '../api/types';
import { conflictDialog } from '../components/sync/syncDialogs';
import { contentChanged } from '../hooks/useProjectPersistence';
import { useDiagramStore } from '../store/diagramStore';
import { toast } from '../store/toastStore';
import { getProjectSync, loadFile, projectOfFile, saveFile, syncFileMeta } from '../workspace/storage';
import { liveProject } from '../workspace/tabSession';
import { setActiveEngine } from './active';
import { SyncEngine } from './engine';
import { fileDeleted, startCollab } from './collabRuntime';
import { createRtcRuntime, setRtc, type RtcRuntime } from '../rtc/runtime';
import { useRtcStore } from '../rtc/store';
import { useCollabStore } from '../collab/store';
import { useCommentsStore, useNotificationsStore } from '../comments/store';
import type { ApiNotification } from '../api/types';
import { adoptServerFile, flushQueuedFiles } from './runtime';
import { migrateInlineAssets } from './assetMigrate';
import { getMeta } from './meta';
import { Realtime } from './realtime';
import { usePresence, useEditorSession, useSyncStore } from './status';
import { runTreeSync } from './treeRuntime';
import { queueLength } from './treeSync';
import { useLibrary } from './library';
import { canEdit } from '../lib/roles';
import { features } from '../lib/features';
import { renderThumbnailImage } from '../lib/sdd/thumbnailPng';
import { createThumbUploader } from './thumbUpload';
import { sharedPart, startPrivateSync, withMyPrivate, withoutPrivate } from './privateSync';
import { splitPrivate } from '@core/privateStickies';

export interface SyncSource {
  /** `public`: a published diagram opened read-only by anyone: no engine, no sockets, nothing saved */
  source: 'project' | 'share' | 'public';
  token?: string;
  role?: Role;
  /** share links: version of the state that was opened */
  baseVersion?: number;
}

/**
 * Connects the editor to the backend for ONE file: offline-first engine + the per-file WebSocket (presence, "updated by" notices).
 * No-op without a server or for files of local-only projects. `projectId` lets a "save as copy" conflict choice land next to the file.
 */
export function useProjectSync(fileId: string, src: SyncSource = { source: 'project' }, projectId?: string): void {
  const mode = useSession((s) => s.mode);
  const userId = useSession((s) => s.user?.id ?? null);
  const rev = useLibrary((s) => s.rev);
  void rev; // re-render after a sync so `backed` notices a file whose create just reached the server
  const backed = src.source === 'share' || !!getMeta(localStorage, fileId);
  useEffect(() => {
    const es = useEditorSession.getState();
    const sync = useSyncStore.getState();
    sync.reset();
    usePresence.getState().set([]);
    if (src.source === 'public') {
      // looks like a viewer share to the rest of the editor (never added to this browser's file list, no server controls)
      es.set({ source: 'share', role: 'viewer', shareToken: null, readOnly: true });
      return;
    }
    if (mode !== 'server') {
      es.reset();
      return;
    }
    const pid = projectId ?? projectOfFile(localStorage, fileId) ?? undefined;
    let role: Role;
    if (src.source === 'share') role = src.role ?? 'viewer';
    else {
      const meta = getMeta(localStorage, fileId);
      if (!meta) {
        // a file created in a server-backed project that has not been sent yet: send the queue now, the engine starts when the file exists remotely
        if (pid && getProjectSync(localStorage, pid) && queueLength(localStorage, pid) > 0) void runTreeSync(pid);
        es.set({ source: 'local', role: 'owner', shareToken: null, readOnly: false });
        return;
      }
      role = meta.role;
    }
    es.set({ source: src.source === 'share' ? 'share' : 'server', role, shareToken: src.token ?? null, readOnly: !canEdit(role) });

    // the project card preview: rendered here, uploaded (debounced) after edits so every device and the home page get it
    const fx = features();
    const thumbs = fx.thumbnails && src.source === 'project' && canEdit(role)
      ? createThumbUploader({
          render: async () => { const p = liveProject(fileId); return p ? renderThumbnailImage(withoutPrivate(p)) : undefined; }, // a preview shows others where my private notes are: leave them out
          upload: (bytes, type) => api.putThumbnail(fileId, new Blob([bytes as BlobPart], { type }), type as 'image/png' | 'image/webp'),
        })
      : null;
    const stopThumbs = thumbs ? useDiagramStore.subscribe((s, prev) => s.projectId === fileId && contentChanged(s, prev, { ignoreViewport: true }) && thumbs.touch()) : null;

    // private stickies: mine only, kept in my own server-side store (never in the shared document)
    const keepMine = <P extends { activePageId?: string; pages: { id: string; nodes: unknown[]; edges: unknown[] }[] }>(p: P): P => {
      const st = useDiagramStore.getState();
      return st.projectId === fileId ? withMyPrivate(p, splitPrivate(st as never).priv) : p;
    };
    const stopPrivate = fx.privateNotes && src.source === 'project' && userId && canEdit(role)
      ? startPrivateSync({
          fileId,
          api: api as never,
          storage: localStorage,
          store: {
            get: () => useDiagramStore.getState(),
            set: (p) => useDiagramStore.setState(p as never),
            subscribe: (cb) => useDiagramStore.subscribe((s, prev) => s.projectId === fileId && (s.nodes !== prev.nodes || s.edges !== prev.edges) && cb()),
          },
        })
      : null;

    // embedded: images still inline in the document move to the asset store on the first edit (one batched change)
    let migrating = false;
    const stopMigrate = src.source === 'project' && canEdit(role)
      ? useDiagramStore.subscribe((s, prev) => {
          if (migrating || s.projectId !== fileId || s.assets === prev.assets && s.nodes === prev.nodes && s.edges === prev.edges) return;
          migrating = true;
          void migrateInlineAssets(fileId).catch(() => undefined).finally(() => { migrating = false; });
        })
      : null;

    const names = new Map<string, string>();
    // Live co-editing (Yjs) replaces the REST engine for a file the server can share live: merges are automatic, so there is no
    // If-Match save, no 412 and no conflict dialog. A document that still has several pages keeps the legacy path.
    const collabOn = fx.realtime && fx.collab && useSession.getState().collab && useDiagramStore.getState().pages.length === 1;
    const me = useSession.getState().user;
    // comments: only for people with an account (they need an identity); pushes arrive on the file channel
    if (fx.comments && src.source === 'project' && me) void useCommentsStore.getState().load(fileId, pid ?? null, me.id).catch(() => undefined);
    const shareTok = src.source === 'share' ? (src.token ?? null) : null;
    // ONE MQTT connection per open file (events, roster, Yjs, awareness, audio signaling; its Will clears my presence). A share link connects as a guest.
    const link = fx.realtime
      ? new MqttLink({
          scope: 'file',
          fileId,
          userId: me?.id ?? null,
          shareToken: shareTok,
          // a refused subscription: is the file gone or off limits?
          checkGone: () => (shareTok ? api.getShared(shareTok, fileId) : api.getFile(fileId)).then(() => false, (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 403)),
        })
      : null;
    const stopCollab = collabOn && link ? startCollab({ fileId, role, shareToken: shareTok, user: me ? { id: me.id, name: me.name } : null, link, reload: (p) => useDiagramStore.getState().loadProject(keepMine(p)) }) : null;
    const engine = new SyncEngine({
      api,
      storage: localStorage,
      now: () => Date.now(),
      online: () => navigator.onLine !== false,
      // the open file's tab may already have been swapped out of the editor store when a late flush runs: read its own session
      getProject: () => liveProject(fileId) ?? loadFile(localStorage, fileId)!,
      // my private stickies are not in what the server sends: keep them
      loadProject: (p) => useDiagramStore.getState().loadProject(keepMine(p)),
      toServer: withoutPrivate,
      cacheLocal: (p) => {
        p = keepMine(p);
        saveFile(localStorage, p);
        if (pid) syncFileMeta(localStorage, pid, p);
      },
      cacheNew: (f) => void adoptServerFile(localStorage, f),
      // pan / zoom is each user's own view: it is stored locally and rides along with the next real edit, but never uploads by itself
      subscribe: (cb) => useDiagramStore.subscribe((s, prev) => s.projectId === fileId && contentChanged(sharedPart(s, prev), prev, { ignoreViewport: true }) && cb()),
      chooseConflict: conflictDialog,
      authorName: async (id) => names.get(id) ?? (id === userId ? 'you' : 'someone'),
      notify: toast,
    });
    if (!collabOn) {
      setActiveEngine(engine);
      engine.start({ id: fileId, projectId: pid, source: src.source, token: src.token, role, baseVersion: src.baseVersion });
      if (src.source === 'project') void engine.pull();
    }

    const rt = new Realtime({
      link: link ?? new MqttLink({ scope: 'file', fileId, userId: null }), // never started when realtime is off
      onFatalClose: (code) => code === 4404 && fileDeleted(fileId),
      onConnected: ({ clientId, reconnect }) => {
        setClientId(clientId); // every connection has a new client id: REST calls carry it as X-Client-Id
        useSyncStore.getState().set({ clientId });
        // no `hello` any more. The first save learns the version from REST by itself; after a reconnect `file.updated` events may have been missed
        if (reconnect && stopCollab) void (shareTok ? api.getShared(shareTok, fileId) : api.getFile(fileId)).then((r) => stopCollab.setVersion(typeof r.version === 'number' ? r.version : r.file.version), () => undefined);
      },
      onPresence: (users) => {
        for (const u of users) if (u.userId) names.set(u.userId, u.name);
        usePresence.getState().set(users);
      },
      onStatus: (connected) => !collabOn && useSyncStore.getState().set({ connected }),
      onReconnected: () => {
        rtc?.signalingReconnected();
        if (!collabOn) void engine.pull();
        if (fx.comments && src.source === 'project' && me) void useCommentsStore.getState().load(fileId, pid ?? null, me.id).catch(() => undefined);
      },
      onMessage: (m) => {
        if (m.type.startsWith('rtc.')) rtc?.handleMessage(m);
        else if (m.type.startsWith('comment.')) useCommentsStore.getState().handleMessage(m);
        else if (m.type === 'notification') useNotificationsStore.getState().push(m.notification as ApiNotification);
      },
      onUpdated: (u) => {
        const restoredByOther = u.restored === true && !(me && u.by?.userId === me.id); // my own restore (other tab too) stays quiet
        if (restoredByOther) toast.info(`${u.by?.name || 'Someone'} restored an earlier version`);
        if (collabOn) {
          // the live doc already has the content; the version is what the next materializing save needs (If-Match)
          stopCollab?.setVersion(u.version, u.restored === true);
          return;
        }
        if (u.by?.userId) names.set(u.by.userId, u.by.name ?? 'someone');
        if (u.restored === undefined && u.version <= engine.baseVersion) return;
        const who = u.by?.name ?? (u.by?.share ? 'a shared link' : 'someone');
        const sameUser = !!me && u.by?.userId === me.id; // my own other tab: reload quietly
        void engine.applyRemoteUpdate(u.version).then((r) => {
          if (r === 'applied') {
            if (!sameUser && !restoredByOther) toast.info(`Updated by ${who}`);
          }
          else if (r === 'dirty') toast.info(`${who} saved a newer version. Your next save will let you choose which to keep.`);
        });
      },
    });
    if (fx.realtime) rt.connect();
    // audio room (WebRTC mesh): signaling rides on this socket
    let rtc: RtcRuntime | null = null;
    if (fx.realtime && fx.rtc && useSession.getState().rtc && src.source === 'project' && me) {
      rtc = createRtcRuntime({
        send: (m) => rt.send(m),
        fetchConfig: () => api.rtcConfig(),
        getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
        enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
        PeerConnection: globalThis.RTCPeerConnection as never,
        AudioContext: (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as never,
        publishAudio: (a) => useCollabStore.getState().session?.setAudio(a),
      });
      setRtc(rtc);
    }

    const onOnline = () => {
      if (!collabOn) engine.onOnline();
      void flushQueuedFiles({ api, storage: localStorage, online: () => true, now: () => Date.now(), exceptId: fileId });
    };
    const onOffline = () => !collabOn && useSyncStore.getState().set({ status: engine.readOnly ? 'readonly' : 'offline' });
    const onHide = () => {
      if (!collabOn && document.visibilityState === 'hidden') void engine.flush({ keepalive: true });
    };
    const onPageHide = () => {
      rtc?.leave(); // leave the audio room when the tab closes
      link?.leave(); // and the roster (a clean DISCONNECT does not fire the Will)
      if (!collabOn) void engine.flush({ keepalive: true });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onHide);
      stopPrivate?.();
      stopThumbs?.();
      stopMigrate?.();
      thumbs?.stop();
      rtc?.dispose();
      setRtc(null);
      useRtcStore.getState().reset();
      rt.close(); // never connected when realtime is off: a no-op
      stopCollab?.();
      link?.close(); // last: the empty presence goes out before the connection ends
      useCommentsStore.getState().reset();
      setActiveEngine(null);
      setClientId(undefined);
      usePresence.getState().set([]);
      if (!collabOn) void engine.flush({ keepalive: true }).finally(() => engine.stop());
      useEditorSession.getState().reset();
    };
    // src is a fresh object per render: its fields are the real dependencies; `backed` restarts the engine once a queued create has reached the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, mode, userId, src.source, src.token, projectId, backed]);
}
