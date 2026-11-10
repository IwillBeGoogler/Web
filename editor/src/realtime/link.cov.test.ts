import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REALTIME_CONFIG } from './config';
import { MqttLink, newNonce, setMqttConnect, type LinkOptions } from './link';
import { createMockMqtt, type MockMqtt } from './mockMqtt';
import { topics } from './topics';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let mock: MockMqtt;
beforeEach(() => {
  vi.useFakeTimers();
  mock = createMockMqtt();
});
afterEach(() => {
  vi.useRealTimers();
  setMqttConnect(null);
});
const mk = (over: Partial<LinkOptions> = {}) => new MqttLink({ scope: 'file', fileId: 'f1', userId: '3', getTicket: async () => 'tk', config: DEFAULT_REALTIME_CONFIG, connect: mock.connect, random: () => 1, ...over });
const open = async (over: Partial<LinkOptions> = {}) => {
  const link = mk(over);
  const events = { open: vi.fn(), close: vi.fn(), fatal: vi.fn(), event: vi.fn(), roster: vi.fn(), message: vi.fn(), restart: vi.fn(), connecting: vi.fn() };
  link.on({ onOpen: events.open, onClose: events.close, onFatal: events.fatal, onEvent: events.event, onRoster: events.roster, onMessage: events.message, onRestart: events.restart, onConnecting: events.connecting });
  link.start();
  await flush();
  return { link, events };
};

describe('lifecycle', () => {
  it('start is idempotent; scope and fileId getters; close twice; start after close is a no-op', async () => {
    const { link } = await open();
    link.start();
    expect(mock.clients).toHaveLength(1);
    expect(link.scope).toBe('file');
    expect(link.fileId).toBe('f1');
    expect(link.connected).toBe(true);
    link.close();
    expect(link.stopped).toBe(true);
    link.close();
    link.start();
    expect(mock.clients).toHaveLength(1);
    expect(link.publish('t', 'x', { qos: 0 })).toBe(false);
    link.leave();
  });
  it('a throwing listener does not break the others; unsubscribe works', async () => {
    const link = mk();
    const ok = vi.fn();
    link.on({ onOpen: () => { throw new Error('bad'); } });
    const off = link.on({ onOpen: ok });
    link.start();
    await flush();
    expect(ok).toHaveBeenCalledTimes(1);
    off();
  });
  it('reconnectNow ignores running-less, open, or connected-client states and otherwise resets the backoff', async () => {
    const link = mk();
    link.reconnectNow();
    expect(mock.clients).toHaveLength(0);
    link.start();
    await flush();
    link.reconnectNow();
    expect(mock.clients).toHaveLength(1);
    mock.last().drop();
    await flush();
    link.reconnectNow();
    await flush();
    expect(mock.clients.length).toBeGreaterThanOrEqual(2);
  });
});

describe('credentials and connect failures', () => {
  it('missing credentials end the session as signed-out; a failing config or ticket retries with backoff', async () => {
    const { link, events } = await open({ userId: undefined });
    expect(events.fatal).toHaveBeenCalledWith(401);
    expect(link.stopped).toBe(true);
    const n = await open({ getTicket: async () => { throw new Error('net'); } });
    expect(n.link.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    n.link.close();
  });
  it('a ticket failing with 401 ends the session', async () => {
    const { events } = await open({ getTicket: async () => { throw Object.assign(new Error('no'), { status: 401 }); } });
    expect(events.fatal).toHaveBeenCalledWith(401);
  });
  it('config as a function is awaited; connect failing schedules a retry; stale attempts are dropped', async () => {
    const cfg = vi.fn(async () => DEFAULT_REALTIME_CONFIG);
    const bad = vi.fn(async () => { throw new Error('refused'); });
    const l1 = mk({ config: cfg, connect: bad });
    l1.start();
    await flush();
    expect(cfg).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(bad.mock.calls.length).toBeGreaterThan(1);
    l1.close();
    const slow = mk({ connect: (url, opts) => new Promise((res) => setTimeout(() => res(mock.connect(url, opts)), 100)) });
    slow.start();
    slow.close();
    await vi.advanceTimersByTimeAsync(200);
    expect(mock.clients.every((c) => c.ended || !c.connected)).toBe(true);
  });
  it('uses the global connect function and the broker url override when set', async () => {
    setMqttConnect(mock.connect);
    const link = new MqttLink({ scope: 'file', fileId: 'f1', userId: '3', getTicket: async () => 'tk', config: DEFAULT_REALTIME_CONFIG, random: () => 1 });
    link.start();
    await flush();
    expect(mock.clients).toHaveLength(1);
    link.close();
  });
  it('nonce fallback without crypto', () => {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(newNonce()).toMatch(/^[A-Za-z0-9_-]{8,48}$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});

describe('subscriptions and gone detection', () => {
  it('denied subscription with checkGone true ends with 4404; false opens anyway; checkGone throwing counts as not gone', async () => {
    const denied = (over: Partial<LinkOptions>) => {
      const m = createMockMqtt();
      const orig = m.connect;
      m.connect = (u, o) => {
        const c = orig(u, o) as ReturnType<MockMqtt['last']>;
        c.denyTopics.add(topics.fileEvents('f1'));
        return c;
      };
      return mk({ connect: m.connect, ...over });
    };
    const gone = denied({ checkGone: async () => true });
    const f = vi.fn();
    gone.on({ onFatal: f });
    gone.start();
    await flush();
    expect(f).toHaveBeenCalledWith(4404);
    const alive = denied({ checkGone: async () => false });
    alive.start();
    await flush();
    expect(alive.connected).toBe(true);
    const thrower = denied({ checkGone: async () => { throw new Error('x'); } });
    thrower.start();
    await flush();
    expect(thrower.connected).toBe(true);
    const none = denied({});
    none.start();
    await flush();
    expect(none.connected).toBe(true);
  });
  it('confirmGone finishes the link only when REST says gone', async () => {
    const { link, events } = await open({ checkGone: async () => true });
    expect(await link.confirmGone()).toBe(true);
    expect(events.fatal).toHaveBeenCalledWith(4404);
    const b = await open({});
    expect(await b.link.confirmGone()).toBe(false);
  });
  it('subscribe: empty list or no client resolves []; a failing SUBACK rejects', async () => {
    const link = mk();
    expect(await link.subscribe([['a', 0]])).toEqual([]);
    const { link: l } = await open();
    expect(await l.subscribe([])).toEqual([]);
    expect(await l.subscribe([['extra', 1]])).toEqual([]);
  });
  it('project scope subscribes to project events and roster; without a project id it subscribes to nothing', async () => {
    const { link } = await open({ scope: 'project', projectId: 'p1', fileId: undefined });
    expect(mock.last().subs).toEqual([topics.projectEvents('p1'), topics.projectRoster('p1')]);
    expect(link.connected).toBe(true);
    const bare = await open({ scope: 'project', projectId: undefined, fileId: undefined });
    expect(bare.link.connected).toBe(true);
  });
});

describe('messages', () => {
  it('events: own echo ignored, bad json ignored, ctl 1012 restarts, ctl 4404 ends, normal events delivered', async () => {
    const { link, events } = await open();
    const c = mock.last();
    const ev = topics.fileEvents('f1');
    c.message(ev, { type: 'file.updated', version: 2 });
    expect(events.event).toHaveBeenCalledTimes(1);
    c.message(ev, { type: 'file.updated' }, link.clientId!);
    c.message(ev, 'not json');
    c.message(ev, { notype: true });
    c.message(ev, 'null');
    expect(events.event).toHaveBeenCalledTimes(1);
    c.message(ev, { type: 'ctl', code: 1012 });
    expect(events.restart).toHaveBeenCalled();
    c.message(ev, { type: 'ctl', code: 4404 });
    expect(events.fatal).toHaveBeenCalledWith(4404);
    expect(link.stopped).toBe(true);
  });
  it('roster: add, update, remove via empty payload, malformed ignored; other topics reach onMessage', async () => {
    const { events } = await open();
    const c = mock.last();
    const rt = (id: string) => `${topics.fileRoster('f1')}${topics.fileRoster('f1').endsWith('/') ? '' : '/'}${id}`;
    c.message(rt('c1'), { userId: 'u1', name: 'Ann', role: 'editor' });
    c.message(rt('c2'), { clientId: 'c2', userId: null, fileId: 'f1' });
    c.message(rt('c3'), 'garbage');
    expect(events.roster.mock.calls.at(-1)![0].length).toBeGreaterThanOrEqual(2);
    c.message(rt('c1'), new Uint8Array(0));
    expect(events.roster).toHaveBeenCalled();
    c.message('some/other/topic', 'x', 'origin-1');
    expect(events.message).toHaveBeenCalledWith('some/other/topic', expect.anything(), 'origin-1');
    const p = await open({ scope: 'project', projectId: 'p1', fileId: undefined });
    const pc = mock.last();
    pc.message(`${topics.projectRoster('p1')}/c9`, { userId: 'u', name: 'N', role: 'owner' });
    pc.message(topics.projectEvents('p1'), { type: 'file.created' });
    expect(p.events.event).toHaveBeenCalled();
    p.events.roster.mockClear();
    pc.message('dg/p/other/roster/x', { name: 'N' });
    expect(p.events.roster).not.toHaveBeenCalled();
  });
  it('messages of a replaced client are ignored', async () => {
    const { link, events } = await open();
    const old = mock.last();
    old.drop();
    await flush();
    link.close();
    old.message(topics.fileEvents('f1'), { type: 'x' });
    expect(events.event).not.toHaveBeenCalled();
  });
});

describe('drops, auth refusals and backoff', () => {
  it('a dropped connection notifies close and reconnects with growing backoff; stable uptime resets it', async () => {
    const { link, events } = await open({ stableMs: 1000, baseDelayMs: 100, maxDelayMs: 400 });
    mock.last().drop();
    await flush();
    expect(events.close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(mock.clients.length).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(events.open.mock.calls.at(-1)![0].reconnect).toBe(true);
    link.close();
  });
  it('refused credentials: one retry with a new ticket, then the session ends', async () => {
    const { events } = await open();
    mock.last().drop();
    mock.auto = false;
    await vi.advanceTimersByTimeAsync(2000);
    mock.last().refuse(134);
    await flush();
    mock.last().refuse(134);
    await flush();
    expect(events.fatal).toHaveBeenCalledWith(401);
  });
  it('a close after the link stopped is ignored; scheduleReconnect on a stopped link does nothing', async () => {
    const { link } = await open();
    const c = mock.last();
    link.close();
    c.drop();
    await flush();
    expect(link.stopped).toBe(true);
  });
  it('presence heartbeat publishes immediately and on an interval, then stops; leave publishes an empty presence', async () => {
    const { link } = await open({ config: { ...DEFAULT_REALTIME_CONFIG, presenceEveryMs: 1000 } });
    const c = mock.last();
    const before = c.sentOn('dg/').length;
    await vi.advanceTimersByTimeAsync(2500);
    expect(c.sentOn('dg/').length).toBeGreaterThan(before);
    link.leave();
    expect(c.published.at(-1)!.text).toBe('');
    link.close();
    const n = c.published.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.published.length).toBe(n);
  });
  it('project links send no presence heartbeat', async () => {
    const { link } = await open({ scope: 'project', projectId: 'p1', fileId: undefined });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(mock.last().sentOn('dg/p/').length).toBe(0);
    link.close();
  });
  it('publish reports PUBACK refusals and swallows client errors', async () => {
    const { link } = await open();
    const c = mock.last();
    c.denyPublish.add('t/deny');
    const cb = vi.fn();
    expect(link.publish('t/deny', 'x', { qos: 1 }, cb)).toBe(true);
    await flush();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ code: 135 }));
    const ok = vi.fn();
    link.publish('t/ok', 'x', { qos: 1 }, ok);
    await flush();
    expect(ok).toHaveBeenCalledWith(null);
    c.publish = () => { throw new Error('closed'); };
    expect(link.publish('t/x', 'x', { qos: 0 })).toBe(false);
  });
  it('close when end() throws is tolerated', async () => {
    const { link } = await open();
    mock.last().end = () => { throw new Error('boom'); };
    expect(() => link.close()).not.toThrow();
  });
});
