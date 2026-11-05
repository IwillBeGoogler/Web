import { create } from 'zustand';
import type { RtcPeerInfo, RtcPeerState } from './provider';

export interface PeerView extends RtcPeerInfo {
  state: RtcPeerState;
  muted: boolean;
  speaking: boolean;
  stream: MediaStream | null;
}
export interface DeviceOption {
  id: string;
  label: string;
}
export type RtcStatus = 'idle' | 'joining' | 'joined' | 'error';

interface RtcState {
  status: RtcStatus;
  error: string | null;
  /** my own mute switch (the microphone is also closed while push-to-talk is on and the key is up) */
  userMuted: boolean;
  /** push-to-talk: the microphone is open only while the talk key (M) is held */
  ptt: boolean;
  talking: boolean;
  speaking: boolean;
  peers: Record<string, PeerView>;
  /** everybody in the call of this file (also for people who have not joined) */
  roster: RtcPeerInfo[];
  inputs: DeviceOption[];
  outputs: DeviceOption[];
  inputId: string | null;
  outputId: string | null;
  maxPeers: number;
  patch: (p: Partial<Omit<RtcState, 'patch' | 'reset' | 'upsertPeer' | 'removePeer'>>) => void;
  upsertPeer: (info: RtcPeerInfo, patch: Partial<PeerView>) => void;
  removePeer: (clientId: string) => void;
  reset: () => void;
}
const initial = { status: 'idle' as RtcStatus, error: null as string | null, userMuted: false, ptt: false, talking: false, speaking: false, peers: {} as Record<string, PeerView>, roster: [] as RtcPeerInfo[], inputs: [] as DeviceOption[], outputs: [] as DeviceOption[], inputId: null as string | null, outputId: null as string | null, maxPeers: 6 };

export const useRtcStore = create<RtcState>((set) => ({
  ...initial,
  patch: (p) => set(p),
  upsertPeer: (info, patch) =>
    set((s) => ({ peers: { ...s.peers, [info.clientId]: { ...{ ...info, state: 'connecting' as RtcPeerState, muted: false, speaking: false, stream: null }, ...s.peers[info.clientId], ...patch } } })),
  removePeer: (clientId) =>
    set((s) => {
      const { [clientId]: _gone, ...rest } = s.peers;
      void _gone;
      return { peers: rest };
    }),
  reset: () => set({ ...initial }),
}));

/** is my microphone closed? mute switch, or push-to-talk with the key up */
export const effectiveMuted = (userMuted: boolean, ptt: boolean, talking: boolean): boolean => (ptt ? !talking : userMuted);
