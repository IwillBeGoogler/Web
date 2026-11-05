/**
 * Audio rooms are built on a provider interface so the transport can be swapped:
 *  - `mesh`  (this repo): every participant connects to every other one (WebRTC peer-to-peer), signaling over the file's MQTT connection.
 *            Fine for small groups; the bandwidth and CPU of every client grow with the number of participants (the server limits a room
 *            to `RTC_MAX_PEERS`, default 6).
 *  - `sfu`   (not shipped): a Selective Forwarding Unit such as LiveKit (self-hostable) takes each participant's single upstream and
 *            fans it out, which scales to dozens of people. To plug it in, implement `RtcProvider` (join with a token the server mints,
 *            publish the local track, subscribe to remote tracks) and return it from `createRtcProvider`.
 */
export interface RtcPeerInfo {
  clientId: string;
  userId: string | null;
  name: string;
}
export type RtcPeerState = 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface RtcEvents {
  onPeers?: (peers: RtcPeerInfo[]) => void;
  onPeerState?: (peer: RtcPeerInfo, state: RtcPeerState) => void;
  onRemoteStream?: (peer: RtcPeerInfo, stream: MediaStream) => void;
  onPeerGone?: (clientId: string) => void;
  /** a mute / speaking flag of a participant (relayed by the server) */
  onPeerFlags?: (clientId: string, flags: { muted: boolean; speaking: boolean }) => void;
  /** the room refused me (full) or something broke */
  onError?: (code: 'full' | 'failed', message: string) => void;
}
/** the messages that go to / come from the server (`rtc.*`, see server/src/services/rtc.ts) */
export type SignalMessage = { type: string } & Record<string, unknown>;
export interface RtcSignaling {
  send: (msg: SignalMessage) => boolean;
}
export interface RtcProvider {
  readonly kind: 'mesh' | 'sfu';
  /** enter the room with my microphone stream */
  join(stream: MediaStream): void;
  leave(): void;
  /** feed every `rtc.*` message of the server into the provider */
  handleMessage(m: SignalMessage): void;
  /** the signaling socket reconnected: re-enter the room and repair broken links */
  signalingReconnected(): void;
  setMuted(muted: boolean): void;
  /** swap the microphone (device picker) without leaving the room */
  replaceStream(stream: MediaStream): Promise<void>;
  /** tell the others whether I am speaking (the server relays it) */
  sendFlags(flags: { muted: boolean; speaking: boolean }): void;
  readonly joined: boolean;
}

export interface MeshOptions extends RtcEvents {
  signaling: RtcSignaling;
  PeerConnection: new (cfg: { iceServers: { urls: string[]; username?: string; credential?: string }[] }) => PeerConnectionLike;
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  /** ms a link may stay "disconnected" before ICE is restarted */
  disconnectedGraceMs?: number;
}

/** the slice of RTCPeerConnection the mesh uses (a fake in tests) */
export interface PeerConnectionLike {
  connectionState: string;
  signalingState: string;
  remoteDescription: unknown;
  onicecandidate: ((e: { candidate: unknown }) => void) | null;
  ontrack: ((e: { streams: MediaStream[]; track: MediaStreamTrack }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack(track: MediaStreamTrack, stream: MediaStream): unknown;
  getSenders(): { track: MediaStreamTrack | null; replaceTrack(t: MediaStreamTrack | null): Promise<void> }[];
  createOffer(o?: { iceRestart?: boolean }): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(c: unknown): Promise<void>;
  close(): void;
}
