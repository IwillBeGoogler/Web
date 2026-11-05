import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshRtcProvider } from './mesh';
import type { PeerConnectionLike, RtcPeerInfo, RtcPeerState, SignalMessage } from './provider';

// ---- fakes ----
class FakeTrack {
  enabled = true;
  kind = 'audio';
  stopped = false;
  stop() {
    this.stopped = true;
  }
}
class FakeStream {
  constructor(public tracks: FakeTrack[] = [new FakeTrack()]) {}
  getAudioTracks() {
    return this.tracks;
  }
  getTracks() {
    return this.tracks;
  }
}
class FakePC implements PeerConnectionLike {
  static all: FakePC[] = [];
  connectionState = 'new';
  signalingState = 'stable';
  remoteDescription: unknown = null;
  localDescription: unknown = null;
  onicecandidate: PeerConnectionLike['onicecandidate'] = null;
  ontrack: PeerConnectionLike['ontrack'] = null;
  onconnectionstatechange: (() => void) | null = null;
  added: unknown[] = [];
  ice: unknown[] = [];
  closed = false;
  offers: ({ iceRestart?: boolean } | undefined)[] = [];
  senders = [{ track: null as unknown as MediaStreamTrack | null, replaceTrack: vi.fn(async (t: MediaStreamTrack | null) => void (this.senders[0].track = t)) }];
  constructor(public cfg: unknown) {
    FakePC.all.push(this);
  }
  addTrack(t: MediaStreamTrack) {
    this.added.push(t);
    this.senders[0].track = t;
    return {};
  }
  getSenders() {
    return this.senders;
  }
  async createOffer(o?: { iceRestart?: boolean }) {
    this.offers.push(o);
    return { type: 'offer', sdp: `offer${o?.iceRestart ? '-restart' : ''}` };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d: unknown) {
    this.localDescription = d;
    this.maybeConnect();
  }
  async setRemoteDescription(d: unknown) {
    this.remoteDescription = d;
    this.maybeConnect();
  }
  async addIceCandidate(c: unknown) {
    this.ice.push(c);
  }
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
  setState(s: string) {
    this.connectionState = s;
    this.onconnectionstatechange?.();
  }
  private maybeConnect() {
    if (this.localDescription && this.remoteDescription && this.connectionState === 'new') queueMicrotask(() => this.setState('connected'));
  }
}

/** a stand-in for server/src/services/rtc.ts: rooms, routing, and the real routing rules */
class FakeServer {
  members = new Map<string, MeshRtcProvider>();
  infos = new Map<string, RtcPeerInfo>();
  log: SignalMessage[] = [];
  max = 3;
  signaling(id: string) {
    return {
      send: (m: SignalMessage) => {
        this.log.push({ ...m, __from: id });
        this.route(id, m);
        return true;
      },
    };
  }
  private deliver(to: string, m: SignalMessage) {
    queueMicrotask(() => this.members.get(to)?.handleMessage(m));
  }
  private route(id: string, m: SignalMessage) {
    const self = this.providers.get(id)!;
    if (m.type === 'rtc.join') {
      if (this.members.has(id)) return;
      if (this.members.size >= this.max) return this.providerMsg(id, { type: 'rtc.full', max: this.max });
      const others = [...this.members.keys()].map((k) => this.infos.get(k)!);
      this.members.set(id, self);
      this.providerMsg(id, { type: 'rtc.joined', peers: others });
      for (const o of others) this.deliver(o.clientId, { type: 'rtc.peer-joined', peer: this.infos.get(id) });
    } else if (m.type === 'rtc.leave') this.remove(id);
    else if (m.type === 'rtc.signal') {
      if (!this.members.has(id) || !this.members.has(m.to as string)) return;
      this.deliver(m.to as string, { type: 'rtc.signal', from: id, kind: m.kind, data: m.data });
    } else if (m.type === 'rtc.state') for (const k of this.members.keys()) if (k !== id) this.deliver(k, { type: 'rtc.state', from: id, muted: m.muted, speaking: m.speaking });
  }
  providers = new Map<string, MeshRtcProvider>();
  private providerMsg(id: string, m: SignalMessage) {
    queueMicrotask(() => this.providers.get(id)?.handleMessage(m));
  }
  remove(id: string) {
    if (!this.members.delete(id)) return;
    for (const k of this.members.keys()) this.deliver(k, { type: 'rtc.peer-left', clientId: id });
  }
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let server: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  FakePC.all = [];
  server = new FakeServer();
});
afterEach(() => vi.useRealTimers());

function peer(id: string, over: Partial<ConstructorParameters<typeof MeshRtcProvider>[0]> = {}) {
  const events = { states: [] as [string, RtcPeerState][], streams: [] as string[], gone: [] as string[], errors: [] as string[], errorMessages: [] as string[], flags: [] as [string, { muted: boolean; speaking: boolean }][], peers: [] as RtcPeerInfo[][] };
  const info: RtcPeerInfo = { clientId: id, userId: `u_${id}`, name: id.toUpperCase() };
  server.infos.set(id, info);
  const p = new MeshRtcProvider({
    signaling: server.signaling(id),
    PeerConnection: FakePC as never,
    iceServers: [{ urls: ['stun:s'] }],
    disconnectedGraceMs: 1000,
    onPeerState: (pi, s) => events.states.push([pi.clientId, s]),
    onRemoteStream: (pi) => events.streams.push(pi.clientId),
    onPeerGone: (cid) => events.gone.push(cid),
    onError: (code, msg) => { events.errors.push(code); events.errorMessages.push(msg); },
    onPeerFlags: (cid, f) => events.flags.push([cid, f]),
    onPeers: (ps) => events.peers.push(ps),
    ...over,
  });
  server.providers.set(id, p);
  return { p, events, stream: new FakeStream() };
}
const join = (x: ReturnType<typeof peer>) => x.p.join(x.stream as never);

describe('MeshRtcProvider', () => {
  it('two peers: the joiner offers, the other answers, ICE flows, both reach connected', async () => {
    const a = peer('a');
    const b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    expect(FakePC.all).toHaveLength(2); // one connection each
    const [pa, pb] = FakePC.all;
    expect(pa.cfg).toEqual({ iceServers: [{ urls: ['stun:s'] }] });
    expect(pb.added).toHaveLength(1); // my microphone track is sent
    expect(pa.connectionState).toBe('connected');
    expect(pb.connectionState).toBe('connected');
    const kinds = server.log.filter((m) => m.type === 'rtc.signal').map((m) => `${m.__from}:${m.kind}`);
    expect(kinds).toEqual(['b:offer', 'a:answer']); // b joined later, so b offered
    expect(a.events.states.at(-1)).toEqual(['b', 'connected']);
    expect(b.events.states.at(-1)).toEqual(['a', 'connected']);
  });

  it('ICE candidates that arrive before the offer are held and applied after it', async () => {
    const a = peer('a');
    const b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    // an early candidate for a connection that has no remote description yet
    const pa = FakePC.all[1]; // a's connection (b's was created first: the joiner offers)
    pa.remoteDescription = null;
    a.p.handleMessage({ type: 'rtc.signal', from: 'b', kind: 'ice', data: { candidate: { c: 1 } } });
    await flush();
    expect(pa.ice).toEqual([]);
    a.p.handleMessage({ type: 'rtc.signal', from: 'b', kind: 'offer', data: { type: 'offer', sdp: 'again' } });
    await flush();
    expect(pa.ice).toEqual([{ c: 1 }]);
  });

  it('local candidates are sent to the right peer', async () => {
    const a = peer('a');
    const b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    FakePC.all[0].onicecandidate?.({ candidate: { c: 'x' } });
    FakePC.all[0].onicecandidate?.({ candidate: null }); // end of candidates is not sent
    const ice = server.log.filter((m) => m.type === 'rtc.signal' && m.kind === 'ice');
    expect(ice).toHaveLength(1);
    expect(ice[0]).toMatchObject({ to: 'a', __from: 'b', data: { candidate: { c: 'x' } } });
  });

  it('three peers form a full mesh (3 links); a remote stream is reported per peer', async () => {
    const a = peer('a'), b = peer('b'), c = peer('c');
    for (const x of [a, b, c]) {
      join(x);
      await flush();
    }
    expect(FakePC.all).toHaveLength(6); // each of the 3 holds 2 connections
    expect(a.p.peerCount()).toBe(2);
    FakePC.all.find((pc) => pc.ontrack)!.ontrack?.({ streams: [new FakeStream() as never], track: {} as never });
    expect(a.events.streams.length + b.events.streams.length + c.events.streams.length).toBe(1);
  });

  it('a full room: rtc.full is reported, and nothing is built', async () => {
    server.max = 1;
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    expect(b.events.errors).toEqual(['full']);
    expect(b.events.errorMessages[0]).toBe('Audio room is full (1/1)');
    expect(b.p.joined).toBe(false);
    expect(FakePC.all).toHaveLength(0);
  });

  it('leaving closes the links of everybody involved and stops forwarding', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    b.p.leave();
    await flush();
    expect(FakePC.all.every((pc) => pc.closed)).toBe(true);
    expect(a.events.gone).toEqual(['b']);
    expect(a.p.peerCount()).toBe(0);
    expect(b.p.joined).toBe(false);
  });

  it('mute disables the microphone track; flags are relayed', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    a.p.setMuted(true);
    expect(a.stream.tracks[0].enabled).toBe(false);
    a.p.sendFlags({ muted: true, speaking: false });
    await flush();
    expect(b.events.flags).toEqual([['a', { muted: true, speaking: false }]]);
    a.p.setMuted(false);
    expect(a.stream.tracks[0].enabled).toBe(true);
  });

  it('a link that stays disconnected gets an ICE restart from its initiator; a failed link restarts at once', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    const pb = FakePC.all[0]; // b offered -> b is the initiator
    pb.setState('disconnected');
    await vi.advanceTimersByTimeAsync(500);
    expect(pb.offers.filter((o) => o?.iceRestart)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600);
    await flush();
    expect(pb.offers.filter((o) => o?.iceRestart)).toHaveLength(1);
    pb.setState('connected');
    // the answerer never restarts on its own
    const pa = FakePC.all[1];
    pa.setState('failed');
    await flush();
    expect(pa.offers).toHaveLength(0);
    pb.setState('failed');
    await flush();
    expect(pb.offers.filter((o) => o?.iceRestart)).toHaveLength(2);
  });

  it('restarts are limited (3), then the link is reported failed', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    const pb = FakePC.all[0];
    for (let i = 0; i < 5; i++) {
      pb.setState('failed');
      await flush();
    }
    expect(pb.offers.filter((o) => o?.iceRestart)).toHaveLength(3);
    expect(b.events.states.at(-1)).toEqual(['a', 'failed']);
  });

  it('after the signaling socket reconnected: join again, keep healthy links, rebuild dead ones', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    // the server lost both memberships when the sockets closed
    server.members.clear();
    const healthy = FakePC.all[0];
    a.p.signalingReconnected();
    await flush();
    b.p.signalingReconnected();
    await flush();
    expect(healthy.closed).toBe(false);
    expect(FakePC.all).toHaveLength(2);
    // b's link to a died meanwhile: the new rtc.joined rebuilds it
    for (const pc of FakePC.all) pc.connectionState = 'failed';
    server.members.clear();
    b.p.signalingReconnected();
    await flush();
    a.p.signalingReconnected();
    await flush();
    expect(FakePC.all.length).toBeGreaterThan(2);
  });

  it('replaceStream swaps the track on every connection and stops the old microphone', async () => {
    const a = peer('a'), b = peer('b');
    join(a);
    await flush();
    join(b);
    await flush();
    const old = b.stream.tracks[0];
    const next = new FakeStream();
    await b.p.replaceStream(next as never);
    expect(FakePC.all[0].senders[0].replaceTrack).toHaveBeenCalledWith(next.tracks[0]);
    expect(old.stopped).toBe(true);
  });

  it('ignores signals while not in the call', async () => {
    const a = peer('a');
    a.p.handleMessage({ type: 'rtc.signal', from: 'x', kind: 'offer', data: { type: 'offer', sdp: 's' } });
    await flush();
    expect(FakePC.all).toHaveLength(0);
  });
});
