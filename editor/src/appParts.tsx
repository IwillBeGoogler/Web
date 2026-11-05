import { useEffect, type MutableRefObject } from 'react';
import { useProjectChannel } from './sync/useProjectChannel';
import { api } from './api/api';
import { DropOverlay } from './components/DropOverlay';
import { OpenPrompts } from './components/OpenPrompts';
import { DialogHost } from './components/ui/DialogHost';
import { useFileShortcuts, useSddActions } from './hooks/useSdd';
import { isEmbedded } from './lib/host';
import { useLibrary } from './sync/library';
import { flushQueuedFiles, syncDown } from './sync/runtime';
import { flushAllTreeQueues } from './sync/treeRuntime';
import { useWorkspace } from './workspace/store';

/** pieces shared by the standalone `App` and the embedded editor (`embed.tsx`) */

export function Shell({ children }: { children: React.ReactNode }) {
  useFileShortcuts();
  const { openBytes } = useSddActions();
  // PWA file handler: double-click a .sdd in the OS to open it (Chromium launchQueue)
  useEffect(() => {
    if (isEmbedded()) return; // the host page is not a PWA window
    const lq = (window as unknown as { launchQueue?: { setConsumer: (fn: (p: { files: { getFile(): Promise<File> }[] }) => void) => void } }).launchQueue;
    lq?.setConsumer(async (params) => {
      for (const h of params.files) {
        const f = await h.getFile();
        await openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      }
    });
  }, [openBytes]);
  return (
    <>
      {children}
      {!isEmbedded() && <DropOverlay />}
      <OpenPrompts />
      <DialogHost />
    </>
  );
}

/** logged in (or AUTH_MODE=none): mirror the server's projects into the local cache and upload what was queued offline */
export function useServerMirror(ready: boolean, userId: string | undefined, openFileRef: MutableRefObject<string | null>): void {
  const bump = useLibrary((s) => s.bump);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      try {
        const d = { api, storage: localStorage, online: () => navigator.onLine !== false, now: () => Date.now() };
        await flushQueuedFiles({ ...d, exceptId: openFileRef.current ?? undefined });
        await syncDown(d);
        flushAllTreeQueues();
        useWorkspace.getState().reload(localStorage);
      } catch {
        /* offline: the cache is used as is */
      }
      if (live) bump();
    })();
    return () => {
      live = false;
    };
  }, [ready, userId, bump, openFileRef]);
}

/** Stays mounted while the user moves between files of one project: owns the project MQTT connection (tree events + who has which file open). */
export function ProjectShell({ projectId, fileId, children }: { projectId: string; fileId: string; children: React.ReactNode }) {
  useProjectChannel(projectId, fileId);
  return <>{children}</>;
}

export function ProjectMessage({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <h1>{title}</h1>
        {hint && <p className="muted">{hint}</p>}
        {action}
      </div>
    </main>
  );
}

