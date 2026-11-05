import type { MeshOptions, PeerConnectionLike, RtcPeerInfo, RtcPeerState, RtcProvider, SignalMessage } from './provider';

interface Link {
  info: RtcPeerInfo;
  pc: PeerConnectionLike;
  /** I created the first offer (so I also restart ICE) */
  initiator: boolean;
  pendingIce: unknown[];
  restarts: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
  makingOffer: boolean;
}

/**
 * Full-mesh WebRTC audio: every participant holds one RTCPeerConnection to every other participant.
 * Who offers: the participant that JOINS offers to everybody already in the room (no glare, no tie-breaks).
 * Reconnect: a link that stays `disconnected` (or turns `failed`) gets an ICE restart from its initiator; after a signaling
 * reconnect the provider re-joins the room and re-offers to links that are not connected.
 */
export class MeshRtcProvider implements RtcProvider {
  readonly kind = 'mesh' as const;
  private links = new Map<string, Link>();
  /** who is in the room (from rtc.joined / rtc.peer-joined): names for the people who offer to me */
  private known = new Map<string, RtcPeerInfo>();
  private stream: MediaStream | null = null;
  private _joined = false;
  private muted = false;
  constructor(private o: MeshOptions) {}

  get joined(): boolean {
    return this._joined;
  }
  peerCount(): number {
    return this.links.size;
  }

  join(stream: MediaStream): void {
    this.stream = stream;
    this._joined = true;
    this.applyMute();
    this.o.signaling.send({ type: 'rtc.join' });
  }

  leave(): void {
    if (this._joined) this.o.signaling.send({ type: 'rtc.leave' });
    this._joined = false;
    for (const id of [...this.links.keys()]) this.drop(id, false);
    this.stream = null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }
  private applyMute(): void {
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = !this.muted;
  }

  sendFlags(flags: { muted: boolean; speaking: boolean }): void {
    if (this._joined) this.o.signaling.send({ type: 'rtc.state', ...flags });
  }

  async replaceStream(stream: MediaStream): Promise<void> {
    const old = this.stream;
    this.stream = stream;
    this.applyMute();
    const track = stream.getAudioTracks()[0] ?? null;
    for (const l of this.links.values()) for (const s of l.pc.getSenders()) if (!s.track || s.track.kind === 'audio') await s.replaceTrack(track);
    for (const t of old?.getTracks() ?? []) t.stop();
  }

  signalingReconnected(): void {
    if (!this._joined) return;
    // the server forgot me when the socket closed: join again; links that are still up keep working
    this.o.signaling.send({ type: 'rtc.join' });
  }

  handleMessage(m: SignalMessage): void {
    switch (m.type) {
      case 'rtc.joined': {
        const peers = (m.peers as RtcPeerInfo[]) ?? [];
        for (const p of peers) this.known.set(p.clientId, p);
        this.o.onPeers?.(peers);
        const ids = new Set(peers.map((p) => p.clientId));
        for (const id of [...this.links.keys()]) if (!ids.has(id) && this.links.get(id)!.initiator) this.drop(id, true); // left while I was away
        for (const p of peers) {
          const l = this.links.get(p.clientId);
          if (l && (l.pc.connectionState === 'connected' || l.pc.connectionState === 'connecting')) continue;
          if (l) this.drop(p.clientId, false);
          void this.offerTo(p, false);
        }
        return;
      }
      case 'rtc.peer-joined': {
        // they will offer to me; remember who they are for the UI
        const p = m.peer as RtcPeerInfo;
        this.known.set(p.clientId, p);
        this.o.onPeers?.([...[...this.links.values()].map((l) => l.info), p]);
        return;
      }
      case 'rtc.peer-left':
        return this.drop(m.clientId as string, true);
      case 'rtc.full':
        this._joined = false;
        return this.o.onError?.('full', `Audio room is full (${m.max}/${m.max})`);
      case 'rtc.state':
        return this.o.onPeerFlags?.(m.from as string, { muted: !!m.muted, speaking: !!m.speaking });
      case 'rtc.signal':
        void this.onSignal(m.from as string, m.kind as string, m.data);
        return;
    }
  }

  private makeLink(info: RtcPeerInfo, initiator: boolean): Link {
    const pc = new this.o.PeerConnection({ iceServers: this.o.iceServers });
    const link: Link = { info, pc, initiator, pendingIce: [], restarts: 0, graceTimer: null, makingOffer: false };
    if (this.stream) for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.o.signaling.send({ type: 'rtc.signal', to: info.clientId, kind: 'ice', data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const s = e.streams[0];
      if (s) this.o.onRemoteStream?.(info, s);
    };
    pc.onconnectionstatechange = () => this.onState(link);
    this.links.set(info.clientId, link);
    this.o.onPeerState?.(info, 'connecting');
    return link;
  }

  private async offerTo(info: RtcPeerInfo, iceRestart: boolean): Promise<void> {
    let link = this.links.get(info.clientId);
    if (!link) link = this.makeLink(info, true);
    if (link.makingOffer) return;
    link.makingOffer = true;
    try {
      const offer = await link.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await link.pc.setLocalDescription(offer);
      this.o.signaling.send({ type: 'rtc.signal', to: info.clientId, kind: 'offer', data: { type: offer.type, sdp: offer.sdp } });
    } catch {
      this.o.onError?.('failed', 'Could not start the audio connection');
    } finally {
      link.makingOffer = false;
    }
  }

  private async onSignal(from: string, kind: string, data: unknown): Promise<void> {
    if (!this._joined) return;
    try {
      if (kind === 'offer') {
        let link = this.links.get(from);
        // a dead link (failed / closed) cannot take a fresh offer: build a new one for the same person
        if (link && (link.pc.connectionState === 'failed' || link.pc.connectionState === 'closed')) {
          const info = link.info;
          this.drop(from, false);
          link = this.makeLink(info, false);
        }
        if (!link) link = this.makeLink(this.known.get(from) ?? { clientId: from, userId: null, name: 'Guest' }, false);
        const d = data as { type: string; sdp?: string };
        await link.pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
        await this.flushIce(link);
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        this.o.signaling.send({ type: 'rtc.signal', to: from, kind: 'answer', data: { type: answer.type, sdp: answer.sdp } });
      } else if (kind === 'answer') {
        const link = this.links.get(from);
        if (!link) return;
        const d = data as { type: string; sdp?: string };
        await link.pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
        await this.flushIce(link);
      } else if (kind === 'ice') {
        const link = this.links.get(from);
        if (!link) return;
        const cand = (data as { candidate?: unknown }).candidate;
        if (!cand) return;
        if (link.pc.remoteDescription) await link.pc.addIceCandidate(cand).catch(() => undefined);
        else link.pendingIce.push(cand); // candidates may overtake the offer: hold them
      }
    } catch {
      this.o.onError?.('failed', 'Audio signaling failed');
    }
  }

  private async flushIce(link: Link): Promise<void> {
    const q = link.pendingIce.splice(0);
    for (const c of q) await link.pc.addIceCandidate(c).catch(() => undefined);
  }

  private onState(link: Link): void {
    const st = link.pc.connectionState;
    const map: Record<string, RtcPeerState> = { new: 'connecting', connecting: 'connecting', connected: 'connected', disconnected: 'disconnected', failed: 'failed', closed: 'closed' };
    const state = map[st] ?? 'connecting';
    this.o.onPeerState?.(link.info, state);
    if (link.graceTimer) clearTimeout(link.graceTimer);
    link.graceTimer = null;
    if (state === 'connected') link.restarts = 0;
    else if (state === 'disconnected') {
      link.graceTimer = setTimeout(() => this.restart(link), this.o.disconnectedGraceMs ?? 4000);
    } else if (state === 'failed') this.restart(link);
  }

  private restart(link: Link): void {
    if (!this._joined || this.links.get(link.info.clientId) !== link) return;
    if (link.pc.connectionState === 'connected') return;
    if (link.restarts >= 3) {
      this.o.onPeerState?.(link.info, 'failed');
      return;
    }
    link.restarts++;
    // only the side that made the first offer restarts; the other side waits for the new offer
    if (link.initiator) void this.offerTo(link.info, true);
  }

  private drop(clientId: string, notify: boolean): void {
    const l = this.links.get(clientId);
    if (!l) return;
    if (l.graceTimer) clearTimeout(l.graceTimer);
    l.pc.onconnectionstatechange = null;
    l.pc.onicecandidate = null;
    l.pc.ontrack = null;
    try {
      l.pc.close();
    } catch {
      /* already closed */
    }
    this.links.delete(clientId);
    if (notify) this.known.delete(clientId);
    if (notify) this.o.onPeerGone?.(clientId);
  }
}

/** the transport used by the editor: always the mesh today; return an SFU-backed provider here to scale beyond ~6 people */
export function createRtcProvider(o: MeshOptions): RtcProvider {
  return new MeshRtcProvider(o);
}
