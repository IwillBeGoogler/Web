import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REALTIME_CONFIG } from '../realtime/config';
import { MqttLink, type LinkOptions } from '../realtime/link';
import { createMockMqtt, type MockMqtt, type MockMqttClient } from '../realtime/mockMqtt';
import { topics } from '../realtime/topics';
import { Realtime, type RealtimeEvents } from './realtime';

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

const events = (): RealtimeEvents & Record<string, ReturnType<typeof vi.fn>> =>
  ({ onConnected: vi.fn(), onPresence: vi.fn(), onUpdated: vi.fn(), onTree: vi.fn(), onStatus: vi.fn(), onReconnected: vi.fn(), onFatalClose: vi.fn() }) as never;
const mk = (over: Partial<LinkOptions> = {}) =>
  new MqttLink({ scope: 'file', fileId: 'f1', userId: '3', getTicket: async () => 'tk', config: DEFAULT_REALTIME_CONFIG, connect: mock.connect, random: () => 1, baseDelayMs: 100, ...over });
const up = async (over: Partial<LinkOptions> = {}, ev = events()) => {
  const link = mk(over);
  const rt = new Realtime({ link, ...ev });
  rt.connect();
  await flush();
  return { link, rt, ev, c: mock.last() };
};
const j = (c: MockMqttClient, topic: string, o: object, origin?: string) => c.message(topic, o, origin);

describe('Realtime: file events', () => {
  it('connects, reports the client id + status, and delivers file.updated / tree.updated (malformed ones are ignored)', async () => {
    const { c, ev, link } = await up();
    expect(ev.onStatus).toHaveBeenLastCalledWith(true);
    expect(ev.onConnected).toHaveBeenCalledWith({ clientId: link.clientId, reconnect: false });
    expect(c.subs).toEqual(expect.arrayContaining([topics.fileEvents('f1'), topics.fileRoster('f1'), topics.rtcInbox('f1', link.clientId!)]));
    j(c, topics.fileEvents('f1'), { type: 'file.updated', version: 5, by: { userId: '2', name: 'Grace' } });
    expect(ev.onUpdated).toHaveBeenCalledWith(expect.objectContaining({ version: 5 }));
    j(c, topics.fileEvents('f1'), { type: 'tree.updated', projectId: 'p', rev: 9, reason: 'folder.created' });
    expect(ev.onTree).toHaveBeenCalledWith(expect.objectContaining({ rev: 9 }));
    j(c, topics.fileEvents('f1'), { type: 'tree.updated', rev: 'nope' });
    c.message(topics.fileEvents('f1'), 'not json');
    expect(ev.onTree).toHaveBeenCalledTimes(1);
  });

  it('drops events whose origin is my own client id (echo suppression), keeps the others', async () => {
    const { c, ev, link } = await up();
    j(c, topics.fileEvents('f1'), { type: 'file.updated', version: 6 }, link.clientId!);
    expect(ev.onUpdated).not.toHaveBeenCalled();
    j(c, topics.fileEvents('f1'), { type: 'file.updated', version: 6 }, 'u9.someoneelse');
    j(c, topics.fileEvents('f1'), { type: 'file.updated', version: 7 }); // no origin
    expect(ev.onUpdated).toHaveBeenCalledTimes(2);
  });

  it('forwards every event and the audio-room inbox to onMessage, and publishes commands on rtc/up/{c}', async () => {
    const got: unknown[] = [];
    const { c, rt, link } = await up({}, { ...events(), onMessage: (m: unknown) => got.push(m) } as never);
    j(c, topics.fileEvents('f1'), { type: 'comment.created', comment: { id: 'c1' } });
    j(c, topics.rtcInbox('f1', link.clientId!), { type: 'rtc.joined', peers: [] });
    expect(got).toEqual([{ type: 'comment.created', comment: { id: 'c1' } }, { type: 'rtc.joined', peers: [] }]);
    expect(rt.send({ type: 'rtc.join' })).toBe(true);
    const sent = c.published.find((p) => p.topic === topics.rtcUp('f1', link.clientId!))!;
    expect(JSON.parse(sent.text)).toEqual({ type: 'rtc.join' });
    expect(sent.opts.qos).toBe(1);
    c.drop();
    expect(rt.send({ type: 'rtc.join' })).toBe(false); // not connected
  });

  it('roster: retained entries build the presence list, an empty payload removes that client', async () => {
    const { c, ev } = await up();
    const e1 = { clientId: 'u3.a', userId: '3', name: 'Ada', role: 'owner', fileId: 'f1' };
    const e2 = { clientId: 'u2.b', userId: '2', name: 'Grace', role: 'editor', fileId: 'f1' };
    j(c, topics.fileRoster('f1').replace('+', 'u3.a'), e1);
    j(c, topics.fileRoster('f1').replace('+', 'u2.b'), e2);
    expect(ev.onPresence).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Ada' }), expect.objectContaining({ name: 'Grace', role: 'editor' })]);
    c.message(topics.fileRoster('f1').replace('+', 'u3.a'), new Uint8Array(0));
    expect(ev.onPresence).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Grace' })]);
  });

  it('reconnects with a NEW client id, reports onStatus(false) / onReconnected, and starts the roster over', async () => {
    const { c, ev, link } = await up();
    const first = link.clientId;
    j(c, topics.fileRoster('f1').replace('+', 'u3.a'), { clientId: 'u3.a', userId: '3', name: 'Ada', role: 'owner' });
    c.drop();
    expect(ev.onStatus).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(ev.onStatus).toHaveBeenLastCalledWith(true);
    expect(ev.onReconnected).toHaveBeenCalledTimes(1);
    expect(link.clientId).not.toBe(first);
    expect(ev.onConnected).toHaveBeenLastCalledWith({ clientId: link.clientId, reconnect: true });
    j(mock.last(), topics.fileRoster('f1').replace('+', 'u2.b'), { clientId: 'u2.b', userId: '2', name: 'Grace', role: 'editor' });
    expect(ev.onPresence).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Grace' })]); // Ada's stale entry is gone
  });

  it('close() detaches the events client (no more callbacks)', async () => {
    const { c, rt, ev } = await up();
    rt.close();
    j(c, topics.fileEvents('f1'), { type: 'file.updated', version: 8 });
    expect(ev.onUpdated).not.toHaveBeenCalled();
  });
});

describe('Realtime: project events', () => {
  it('subscribes to the tree topics only (no Will, no presence) and builds the roster with fileId', async () => {
    const ev = events();
    const link = new MqttLink({ scope: 'project', projectId: 'p1', userId: '3', getTicket: async () => 'tk', config: DEFAULT_REALTIME_CONFIG, connect: mock.connect });
    const rt = new Realtime({ link, ...ev });
    rt.connect();
    await flush();
    const c = mock.last();
    expect(c.opts.will).toBeUndefined();
    expect(c.subs).toEqual([topics.projectEvents('p1'), topics.projectRoster('p1')]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.published).toEqual([]); // no presence heartbeats
    j(c, topics.projectEvents('p1'), { type: 'tree.updated', projectId: 'p1', rev: 4 });
    expect(ev.onTree).toHaveBeenCalledWith(expect.objectContaining({ rev: 4 }));
    j(c, 'dg/p/p1/roster/f9/u2.b', { clientId: 'u2.b', userId: '2', name: 'Grace', role: 'editor', fileId: 'f9', projectId: 'p1' });
    expect(ev.onPresence).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Grace', fileId: 'f9' })]);
    expect(rt.send({ type: 'rtc.join' })).toBe(false); // no audio room on the tree
  });

  it('ctl 4404 on the project is final (onFatalClose, no reconnect)', async () => {
    const { c, ev } = await up({ scope: 'project', projectId: 'p1', fileId: undefined });
    c.message(topics.projectEvents('p1'), { type: 'ctl', code: 4404, reason: 'deleted' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ev.onFatalClose).toHaveBeenCalledWith(4404);
    expect(mock.clients).toHaveLength(1);
  });
});
