import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabStore } from '../collab/store';
import type { RtcPeerInfo, RtcProvider, SignalMessage } from './provider';
import { createRtcRuntime, type RtcRuntimeDeps } from './runtime';
import { effectiveMuted, useRtcStore } from './store';

class FakeStream {
  tracks = [{ enabled: true, stopped: false, stop() { this.stopped = true; }, kind: 'audio', getSettings: () => ({ deviceId: 'mic1' }) }];
  getAudioTracks() { return this.tracks; }
  getTracks() { return this.tracks; }
}
function fakeProvider() {
  const calls: string[] = [];
  const p = {
    kind: 'mesh' as const,
    joined: false,
    join: vi.fn(function (this: { joined: boolean }) { calls.push('join'); p.joined = true; }),
    leave: vi.fn(() => { calls.push('leave'); p.joined = false; }),
    handleMessage: vi.fn(),
    signalingReconnected: vi.fn(),
    setMuted: vi.fn(),
    replaceStream: vi.fn(async () => undefined),
    sendFlags: vi.fn(),
  };
  return { p: p as RtcProvider & typeof p, calls };
}

let sent: SignalMessage[];
let provider: ReturnType<typeof fakeProvider>;
let events: Parameters<RtcRuntimeDeps['createProvider']>[0];
let gum: ReturnType<typeof vi.fn>;
const setAudio = vi.fn();
function make(over: Partial<RtcRuntimeDeps> = {}) {
  gum = vi.fn(async () => new FakeStream());
  const rt = createRtcRuntime({
    send: (m) => (sent.push(m), true),
    fetchConfig: async () => ({ enabled: true, maxPeers: 4, iceServers: [{ urls: ['stun:x'] }] }),
    getUserMedia: gum as never,
    enumerateDevices: async () => [
      { kind: 'audioinput', deviceId: 'mic1', label: 'Built-in mic' }, { kind: 'audioinput', deviceId: 'mic2', label: 'USB mic' },
      { kind: 'audiooutput', deviceId: 'spk1', label: 'Speakers' }, { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
    ] as never,
    createProvider: (e) => ((events = e), provider.p),
    PeerConnection: function () { /* unused: the provider is faked */ } as never,
    AudioContext: undefined,
    publishAudio: setAudio,
    ...over,
  });
  return rt;
}
beforeEach(() => {
  sent = [];
  provider = fakeProvider();
  setAudio.mockClear();
  useRtcStore.getState().reset();
  useCollabStore.getState().attach(null);
});
afterEach(() => vi.restoreAllMocks());

describe('effectiveMuted', () => {
  it('mute switch, or push-to-talk with the key up', () => {
    expect(effectiveMuted(false, false, false)).toBe(false);
    expect(effectiveMuted(true, false, true)).toBe(true);
    expect(effectiveMuted(false, true, false)).toBe(true);
    expect(effectiveMuted(true, true, true)).toBe(false); // holding the talk key opens the mic even if "mute" was on
  });
});

describe('RtcRuntime', () => {
  it('join: reads the ICE config, asks for the microphone, joins the room, lists devices; leave tears everything down', async () => {
    const rt = make();
    await rt.join();
    expect(gum).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: true }) });
    expect(provider.calls).toEqual(['join']);
    const s = useRtcStore.getState();
    expect(s.status).toBe('joined');
    expect(s.maxPeers).toBe(4);
    expect(s.inputs.map((d) => d.label)).toEqual(['Built-in mic', 'USB mic']);
    expect(s.outputs.map((d) => d.label)).toEqual(['Speakers']);
    expect(s.inputId).toBe('mic1');
    expect(setAudio).toHaveBeenLastCalledWith({ in: true, muted: false, speaking: false });
    rt.leave();
    expect(provider.calls).toEqual(['join', 'leave']);
    expect(useRtcStore.getState().status).toBe('idle');
    expect(setAudio).toHaveBeenLastCalledWith({ in: false, muted: false, speaking: false });
  });

  it('a blocked microphone is an error with a readable message; nothing is joined', async () => {
    const rt = make({ getUserMedia: (async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }) as never });
    await rt.join();
    expect(useRtcStore.getState().status).toBe('error');
    expect(useRtcStore.getState().error).toMatch(/microphone/i);
    expect(provider.calls).toEqual([]);
  });

  it('a room that is full is reported (rtc.full -> error) and leaves the room state clean', async () => {
    const rt = make();
    await rt.join();
    events.onError?.('full', 'Audio room is full (6/6)');
    expect(useRtcStore.getState().status).toBe('error');
    expect(useRtcStore.getState().error).toMatch(/full/);
    rt.leave();
  });

  it('mute / unmute goes to the provider, the store and my awareness; the others are told', async () => {
    const rt = make();
    await rt.join();
    rt.setMuted(true);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(true);
    expect(useRtcStore.getState().userMuted).toBe(true);
    expect(setAudio).toHaveBeenLastCalledWith({ in: true, muted: true, speaking: false });
    expect(provider.p.sendFlags).toHaveBeenLastCalledWith({ muted: true, speaking: false });
    rt.setMuted(false);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(false);
  });

  it('push-to-talk: with it on the mic is closed until the talk key is held; releasing closes it again', async () => {
    const rt = make();
    await rt.join();
    rt.setPtt(true);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(true);
    rt.talk(true);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(false);
    expect(useRtcStore.getState().talking).toBe(true);
    rt.talk(false);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(true);
    rt.setPtt(false);
    expect(provider.p.setMuted).toHaveBeenLastCalledWith(false);
    rt.talk(true); // ignored without push-to-talk
    expect(useRtcStore.getState().talking).toBe(false);
  });

  it('speaking changes (from the level meter) are published to everybody', async () => {
    const rt = make();
    await rt.join();
    rt.onLocalSpeaking(true);
    expect(useRtcStore.getState().speaking).toBe(true);
    expect(setAudio).toHaveBeenLastCalledWith({ in: true, muted: false, speaking: true });
    expect(provider.p.sendFlags).toHaveBeenLastCalledWith({ muted: false, speaking: true });
  });

  it('peers: state, remote stream, flags and departure are tracked for the UI', async () => {
    const rt = make();
    await rt.join();
    const bob: RtcPeerInfo = { clientId: 'b', userId: 'u_b', name: 'Bob' };
    events.onPeerState?.(bob, 'connected');
    expect(useRtcStore.getState().peers.b).toMatchObject({ name: 'Bob', state: 'connected', speaking: false });
    const stream = {} as MediaStream;
    events.onRemoteStream?.(bob, stream);
    expect(useRtcStore.getState().peers.b.stream).toBe(stream);
    events.onPeerFlags?.('b', { muted: true, speaking: true });
    expect(useRtcStore.getState().peers.b).toMatchObject({ muted: true, speaking: true });
    events.onPeerGone?.('b');
    expect(useRtcStore.getState().peers.b).toBeUndefined();
  });

  it('rtc.roster tells everybody (joined or not) who is in the call; rtc.* messages reach the provider', async () => {
    const rt = make();
    rt.handleMessage({ type: 'rtc.roster', peers: [{ clientId: 'x', userId: 'u', name: 'Xi' }] });
    expect(useRtcStore.getState().roster.map((p) => p.name)).toEqual(['Xi']);
    await rt.join();
    rt.handleMessage({ type: 'rtc.signal', from: 'x', kind: 'offer', data: {} });
    expect(provider.p.handleMessage).toHaveBeenCalledWith({ type: 'rtc.signal', from: 'x', kind: 'offer', data: {} });
  });

  it('device picker: choosing another microphone swaps the track without leaving', async () => {
    const rt = make();
    await rt.join();
    await rt.selectInput('mic2');
    expect(gum).toHaveBeenLastCalledWith({ audio: expect.objectContaining({ deviceId: { exact: 'mic2' } }) });
    expect(provider.p.replaceStream).toHaveBeenCalledTimes(1);
    expect(useRtcStore.getState().inputId).toBe('mic2');
    rt.selectOutput('spk1');
    expect(useRtcStore.getState().outputId).toBe('spk1');
  });

  it('the signaling socket coming back re-enters the room', async () => {
    const rt = make();
    await rt.join();
    rt.signalingReconnected();
    expect(provider.p.signalingReconnected).toHaveBeenCalled();
  });

  it('dispose leaves like a closed tab', async () => {
    const rt = make();
    await rt.join();
    rt.dispose();
    expect(provider.calls).toEqual(['join', 'leave']);
  });
});
