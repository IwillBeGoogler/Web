import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import type { MqttLink } from '../realtime/link';
import { topics } from '../realtime/topics';

/** y-websocket compatible frames, carried as MQTT payloads (Backend/docs/MQTT.md "Binary") */
export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
/** legacy WebSocket frame; refusals now arrive as JSON on `dg/c/{c}/ctl` */
export const MSG_DENIED = 2;
/** [3][varUint seq][varUint8Array snapshot]: my whole document, complete up to the server's update `seq` */
export const MSG_COMPACT = 3;
/** [4][varUint seq]: the server asks for MSG_COMPACT (it holds many small updates) */
export const MSG_COMPACT_HINT = 4;
/** the document was replaced on the server (version restore, ctl 1012): drop local copies, then connect again */
export const CLOSE_RESTART = 1012;

export type CollabStatus = 'connecting' | 'connected' | 'offline';

export interface ProviderOptions {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** the file's connection (shared with the events client; its owner closes it) */
  link: MqttLink;
  fileId: string;
  /** viewer / commenter: never send document updates (the server would refuse them) */
  readOnly?: boolean;
  /** awareness publishes per second at most (the realtime config says 15) */
  awarenessMaxPerSec?: number;
  /** wait before re-joining after `unavailable` (1011) */
  retryUnavailableMs?: number;
  onStatus?: (s: CollabStatus) => void;
  /** the server refused a write (read-only role) */
  onDenied?: (reason: string) => void;
  /** the session ended for good (4404 file deleted, 1011 collab unavailable): no reconnect */
  onFatalClose?: (code: number) => void;
  /**
   * ctl 1012: the server replaced the document (a restore). The provider stops; the owner clears the local copy
   * (IndexedDB) and the stale doc, then starts afresh. Without this handler it just joins again.
   */
  onRestart?: () => void;
}

const frame = (...parts: ((e: encoding.Encoder) => void)[]): Uint8Array => {
  const e = encoding.createEncoder();
  for (const p of parts) p(e);
  return encoding.toUint8Array(e);
};
const textOf = (b: Uint8Array): string => new TextDecoder().decode(b);

/**
 * Yjs provider over MQTT: y-websocket framing (sync step 1/2/update, awareness, compaction [4]/[3]) on `yjs/req|up|down|sync` and
 * `awareness/up|out`, with the control messages of `dg/c/{c}/ctl`. Reconnecting is the link's job (new ticket + client id each
 * time); after every connect the provider joins again. Edits made offline stay in the Y.Doc and are exchanged by the join handshake
 * (CRDT merge: no conflict dialog).
 */
export class CollabProvider {
  status: CollabStatus = 'offline';
  synced = false;
  private stopped = true;
  private off: (() => void) | null = null;
  private deniedReported = false;
  private writesRefused = false;
  private unavailable = 0;
  private joinGen = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<() => void>>();
  private upQueue: Uint8Array[] = [];
  private awPending = false;
  private awTimer: ReturnType<typeof setTimeout> | null = null;
  private awLast = -Infinity;

  private get cid(): string | null {
    return this.o.link.clientId;
  }
  private onDoc = (u: Uint8Array, origin: unknown) => {
    if (origin === this || this.o.readOnly || this.writesRefused) return;
    this.upQueue.push(u);
    if (this.upQueue.length === 1) queueMicrotask(() => this.flushUp()); // small edits of one tick go out as one message
  };
  private onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this) return;
    if (![...added, ...updated, ...removed].some((id) => id === this.o.doc.clientID)) return; // only my own state goes up
    this.queueAwareness();
  };

  constructor(private o: ProviderOptions) {
    o.doc.on('update', this.onDoc);
    o.awareness.on('update', this.onAwareness);
  }

  on(event: 'synced', fn: () => void): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
  }
  private emit(event: string): void {
    for (const f of this.handlers.get(event) ?? []) f();
  }
  private setStatus(s: CollabStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.o.onStatus?.(s);
  }

  connect(): void {
    this.stopped = false;
    this.attach();
    if (this.o.link.connected && this.cid) {
      this.setStatus('connected');
      void this.join();
    } else {
      this.setStatus('connecting');
      this.o.link.start();
    }
  }

  private attach(): void {
    if (this.off) return;
    this.off = this.o.link.on({
      onOpen: () => {
        this.setStatus('connected');
        void this.join();
      },
      onClose: () => this.dropped(),
      onConnecting: () => !this.stopped && this.setStatus('connecting'),
      onMessage: (topic, payload, origin) => this.onTopic(topic, payload, origin),
      onFatal: (code) => {
        this.dropped();
        this.stopped = true;
        this.detach();
        this.o.onFatalClose?.(code);
      },
      onRestart: () => {
        if (this.stopped) return;
        if (this.o.onRestart) {
          this.disconnect();
          this.o.onRestart();
        } else {
          this.synced = false;
          void this.join();
        }
      },
    });
  }
  private detach(): void {
    this.off?.();
    this.off = null;
  }

  private dropped(): void {
    this.joinGen++;
    this.synced = false;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    // stale cursors of other people must not linger while we are offline
    awarenessProtocol.removeAwarenessStates(this.o.awareness, [...this.o.awareness.getStates().keys()].filter((id) => id !== this.o.doc.clientID), this);
    this.setStatus('offline');
  }

  /** subscribe (wait for the SUBACKs), then sync step 1 on `yjs/req/{c}`; the answer arrives on `yjs/sync/{c}` */
  private async join(): Promise<void> {
    const link = this.o.link;
    const c = this.cid;
    if (this.stopped || !c) return;
    const gen = ++this.joinGen;
    this.synced = false; // until the server's answer (an empty sync step 2) arrives
    const f = this.o.fileId;
    this.deniedReported = false;
    this.writesRefused = false;
    let denied: string[];
    try {
      denied = await link.subscribe([[topics.yjsDown(f), 1], [topics.yjsSync(f, c), 1], [topics.awarenessOut(f), 0], [topics.ctl(c), 1]]);
    } catch {
      return; // dropped while subscribing: the link reconnects and we join again
    }
    if (gen !== this.joinGen || this.stopped) return;
    if (denied.length) {
      // gone or no access: confirm over REST, otherwise live editing is simply unavailable
      if (await link.confirmGone()) return;
      if (gen !== this.joinGen || this.stopped) return;
      this.stopped = true;
      this.detach();
      this.setStatus('offline');
      this.o.onFatalClose?.(1011);
      return;
    }
    link.publish(topics.yjsReq(f, c), frame((e) => encoding.writeVarUint(e, MSG_SYNC), (e) => syncProtocol.writeSyncStep1(e, this.o.doc)), { qos: 1 });
    // announce my cursor / name again: re-setting the state bumps the awareness clock, so the server accepts it after it dropped my old connection
    const mine = this.o.awareness.getLocalState();
    if (mine !== null) this.o.awareness.setLocalState(mine);
  }

  private onTopic(topic: string, data: Uint8Array, origin: string | undefined): void {
    const c = this.cid;
    if (!c) return;
    const f = this.o.fileId;
    if (topic === topics.yjsSync(f, c)) this.onFrame(data);
    else if (topic === topics.yjsDown(f)) {
      if (origin === c) return; // my own update, already applied
      this.onFrame(data);
    } else if (topic === topics.awarenessOut(f)) {
      if (origin === c) return;
      this.onFrame(data);
    } else if (topic === topics.ctl(c)) this.onCtl(data);
  }

  private onCtl(data: Uint8Array): void {
    let m: { type?: string; reason?: string; code?: number | string };
    try {
      m = JSON.parse(textOf(data));
    } catch {
      return;
    }
    if (m.type === 'denied') this.denied(m.reason ?? 'read-only');
    else if (m.type === 'ctl' && m.code === 'denied') this.denied('revoked'); // access was taken away during the session
    else if (m.type === 'unavailable') {
      // the server could not store / load: back off, then resync; a repeat is final
      if (++this.unavailable >= 2) {
        this.stopped = true;
        this.detach();
        this.setStatus('offline');
        this.o.onFatalClose?.(typeof m.code === 'number' ? m.code : 1011);
        return;
      }
      this.joinGen++;
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.join();
      }, this.o.retryUnavailableMs ?? 1000);
    }
  }
  private denied(reason: string): void {
    this.writesRefused = true;
    if (!this.deniedReported) this.o.onDenied?.(reason); // once per connection
    this.deniedReported = true;
  }

  private onFrame(data: Uint8Array): void {
    const d = decoding.createDecoder(data);
    const type = decoding.readVarUint(d);
    if (type === MSG_SYNC) {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      const sub = syncProtocol.readSyncMessage(d, e, this.o.doc, this);
      if (encoding.length(e) > 1 && !this.o.readOnly) this.up(encoding.toUint8Array(e)); // step 2 to the server's step 1 (a viewer does not reply)
      if (sub === syncProtocol.messageYjsSyncStep2 && !this.synced) {
        this.synced = true;
        this.unavailable = 0;
        this.emit('synced');
      }
    } else if (type === MSG_AWARENESS) awarenessProtocol.applyAwarenessUpdate(this.o.awareness, decoding.readVarUint8Array(d), this);
    else if (type === MSG_COMPACT_HINT) {
      const seq = decoding.readVarUint(d);
      // only when I hold everything the server holds (synced); a viewer's write would be refused
      if (!this.synced || this.o.readOnly) return;
      this.up(frame((e) => encoding.writeVarUint(e, MSG_COMPACT), (e) => encoding.writeVarUint(e, seq), (e) => encoding.writeVarUint8Array(e, Y.encodeStateAsUpdate(this.o.doc))));
    }
  }

  /** publish on `yjs/up/{c}` (QoS 1); a PUBACK 0x87 means I am not an editor */
  private up(data: Uint8Array): void {
    const c = this.cid;
    if (!c) return;
    this.o.link.publish(topics.yjsUp(this.o.fileId, c), data, { qos: 1 }, (err) => {
      if (err?.code === 135) this.denied('read-only');
    });
  }
  private flushUp(): void {
    const q = this.upQueue;
    this.upQueue = [];
    if (!q.length || this.writesRefused) return;
    const u = q.length === 1 ? q[0]! : Y.mergeUpdates(q);
    this.up(frame((e) => encoding.writeVarUint(e, MSG_SYNC), (e) => syncProtocol.writeUpdate(e, u)));
  }

  // ---- awareness: at most `awarenessMaxPerSec` publishes per second (leading + trailing) ----
  private queueAwareness(): void {
    this.awPending = true;
    const gap = Math.ceil(1000 / (this.o.awarenessMaxPerSec ?? this.o.link.config?.awarenessMaxPerSec ?? 15));
    const wait = this.awLast + gap - Date.now();
    if (wait <= 0) this.flushAwareness();
    else if (!this.awTimer) {
      this.awTimer = setTimeout(() => {
        this.awTimer = null;
        this.flushAwareness();
      }, wait);
    }
  }
  private flushAwareness(): void {
    if (!this.awPending) return;
    this.awPending = false;
    this.awLast = Date.now();
    const c = this.cid;
    if (!c) return;
    const upd = awarenessProtocol.encodeAwarenessUpdate(this.o.awareness, [this.o.doc.clientID]);
    this.o.link.publish(topics.awarenessUp(this.o.fileId, c), frame((e) => encoding.writeVarUint(e, MSG_AWARENESS), (e) => encoding.writeVarUint8Array(e, upd)), { qos: 0 });
  }

  /** the browser is back online / the tab came back: try right now */
  reconnectNow(): void {
    if (!this.stopped) this.o.link.reconnectNow();
  }

  disconnect(): void {
    this.stopped = true;
    this.joinGen++;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.awTimer) clearTimeout(this.awTimer);
    this.awTimer = null;
    // tell the others we left: a removal frame (the server also does this when my presence ends)
    awarenessProtocol.removeAwarenessStates(this.o.awareness, [this.o.doc.clientID], this);
    this.awPending = true;
    this.flushAwareness();
    this.detach();
    this.synced = false;
    this.setStatus('offline');
  }

  /** stop for good and unhook from the doc */
  destroy(): void {
    this.disconnect();
    this.o.doc.off('update', this.onDoc);
    this.o.awareness.off('update', this.onAwareness);
  }
}
