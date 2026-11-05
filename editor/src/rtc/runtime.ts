import type { RtcConfig } from '../api/types';
import { createRtcProvider } from './mesh';
import type { MeshOptions, RtcPeerInfo, RtcProvider, SignalMessage } from './provider';
import { LevelMeter } from './speaking';
import { effectiveMuted, useRtcStore } from './store';

export interface RtcRuntimeDeps {
  /** publish a JSON command on the file's rtc topic */
  send: (m: SignalMessage) => boolean;
  fetchConfig: () => Promise<RtcConfig>;
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  createProvider: (o: Omit<MeshOptions, 'signaling' | 'PeerConnection' | 'iceServers'>, cfg: RtcConfig) => RtcProvider;
  PeerConnection: MeshOptions['PeerConnection'];
  AudioContext: ConstructorParameters<typeof LevelMeter>[0]['AudioContext'];
  /** mirror my audio state into the live-session awareness (rings on avatars and cursors) */
  publishAudio: (a: { in: boolean; muted: boolean; speaking: boolean }) => void;
}

const audioConstraints = (deviceId?: string | null): MediaStreamConstraints => ({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
});

function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was blocked. Allow it in the browser to join the audio room.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found.';
  return 'Could not open the microphone.';
}

/**
 * Audio-room controller of the open file: owns the microphone, the provider (mesh), the speaking meter and the store the UI reads.
 * Push-to-talk key: hold M (not Space: that pans the canvas; not V: that is the select tool).
 */
export class RtcRuntime {
  private provider: RtcProvider | null = null;
  private stream: MediaStream | null = null;
  private meter: LevelMeter | null = null;
  private cfg: RtcConfig | null = null;
  constructor(private d: RtcRuntimeDeps) {}

  private get st() {
    return useRtcStore.getState();
  }
  private muted(): boolean {
    return effectiveMuted(this.st.userMuted, this.st.ptt, this.st.talking);
  }

  async join(): Promise<void> {
    if (this.provider || this.st.status === 'joining') return;
    this.st.patch({ status: 'joining', error: null });
    try {
      this.cfg = await this.d.fetchConfig();
    } catch {
      this.st.patch({ status: 'error', error: 'Audio rooms are not available on this server.' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await this.d.getUserMedia(audioConstraints(this.st.inputId));
    } catch (e) {
      this.st.patch({ status: 'error', error: micError(e) });
      return;
    }
    this.stream = stream;
    this.st.patch({ maxPeers: this.cfg.maxPeers });
    const events: Omit<MeshOptions, 'signaling' | 'PeerConnection' | 'iceServers'> = {
      onPeers: (peers) => {
        this.st.patch({ roster: peers });
      },
      onPeerState: (p, state) => this.st.upsertPeer(p, { state }),
      onRemoteStream: (p, s) => this.st.upsertPeer(p, { stream: s }),
      onPeerGone: (id) => this.st.removePeer(id),
      onPeerFlags: (id, f) => {
        const p = this.st.peers[id];
        if (p) this.st.upsertPeer(p, f);
      },
      onError: (code, message) => {
        if (code === 'full') this.teardown();
        this.st.patch({ status: 'error', error: message });
      },
    };
    this.provider = this.d.createProvider(events, this.cfg);
    this.meter = new LevelMeter({ AudioContext: this.d.AudioContext, onChange: (s) => this.onLocalSpeaking(s) });
    this.meter.start(stream);
    this.provider.join(stream);
    this.st.patch({ status: 'joined', inputId: stream.getAudioTracks()[0]?.getSettings?.().deviceId ?? this.st.inputId });
    this.applyMute();
    this.publish();
    await this.refreshDevices();
  }

  private async refreshDevices(): Promise<void> {
    try {
      const all = await this.d.enumerateDevices();
      const opt = (k: string) => all.filter((x) => x.kind === k).map((x, i) => ({ id: x.deviceId, label: x.label || `${k === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}` }));
      this.st.patch({ inputs: opt('audioinput'), outputs: opt('audiooutput') });
    } catch {
      /* no device list: the browser default is used */
    }
  }

  private publish(): void {
    const s = this.st;
    const muted = this.muted();
    this.d.publishAudio({ in: s.status === 'joined' || s.status === 'joining', muted, speaking: s.speaking && !muted });
    this.provider?.sendFlags({ muted, speaking: s.speaking && !muted });
  }

  private applyMute(): void {
    const m = this.muted();
    this.provider?.setMuted(m);
    this.meter?.setMuted(m);
  }

  setMuted(muted: boolean): void {
    this.st.patch({ userMuted: muted });
    this.applyMute();
    this.publish();
  }
  setPtt(on: boolean): void {
    this.st.patch({ ptt: on, talking: false });
    this.applyMute();
    this.publish();
  }
  /** the talk key went down / up (only meaningful with push-to-talk) */
  talk(down: boolean): void {
    if (!this.st.ptt || this.st.status !== 'joined' || this.st.talking === down) return;
    this.st.patch({ talking: down });
    this.applyMute();
    this.publish();
  }
  onLocalSpeaking(speaking: boolean): void {
    this.st.patch({ speaking });
    this.publish();
  }

  async selectInput(deviceId: string): Promise<void> {
    this.st.patch({ inputId: deviceId });
    if (!this.provider) return;
    try {
      const next = await this.d.getUserMedia(audioConstraints(deviceId));
      await this.provider.replaceStream(next);
      this.stream = next;
      this.meter?.start(next);
      this.applyMute();
    } catch (e) {
      this.st.patch({ error: micError(e) });
    }
  }
  selectOutput(deviceId: string): void {
    this.st.patch({ outputId: deviceId });
  }

  handleMessage(m: SignalMessage): void {
    if (m.type === 'rtc.roster') {
      this.st.patch({ roster: (m.peers as RtcPeerInfo[]) ?? [] });
      return;
    }
    this.provider?.handleMessage(m);
  }
  signalingReconnected(): void {
    this.provider?.signalingReconnected();
  }

  private teardown(): void {
    this.meter?.stop();
    this.meter = null;
    this.provider?.leave();
    this.provider = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
  }
  leave(): void {
    const was = this.provider !== null || this.st.status !== 'idle';
    this.teardown();
    const keep = { ptt: this.st.ptt, inputId: this.st.inputId, outputId: this.st.outputId, inputs: this.st.inputs, outputs: this.st.outputs, roster: this.st.roster };
    this.st.reset();
    this.st.patch(keep);
    if (was) this.d.publishAudio({ in: false, muted: false, speaking: false });
  }
  /** the tab closes / another file opens: leave the room so nobody keeps a dead link */
  dispose(): void {
    this.leave();
  }
}

export function createRtcRuntime(d: Omit<RtcRuntimeDeps, 'createProvider'> & { createProvider?: RtcRuntimeDeps['createProvider'] }): RtcRuntime {
  const deps: RtcRuntimeDeps = {
    ...d,
    createProvider: d.createProvider ?? ((events, cfg) => createRtcProvider({ ...events, signaling: { send: d.send }, PeerConnection: d.PeerConnection, iceServers: cfg.iceServers })),
  };
  return new RtcRuntime(deps);
}

let current: RtcRuntime | null = null;
export const getRtc = (): RtcRuntime | null => current;
export const setRtc = (r: RtcRuntime | null): void => {
  current = r;
};
