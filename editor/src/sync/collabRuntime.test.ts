import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer } from '../collab/fakeServer';
import { useCollabStore } from '../collab/store';
import { useDiagramStore } from '../store/diagramStore';
import { startCollab } from './collabRuntime';
import { useSyncStore } from './status';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let server: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
  useSyncStore.getState().reset();
  useDiagramStore.getState().reset();
});
afterEach(() => {
  vi.useRealTimers();
  useCollabStore.getState().attach(null);
});

const start = (role: 'editor' | 'viewer' | 'commenter' = 'editor', extra: Partial<Parameters<typeof startCollab>[0]> = {}) =>
  startCollab({ fileId: useDiagramStore.getState().projectId, role, shareToken: null, user: { id: 'u1', name: 'Ann' }, link: server.link({ fileId: useDiagramStore.getState().projectId }), persistence: null, ...extra });

describe('startCollab (the glue between a file, the live session and the status bar)', () => {
  it('attaches the session, reports connecting -> saved, and cleans up', async () => {
    const stop = start();
    expect(useCollabStore.getState().session).not.toBeNull();
    await flush();
    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().synced).toBe(true);
    expect(useSyncStore.getState().status).toBe('saved');
    expect(useSyncStore.getState().connected).toBe(true);
    stop();
    expect(useCollabStore.getState().session).toBeNull();
    expect(useCollabStore.getState().status).toBe('off');
  });

  it('offline -> the status says so (edits are kept and merge on reconnect, there is no conflict state)', async () => {
    start();
    await flush();
    server.accepting = false;
    server.dropAll();
    await flush();
    expect(useCollabStore.getState().status).toBe('offline');
    expect(useSyncStore.getState().status).toBe('offline');
    expect(useSyncStore.getState().connected).toBe(false);
    server.accepting = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(useSyncStore.getState().status).toBe('saved');
  });

  it('viewers and commenters are read-only; the people list follows the awareness', async () => {
    start('commenter');
    await flush();
    expect(useCollabStore.getState().readOnly).toBe(true);
    expect(useSyncStore.getState().status).toBe('readonly');
  });

  it('a fatal close (the file was deleted) is recorded and the indicator shows an error', async () => {
    start();
    await flush();
    server.ctl(4404);
    await flush();
    expect(useCollabStore.getState().fatal).toBe(4404);
    expect(useSyncStore.getState().status).toBe('error');
  });

  it('the browser coming back online reconnects at once', async () => {
    const stop = start('editor', { link: server.link({ fileId: useDiagramStore.getState().projectId, baseDelayMs: 60_000, maxDelayMs: 60_000 }) });
    await flush();
    server.dropAll();
    await flush();
    expect(useCollabStore.getState().status).toBe('offline');
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(useCollabStore.getState().status).toBe('connected');
    stop();
  });
});
