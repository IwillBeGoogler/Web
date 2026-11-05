import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer } from '../collab/fakeServer';
import { useCollabStore } from '../collab/store';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { ApiError } from '../api/client';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../lib/router', async (orig) => ({ ...(await orig<typeof import('../lib/router')>()), navigate }));

import { startCollab } from './collabRuntime';
import { useSyncStore } from './status';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let server: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
  navigate.mockClear();
  useToastStore.setState({ toasts: [] } as never);
  useSyncStore.getState().reset();
  useDiagramStore.getState().reset();
});
afterEach(() => {
  vi.useRealTimers();
  useCollabStore.getState().attach(null);
});

const fakeApi = () => ({
  getFile: vi.fn(async () => ({ file: { version: 9 }, version: 9 })),
  saveFile: vi.fn(async (_id: string, _b: unknown, v: number) => ({ file: { version: v + 1 }, version: v + 1 })),
  getShared: vi.fn(async () => ({ file: { version: 9 }, version: 9 })),
  saveShared: vi.fn(async (_t: string, _b: unknown, v: number) => ({ file: { version: v + 1 }, version: v + 1 })),
});
const start = (extra: Record<string, unknown> = {}) => {
  const api = fakeApi();
  const fileId = useDiagramStore.getState().projectId;
  const link = server.link({ fileId, userId: 'u1', shareToken: (extra.shareToken as string | undefined) ?? null });
  const inner = startCollab({
    fileId,
    role: 'editor',
    shareToken: null,
    user: { id: 'u1', name: 'Ann' },
    link,
    persistence: null,
    api: api as never,
    getProject: () => ({ id: 'doc' }) as never,
    ...extra,
  });
  const stop = Object.assign(() => { inner(); link.close(); }, { setVersion: inner.setVersion, materialize: inner.materialize });
  return { api, stop, link };
};
const edit = () => useDiagramStore.getState().addNode?.({ id: `n${Math.random()}`, type: 'note', position: { x: 0, y: 0 }, data: {} } as never);

describe('startCollab: tickets', () => {
  it('connects with a fresh ticket on every connect / reconnect', async () => {
    const { stop } = start();
    await flush();
    server.dropAll();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(server.all.map((c) => [c.opts.username, c.opts.password])).toEqual([['ticket', 't1'], ['ticket', 't2']]);
    expect(new Set(server.all.map((c) => c.opts.clientId)).size).toBe(2); // and a new client id
    stop();
  });

  it('startCollab without a shared link opens (and closes) its own with the host ticket function', async () => {
    const getTicket = vi.fn(async () => 'own-ticket');
    const stop = startCollab({ fileId: useDiagramStore.getState().projectId, role: 'editor', shareToken: null, user: { id: '7', name: 'Ann' }, connect: server.connect, getTicket, persistence: null });
    await flush();
    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(server.all[0]!.opts.clientId).toMatch(/^u7\./);
    expect(useCollabStore.getState().status).toBe('connected');
    stop();
    expect(server.all[0]!.ended).toBe(true);
  });

  it('a share-link holder connects as a guest: g.<nonce>, username share, the token', async () => {
    const { stop } = start({ shareToken: 'tok' });
    await flush();
    expect(server.all[0]!.opts).toMatchObject({ username: 'share', password: 'tok' });
    expect(server.all[0]!.opts.clientId).toMatch(/^g\.[A-Za-z0-9_-]{8,48}$/);
    stop();
  });
});

describe('startCollab: materialization', () => {
  it('a local edit is saved (debounced) with If-Match = the version from hello; nothing without one', async () => {
    const { api, stop } = start();
    stop.setVersion(4); // hello.version
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveFile).not.toHaveBeenCalled(); // joining and receiving the server doc is not a local change

    edit();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(api.saveFile).toHaveBeenCalledTimes(1);
    expect(api.saveFile.mock.calls[0]![2]).toBe(4);
    stop();
  });

  it('a remote peer edit: after a jittered wait this client saves only when the REST copy differs', async () => {
    const { api, stop } = start({ materializeJitterMs: 0 });
    stop.setVersion(1);
    await flush();
    server.doc.getMap('nodes').set('x', 'remote');
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getFile).toHaveBeenCalled(); // the check
    expect(api.saveFile).toHaveBeenCalledTimes(1); // the fake REST copy has no data: it differs from the document
    expect(api.saveFile.mock.calls[0]![2]).toBe(9); // at the version the check saw
    stop();
  });

  it('a remote peer edit does not make this client save when the REST copy already holds the document', async () => {
    const api = fakeApi();
    api.getFile.mockResolvedValue({ file: { version: 9, data: { id: 'doc' } }, version: 9 } as never);
    const fileId = useDiagramStore.getState().projectId;
    const link = server.link({ fileId, userId: 'u1', shareToken: null });
    const stop = startCollab({ fileId, role: 'editor', shareToken: null, user: { id: 'u1', name: 'Ann' }, link, persistence: null, api: api as never, getProject: () => ({ id: 'doc' }) as never, materializeJitterMs: 0 });
    await flush();
    server.doc.getMap('nodes').set('x', 'remote');
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveFile).not.toHaveBeenCalled();
    stop();
    link.close();
  });

  it('412: refetches the version and saves again', async () => {
    const { api, stop } = start();
    api.saveFile.mockRejectedValueOnce(new ApiError(412, 'VERSION_CONFLICT', 'stale'));
    stop.setVersion(2);
    await flush();
    edit();
    await vi.advanceTimersByTimeAsync(3000); // the retry waits a second after the 412
    expect(api.getFile).toHaveBeenCalledTimes(1);
    expect(api.saveFile.mock.calls.map((c) => c[2])).toEqual([2, 9]);
    stop();
  });

  it('a share-link editor saves through the share route', async () => {
    const { api, stop } = start({ shareToken: 'tok' });
    stop.setVersion(2);
    await flush();
    edit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveShared).toHaveBeenCalledTimes(1);
    expect(api.saveFile).not.toHaveBeenCalled();
    stop();
  });

  it('a viewer never saves', async () => {
    const { api, stop } = start({ role: 'viewer' });
    stop.setVersion(2);
    await flush();
    edit();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveFile).not.toHaveBeenCalled();
    stop();
  });
});

describe('startCollab: close codes', () => {
  it('1012 (restore): clears the local copy and starts a fresh session instead of merging the old doc back', async () => {
    const clear = vi.fn();
    let made = 0;
    const persistence = vi.fn(() => {
      made++;
      return { whenSynced: Promise.resolve(), destroy: vi.fn(), clearData: clear };
    });
    const { stop } = start({ persistence });
    await flush();
    const first = useCollabStore.getState().session;
    expect(made).toBe(1);
    server.ctl(1012, 'restored');
    await flush();
    await flush();
    expect(clear).toHaveBeenCalledTimes(1);
    const second = useCollabStore.getState().session;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(made).toBe(2);
    expect(useCollabStore.getState().status).toBe('connected');
    expect(useCollabStore.getState().fatal).toBeNull();
    stop();
  });

  it('1012 (restore): the editor takes the restored document over REST BEFORE the fresh session seeds the (now empty) server doc', async () => {
    const order: string[] = [];
    const reload = vi.fn((p: { id: string }) => void order.push(`reload ${p.id}`));
    const restored = { file: { version: 7, name: 'Restored name', updatedAt: 5, data: { version: 2, pages: [{ id: 'p', name: 'P', nodes: [], edges: [] }], activePageId: 'p' } }, version: 7 };
    const { api, stop } = start({ reload, persistence: vi.fn(() => ({ whenSynced: Promise.resolve(), destroy: vi.fn(), clearData: vi.fn() })) });
    api.getFile.mockResolvedValue(restored as never);
    await flush();
    const first = useCollabStore.getState().session;
    server.ctl(1012, 'restored');
    await flush();
    await flush();
    const second = useCollabStore.getState().session;
    expect(second).not.toBe(first);
    expect(api.getFile).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls[0][0]).toMatchObject({ name: 'Restored name', activePageId: 'p' });
    stop();
  });

  it('4404 is final: toast once and navigate back to the list', async () => {
    const { stop } = start();
    await flush();
    server.ctl(4404, 'deleted');
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.all).toHaveLength(1); // no reconnect
    expect(navigate).toHaveBeenCalledWith('/projects');
    expect(useToastStore.getState().toasts.filter((t) => /deleted/.test(t.message))).toHaveLength(1);
    stop();
  });
});
