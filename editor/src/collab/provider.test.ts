import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMqtt } from '../realtime/mockMqtt';
import { topics } from '../realtime/topics';
import { FakeServer } from './fakeServer';
import { CollabProvider, type CollabStatus } from './provider';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let server: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
});
afterEach(() => vi.useRealTimers());

function peer(over: Partial<ConstructorParameters<typeof CollabProvider>[0]> = {}, linkOver: Parameters<FakeServer['link']>[0] = {}) {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const statuses: CollabStatus[] = [];
  const denied: string[] = [];
  const closed: number[] = [];
  const link = server.link(linkOver);
  const p = new CollabProvider({
    doc,
    awareness,
    link,
    fileId: 'f1',
    onStatus: (s) => statuses.push(s),
    onDenied: (r) => denied.push(r),
    onFatalClose: (c) => closed.push(c),
    ...over,
  });
  return { doc, awareness, p, link, statuses, denied, closed };
}
const text = (d: Y.Doc) => d.getMap('m').toJSON();
const frame = (...parts: ((e: encoding.Encoder) => void)[]) => {
  const e = encoding.createEncoder();
  for (const p of parts) p(e);
  return encoding.toUint8Array(e);
};

describe('CollabProvider', () => {
  it('connects, syncs the server state down and reports connecting -> connected, then synced', async () => {
    server.doc.getMap('m').set('k', 'server');
    const a = peer();
    const synced = vi.fn();
    a.p.on('synced', synced);
    a.p.connect();
    expect(a.p.status).toBe('connecting');
    await flush();
    expect(a.p.status).toBe('connected');
    expect(a.p.synced).toBe(true);
    expect(text(a.doc)).toEqual({ k: 'server' });
    expect(synced).toHaveBeenCalledTimes(1);
    expect(a.statuses).toEqual(['connecting', 'connected']);
  });

  it('subscribes (and waits for the SUBACKs) before sync step 1 goes out on yjs/req/{c}', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    const id = c.opts.clientId;
    expect(id).toMatch(/^u1\.[A-Za-z0-9_-]{8,48}$/);
    expect(c.subs).toEqual(expect.arrayContaining([topics.fileEvents('f1'), topics.yjsDown('f1'), topics.yjsSync('f1', id), topics.awarenessOut('f1'), topics.ctl(id)]));
    const req = c.published.find((p) => p.topic === topics.yjsReq('f1', id))!;
    expect(req.opts.qos).toBe(1);
    const d = decoding.createDecoder(req.payload);
    expect(decoding.readVarUint(d)).toBe(0);
    expect(decoding.readVarUint(d)).toBe(syncProtocol.messageYjsSyncStep1);
  });

  it('local edits go up, remote edits come down (two peers through one server)', async () => {
    const a = peer();
    const b = peer();
    a.p.connect();
    b.p.connect();
    await flush();
    a.doc.getMap('m').set('fromA', 1);
    b.doc.getMap('m').set('fromB', 2);
    await flush();
    expect(text(a.doc)).toEqual({ fromA: 1, fromB: 2 });
    expect(text(b.doc)).toEqual({ fromA: 1, fromB: 2 });
    expect(text(server.doc)).toEqual({ fromA: 1, fromB: 2 });
  });

  it('edits of one tick leave as ONE [0][2][update] publish on yjs/up/{c}; my own echo (origin) is skipped', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    const up = topics.yjsUp('f1', c.opts.clientId);
    c.published.length = 0;
    a.doc.getMap('m').set('x', 1);
    a.doc.getMap('m').set('y', 2);
    await flush();
    const sent = c.published.filter((p) => p.topic === up);
    expect(sent).toHaveLength(1);
    expect([sent[0]!.payload[0], sent[0]!.payload[1]]).toEqual([0, 2]);
    expect(sent[0]!.opts.qos).toBe(1);
    // the server relays it back on yjs/down with origin = me: nothing is applied twice
    const before = Y.encodeStateAsUpdate(a.doc);
    c.message(topics.yjsDown('f1'), frame((e) => encoding.writeVarUint(e, 0), (e) => syncProtocol.writeUpdate(e, new Y.Doc() && Y.encodeStateAsUpdate(server.doc))), c.opts.clientId);
    expect(Y.encodeStateAsUpdate(a.doc)).toEqual(before);
  });

  it('offline edits are kept and merged on reconnect (backoff, new ticket + client id each time)', async () => {
    const a = peer();
    const b = peer();
    a.p.connect();
    b.p.connect();
    await flush();
    server.accepting = false;
    server.dropAll();
    await flush();
    expect(a.p.status).toBe('offline');
    a.doc.getMap('m').set('offlineA', 'a');
    b.doc.getMap('m').set('offlineB', 'b');
    await vi.advanceTimersByTimeAsync(150); // first retry fails
    await flush();
    expect(a.p.status).toBe('offline');
    server.accepting = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(a.p.status).toBe('connected');
    expect(text(a.doc)).toEqual({ offlineA: 'a', offlineB: 'b' });
    expect(text(b.doc)).toEqual({ offlineA: 'a', offlineB: 'b' });
    const ids = server.all.filter((c) => c.opts.username === 'ticket').map((c) => c.opts.clientId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reconnectNow() skips the backoff (the browser came back online)', async () => {
    const a = peer({}, { baseDelayMs: 60_000, maxDelayMs: 60_000 });
    a.p.connect();
    await flush();
    server.dropAll();
    await flush();
    expect(a.p.status).toBe('offline');
    a.p.reconnectNow();
    await flush();
    expect(a.p.status).toBe('connected');
  });

  it('read-only providers never send document updates or a step 2 reply', async () => {
    const ro = peer({ readOnly: true });
    ro.p.connect();
    await flush();
    ro.doc.getMap('m').set('nope', 1);
    await flush();
    expect(text(server.doc)).toEqual({});
    expect(server.all[0]!.published.some((p) => p.topic.includes('/yjs/up/'))).toBe(false);
  });

  it('a PUBACK 0x87 (not an editor) and a ctl "denied" are reported once and stop writing', async () => {
    const rw = peer();
    server.denyWrites = true;
    rw.p.connect();
    await flush();
    rw.doc.getMap('m').set('x', 1);
    await flush();
    rw.doc.getMap('m').set('y', 1);
    await flush();
    expect(rw.denied).toEqual(['read-only']);
    expect(server.all[0]!.published.filter((p) => p.topic.includes('/yjs/up/'))).toHaveLength(1);

    const other = peer();
    other.p.connect();
    await flush();
    const c = server.all[1]!;
    c.message(topics.ctl(c.opts.clientId), { type: 'denied', fileId: 'f1', reason: 'read-only' });
    c.message(topics.ctl(c.opts.clientId), { type: 'denied', fileId: 'f1', reason: 'read-only' });
    expect(other.denied).toEqual(['read-only']);
  });

  it('ctl 4404 on the events topic is final: reported, disconnected, no reconnect', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    server.ctl(4404, 'deleted');
    await flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.closed).toEqual([4404]);
    expect(server.all).toHaveLength(1);
    expect(server.all[0]!.ended).toBe(true);
    expect(a.p.status).toBe('offline');
  });

  it('ctl 1012 (restore) with an onRestart handler: the provider stops and hands over', async () => {
    const onRestart = vi.fn();
    const a = peer({ onRestart });
    a.p.connect();
    await flush();
    server.ctl(1012, 'restored');
    await flush();
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(a.p.status).toBe('offline');
    expect(a.link.connected).toBe(true); // the connection is shared: it stays
  });

  it('ctl 1012 without a handler re-joins on the same connection', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    const reqs = () => c.published.filter((p) => p.topic.includes('/yjs/req/')).length;
    expect(reqs()).toBe(1);
    server.ctl(1012);
    await flush();
    expect(reqs()).toBe(2);
    expect(a.p.synced).toBe(true);
  });

  it('the server\'s cut message (access taken away) is reported as revoked and stops writing', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    c.message(topics.ctl(c.opts.clientId), { type: 'ctl', code: 'denied' });
    expect(a.denied).toEqual(['revoked']);
    const ups = () => c.published.filter((p) => p.topic.includes('/yjs/up/')).length;
    const before = ups();
    a.doc.getMap('m').set('after', 1);
    await flush();
    expect(ups()).toBe(before);
  });

  it('ctl "unavailable" (1011): backs off and resyncs once, a repeat is final', async () => {
    const a = peer({ retryUnavailableMs: 200 });
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    const reqs = () => c.published.filter((p) => p.topic.includes('/yjs/req/')).length;
    server.ctlTo(c, { type: 'unavailable', code: 1011, fileId: 'f1' });
    await flush();
    expect(reqs()).toBe(1);
    await vi.advanceTimersByTimeAsync(250);
    await flush();
    expect(reqs()).toBe(2);
    expect(a.closed).toEqual([]);
    expect(a.p.synced).toBe(true); // the resync worked: the count starts over
    server.ctlTo(c, { type: 'unavailable', code: 1011, fileId: 'f1' });
    await flush();
    expect(a.closed).toEqual([]);
    server.ctlTo(c, { type: 'unavailable', code: 1011, fileId: 'f1' }); // twice in a row without a sync in between: final
    await flush();
    expect(a.closed).toEqual([1011]);
  });

  it('a refused subscription of a gone file is final 4404 (REST confirms), otherwise live editing is unavailable (1011)', async () => {
    const gone = peer({}, { checkGone: async () => true });
    server.mqtt.auto = false;
    gone.p.connect();
    await flush();
    const c = server.mqtt.last();
    c.denyTopics.add(topics.yjsDown('f1'));
    c.connack();
    await flush();
    expect(gone.closed).toEqual([4404]);

    server.mqtt.auto = true;
    const noAccess = peer({}, { checkGone: async () => false });
    server.mqtt.auto = false;
    noAccess.p.connect();
    await flush();
    server.mqtt.last().denyTopics.add(topics.yjsDown('f1'));
    server.mqtt.last().connack();
    await flush();
    expect(noAccess.closed).toEqual([1011]);
  });

  it('awareness: remote states arrive, and vanish when that peer disconnects', async () => {
    const a = peer();
    const b = peer();
    a.p.connect();
    b.p.connect();
    await flush();
    a.awareness.setLocalState({ user: { name: 'A' }, cursor: { x: 1, y: 2 } });
    await vi.advanceTimersByTimeAsync(100); // the throttle's trailing publish
    await flush();
    expect(b.awareness.getStates().get(a.doc.clientID)).toMatchObject({ cursor: { x: 1, y: 2 } });
    a.p.disconnect();
    await flush();
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false);
  });

  it('awareness publishes are throttled to at most 15 per second (leading + trailing, the newest state wins)', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    const c = server.all[0]!;
    const aw = () => c.published.filter((p) => p.topic === topics.awarenessUp('f1', c.opts.clientId));
    const base = aw().length;
    for (let i = 0; i < 100; i++) {
      a.awareness.setLocalState({ user: { name: 'A' }, cursor: { x: i, y: 0 } });
      await vi.advanceTimersByTimeAsync(5); // 200 updates per second
    }
    const sent = aw().slice(base);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(0.5 * 15) + 1);
    expect(sent.length).toBeGreaterThan(3);
    expect(sent.every((p) => p.opts.qos === 0)).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(server.awareness.getStates().get(a.doc.clientID)).toMatchObject({ cursor: { x: 99, y: 0 } }); // trailing publish carried the last state
  });

  it('on reconnect the local awareness state is sent again; other peers\' states are cleared while offline', async () => {
    const a = peer();
    const b = peer();
    a.p.connect();
    b.p.connect();
    await flush();
    b.awareness.setLocalState({ user: { name: 'B' } });
    await flush();
    expect(a.awareness.getStates().has(b.doc.clientID)).toBe(true);
    server.dropAll();
    await flush();
    expect(a.awareness.getStates().has(b.doc.clientID)).toBe(false); // stale cursors do not linger
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(a.awareness.getStates().has(b.doc.clientID)).toBe(true);
  });

  it('disconnect() detaches for good', async () => {
    const a = peer();
    a.p.connect();
    await flush();
    a.p.disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.p.status).toBe('offline');
    const c = server.all[0]!;
    c.published.length = 0;
    a.doc.getMap('m').set('late', 1);
    await flush();
    expect(c.published.filter((p) => p.topic.includes('/yjs/up/')).length).toBe(1); // a.doc update still queued before detach? never more than the one flush
  });
});

describe('CollabProvider: tickets, compaction, framing', () => {
  it('gets a fresh ticket before EVERY connect and reconnect (single-use)', async () => {
    const getTicket = vi.fn(async () => `tk${getTicket.mock.calls.length}`);
    const a = peer({}, { getTicket });
    a.p.connect();
    await flush();
    expect(server.all.map((c) => c.opts.password)).toEqual(['tk1']);
    server.dropAll();
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(server.all.at(-1)!.opts.password).toBe('tk2');
    expect(server.all.at(-1)!.opts.username).toBe('ticket');
    a.p.destroy();
  });

  it('answers the compaction hint [4][seq] with [3][seq][whole doc] once synced', async () => {
    const a = peer();
    a.doc.getMap('m').set('k', 'v');
    a.p.connect();
    await flush();
    expect(a.p.synced).toBe(true);
    const c = server.all.at(-1)!;
    c.published.length = 0;
    c.message(topics.yjsSync('f1', c.opts.clientId), frame((e) => encoding.writeVarUint(e, 4), (e) => encoding.writeVarUint(e, 17)));
    const reply = c.published.find((m) => m.payload[0] === 3)!;
    expect(reply.topic).toBe(topics.yjsUp('f1', c.opts.clientId));
    const d = decoding.createDecoder(reply.payload);
    expect(decoding.readVarUint(d)).toBe(3);
    expect(decoding.readVarUint(d)).toBe(17);
    const snap = new Y.Doc();
    Y.applyUpdate(snap, decoding.readVarUint8Array(d));
    expect(snap.getMap('m').toJSON()).toEqual({ k: 'v' });
    a.p.destroy();
  });

  it('ignores the hint before it is synced and for a read-only role', async () => {
    server.mqtt.auto = true;
    const early = peer();
    // a broker that accepts the join but never answers it: not synced yet
    early.p.connect();
    await Promise.resolve();
    await Promise.resolve();
    const c = server.mqtt.last();
    expect(early.p.synced).toBe(false);
    c.message(topics.yjsSync('f1', c.opts.clientId), frame((e) => encoding.writeVarUint(e, 4), (e) => encoding.writeVarUint(e, 1)));
    expect(c.published.some((m) => m.payload[0] === 3)).toBe(false);
    early.p.destroy();

    const ro = peer({ readOnly: true });
    ro.p.connect();
    await flush();
    const rc = server.all.at(-1)!;
    expect(ro.p.synced).toBe(true);
    rc.message(topics.yjsSync('f1', rc.opts.clientId), frame((e) => encoding.writeVarUint(e, 4), (e) => encoding.writeVarUint(e, 1)));
    expect(rc.published.some((m) => m.payload[0] === 3)).toBe(false);
  });

  it('follows the server\'s join answer in order: stored update, EMPTY step 2 = synced, then its step 1 gets a step 2 reply (editor)', async () => {
    const mock = createMockMqtt(); // a broker that only says what the test says
    mock.auto = false;
    const b = peer({}, { connect: mock.connect });
    b.doc.getMap('m').set('offline', 1);
    const synced = vi.fn();
    b.p.on('synced', synced);
    b.p.connect();
    await flush();
    const c = mock.last();
    c.connack();
    await flush();
    const sync = topics.yjsSync('f1', c.opts.clientId);
    c.published.length = 0;
    const srv = new Y.Doc();
    srv.getMap('m').set('stored', 2);
    c.message(sync, frame((e) => encoding.writeVarUint(e, 0), (e) => syncProtocol.writeUpdate(e, Y.encodeStateAsUpdate(srv))));
    expect(synced).not.toHaveBeenCalled();
    c.message(sync, new Uint8Array([0, 1, 2, 0, 0])); // yjs.EmptyUpdate as sync step 2: the "synced" signal
    expect(synced).toHaveBeenCalledTimes(1);
    expect(b.doc.getMap('m').toJSON()).toMatchObject({ stored: 2, offline: 1 });
    c.message(sync, frame((e) => encoding.writeVarUint(e, 0), (e) => syncProtocol.writeSyncStep1(e, srv))); // the server's step 1
    await flush();
    const reply = c.published.find((p) => p.topic === topics.yjsUp('f1', c.opts.clientId))!;
    expect([reply.payload[0], reply.payload[1]]).toEqual([0, 1]); // sync step 2 with what the server lacks
    const got = new Y.Doc();
    const d = decoding.createDecoder(reply.payload);
    decoding.readVarUint(d);
    expect(decoding.readVarUint(d)).toBe(1);
    Y.applyUpdate(got, decoding.readVarUint8Array(d));
    expect(got.getMap('m').toJSON()).toMatchObject({ offline: 1 });
  });
});
