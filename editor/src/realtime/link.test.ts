import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { brokerUrl, DEFAULT_REALTIME_CONFIG, normalizeConfig } from './config';
import { MqttLink, newNonce, type LinkOptions } from './link';
import { createMockMqtt, type MockMqtt } from './mockMqtt';
import { topicMatches, topics } from './topics';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let mock: MockMqtt;
beforeEach(() => {
  vi.useFakeTimers();
  mock = createMockMqtt();
});
afterEach(() => vi.useRealTimers());

const mk = (over: Partial<LinkOptions> = {}) =>
  new MqttLink({ scope: 'file', fileId: 'f1', userId: '3', getTicket: async () => 'tk', config: DEFAULT_REALTIME_CONFIG, connect: mock.connect, random: () => 1, ...over });

describe('credentials and CONNECT options', () => {
  it('signed-in user: u<id>.<nonce>, username ticket, MQTT 5 clean start, keepalive 30, no auto reconnect, Last Will on the file presence', async () => {
    const link = mk();
    link.start();
    await flush();
    const c = mock.last();
    expect(c.opts).toMatchObject({ protocolVersion: 5, clean: true, keepalive: 30, reconnectPeriod: 0, username: 'ticket', password: 'tk' });
    expect(c.opts.clientId).toMatch(/^u3\.[A-Za-z0-9_-]{8,48}$/);
    expect(c.opts.will).toEqual({ topic: topics.presence('f1', c.opts.clientId), payload: '', qos: 1, retain: false });
    expect(c.url).toBe(`ws://${window.location.host}/mqtt`);
  });

  it('share link: g.<nonce>, username share, password = the token (even for a signed-in user); no ticket is minted', async () => {
    const getTicket = vi.fn(async () => 'never');
    const link = mk({ shareToken: 'tok-1', getTicket });
    link.start();
    await flush();
    const c = mock.last();
    expect(c.opts).toMatchObject({ username: 'share', password: 'tok-1' });
    expect(c.opts.clientId).toMatch(/^g\.[A-Za-z0-9_-]{8,48}$/);
    expect(getTicket).not.toHaveBeenCalled();
  });

  it('project connections have no Will; the broker url honours an explicit override and an absolute wsPath', async () => {
    const link = mk({ scope: 'project', projectId: 'p1', fileId: undefined, url: 'wss://edge.example/mqtt' });
    link.start();
    await flush();
    expect(mock.last().opts.will).toBeUndefined();
    expect(mock.last().url).toBe('wss://edge.example/mqtt');
    expect(brokerUrl({ wsPath: '/mqtt' }, null, { protocol: 'https:', host: 'x.io' })).toBe('wss://x.io/mqtt');
    expect(brokerUrl({ wsPath: 'wss://b.io/m' }, null, { protocol: 'http:', host: 'x.io' })).toBe('wss://b.io/m');
  });

  it('nonces are url-safe, 8-48 chars and never repeat', () => {
    const set = new Set(Array.from({ length: 50 }, newNonce));
    expect(set.size).toBe(50);
    for (const n of set) expect(n).toMatch(/^[A-Za-z0-9_-]{8,48}$/);
  });

  it('the config falls back to documented defaults for bad values', () => {
    expect(normalizeConfig({ wsPath: '/m', collab: false, presenceEveryMs: 1000, awarenessMaxPerSec: 5 })).toEqual({ wsPath: '/m', collab: false, presenceEveryMs: 1000, awarenessMaxPerSec: 5 });
    expect(normalizeConfig({ wsPath: 3, awarenessMaxPerSec: -1 })).toEqual(DEFAULT_REALTIME_CONFIG);
  });
});

describe('reconnect loop', () => {
  it('a NEW ticket and client id for every attempt (single-use tickets)', async () => {
    let n = 0;
    const link = mk({ getTicket: async () => `t${++n}`, baseDelayMs: 100 });
    link.start();
    await flush();
    mock.last().drop();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    mock.last().drop();
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(mock.clients.map((c) => c.opts.password)).toEqual(['t1', 't2', 't3']);
    expect(new Set(mock.clients.map((c) => c.opts.clientId)).size).toBe(3);
  });

  it('backoff is random(0, min(max, base * 2^attempt)) with full jitter', async () => {
    const random = vi.fn(() => 0.5);
    mock.auto = false; // every attempt fails to connect
    const link = mk({ random, baseDelayMs: 1000, maxDelayMs: 4000 });
    link.start();
    await flush();
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      mock.last().drop();
      const before = mock.clients.length;
      let waited = 0;
      while (mock.clients.length === before && waited < 10_000) {
        await vi.advanceTimersByTimeAsync(50);
        waited += 50;
      }
      delays.push(waited);
    }
    // caps 1000, 2000, 4000, 4000, 4000 -> x0.5 (+/- the 50 ms polling step)
    expect(delays.map((d) => Math.round(d / 100) * 100)).toEqual([500, 1000, 2000, 2000, 2000]);
    random.mockReturnValue(0);
    mock.last().drop();
    await flush();
    expect(mock.clients.length).toBeGreaterThan(5); // delay 0: immediately
  });

  it('the backoff starts over only after a connection stayed up 30 s', async () => {
    const link = mk({ baseDelayMs: 100, maxDelayMs: 10_000 });
    link.start();
    await flush();
    mock.last().drop(); // attempt 0 -> 100 ms
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    mock.last().drop(); // dropped right after connecting: attempt 1 -> 200 ms
    await vi.advanceTimersByTimeAsync(150);
    expect(mock.clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60);
    await flush();
    expect(mock.clients).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(31_000); // stable
    mock.last().drop();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(mock.clients).toHaveLength(4);
  });

  it('a failing ticket request backs off and retries; a 401 means the session ended (final, no connection)', async () => {
    let fail: unknown = new Error('offline');
    const getTicket = vi.fn(async () => {
      if (fail) throw fail;
      return 'ok';
    });
    const fatal = vi.fn();
    const link = mk({ getTicket });
    link.on({ onFatal: fatal });
    link.start();
    await flush();
    expect(mock.clients).toHaveLength(0);
    fail = null;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(mock.clients).toHaveLength(1);
    expect(mock.last().opts.password).toBe('ok');

    const link2 = mk({ getTicket: async () => { throw new ApiError(401, 'UNAUTHENTICATED', 'no'); } });
    link2.on({ onFatal: fatal });
    link2.start();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fatal).toHaveBeenCalledWith(401);
    expect(mock.clients).toHaveLength(1);
  });

  it('a refused login (CONNACK 0x86/0x87) fetches a new ticket once; refused twice = signed out', async () => {
    mock.auto = false;
    const fatal = vi.fn();
    let n = 0;
    const link = mk({ getTicket: async () => `t${++n}` });
    link.on({ onFatal: fatal });
    link.start();
    await flush();
    mock.last().refuse(135);
    await flush();
    expect(mock.clients).toHaveLength(2); // immediately, with a fresh ticket
    expect(mock.last().opts.password).toBe('t2');
    mock.last().refuse(134);
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fatal).toHaveBeenCalledWith(401);
    expect(mock.clients).toHaveLength(2);
  });

  it('a refused file subscription is confirmed over REST: gone -> final 4404', async () => {
    mock.auto = false;
    const fatal = vi.fn();
    const link = mk({ checkGone: async () => true });
    link.on({ onFatal: fatal });
    link.start();
    await flush();
    mock.last().denyTopics.add(topics.fileEvents('f1'));
    mock.last().connack();
    await flush();
    expect(fatal).toHaveBeenCalledWith(4404);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mock.clients).toHaveLength(1);
  });

  it('reconnectNow() skips the wait; close() stops everything', async () => {
    const link = mk({ baseDelayMs: 60_000, maxDelayMs: 60_000 });
    link.start();
    await flush();
    mock.last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.clients).toHaveLength(1);
    link.reconnectNow();
    await flush();
    expect(mock.clients).toHaveLength(2);
    link.close();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mock.clients).toHaveLength(2);
    expect(link.connected).toBe(false);
  });
});

describe('presence', () => {
  it('publishes presence right after connecting and every presenceEveryMs, QoS 0; leave() / close() publish it empty with QoS 1', async () => {
    const link = mk();
    link.start();
    await flush();
    const c = mock.last();
    const topic = topics.presence('f1', c.opts.clientId);
    const sent = () => c.published.filter((p) => p.topic === topic);
    expect(sent()).toHaveLength(1);
    expect(sent()[0]!.opts.qos).toBe(0);
    expect(sent()[0]!.text).not.toBe('');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sent()).toHaveLength(2);
    link.leave();
    expect(sent().at(-1)).toMatchObject({ text: '', opts: { qos: 1 } });
    link.close();
    expect(sent().at(-1)).toMatchObject({ text: '', opts: { qos: 1 } });
    expect(c.ended).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sent().length).toBe(4);
  });

  it('presence is published again after every reconnect (new client id topic)', async () => {
    const link = mk({ baseDelayMs: 10 });
    link.start();
    await flush();
    mock.last().drop();
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    const c = mock.last();
    expect(c.published.some((p) => p.topic === topics.presence('f1', c.opts.clientId))).toBe(true);
  });
});

describe('topics', () => {
  it('matches MQTT filters', () => {
    expect(topicMatches('dg/f/+/events', 'dg/f/x/events')).toBe(true);
    expect(topicMatches('dg/p/p1/roster/+/+', 'dg/p/p1/roster/f/c')).toBe(true);
    expect(topicMatches('dg/p/p1/roster/+/+', 'dg/p/p1/roster/f')).toBe(false);
    expect(topicMatches('dg/#', 'dg/a/b')).toBe(true);
  });
});
