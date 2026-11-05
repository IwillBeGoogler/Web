import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import { DEFAULT_REALTIME_CONFIG } from '../realtime/config';
import { MqttLink, type LinkOptions, type MqttConnectOptions, type PublishOpts } from '../realtime/link';
import { createMockMqtt, MockMqttClient } from '../realtime/mockMqtt';
import { topicMatches } from '../realtime/topics';
import { MSG_AWARENESS, MSG_COMPACT, MSG_SYNC } from './provider';

const bytesOf = (e: encoding.Encoder) => encoding.toUint8Array(e);

/** an in-memory diagramhub + broker: one doc, any number of MQTT clients (Backend/docs/MQTT.md), no network */
export class FakeServer {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  clients = new Set<ServerClient>();
  all: ServerClient[] = [];
  denyWrites = false;
  accepting = true;
  compactions: { seq: number; update: Uint8Array }[] = [];
  presence: { clientId: string; empty: boolean }[] = [];
  mqtt = createMockMqtt((url, opts) => new ServerClient(this, url, opts));
  private n = 0;
  constructor() {
    this.awareness.setLocalState(null);
    this.doc.on('update', (u: Uint8Array, origin: unknown) => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, u);
      this.fanOut(/\/yjs\/down$/, bytesOf(e), origin instanceof ServerClient ? origin.opts.clientId : undefined);
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_AWARENESS);
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
      this.fanOut(/\/awareness\/out$/, bytesOf(e), origin instanceof ServerClient ? origin.opts.clientId : undefined);
    });
  }
  /** the connect function of a link: a fresh client per call; refuses (drops) while `accepting` is false */
  connect: typeof this.mqtt.connect = (url, opts) => this.mqtt.connect(url, opts);
  /** a file link wired to this server */
  link(over: Partial<LinkOptions> = {}): MqttLink {
    return new MqttLink({
      scope: 'file',
      fileId: 'f1',
      userId: '1',
      getTicket: async () => `t${++this.n}`,
      config: DEFAULT_REALTIME_CONFIG,
      connect: this.connect,
      baseDelayMs: 100,
      maxDelayMs: 800,
      random: () => 1, // full jitter at its upper bound: deterministic delays
      ...over,
    });
  }
  /** deliver to every subscribed client whose subscription matches a topic of the file with this suffix */
  fanOut(suffix: RegExp, payload: Uint8Array, origin?: string): void {
    for (const c of this.clients) for (const t of c.subs) if (/^dg\/f\//.test(t) && suffix.test(t)) c.deliver(t, payload, origin);
  }
  /** every connection dies (network drop / broker restart) */
  dropAll(): void {
    for (const c of [...this.clients]) c.drop();
  }
  /** `ctl` on the file's events topic: 4404 deleted, 1012 restored */
  ctl(code: number, reason = ''): void {
    const body = JSON.stringify({ type: 'ctl', code, reason });
    for (const c of this.clients) for (const t of c.subs) if (/^dg\/f\/[^/]+\/events$/.test(t)) c.deliver(t, new TextEncoder().encode(body));
  }
  /** a JSON event on the file's events topic */
  event(ev: object, origin?: string): void {
    const body = new TextEncoder().encode(JSON.stringify(ev));
    for (const c of this.clients) for (const t of c.subs) if (/^dg\/f\/[^/]+\/events$/.test(t)) c.deliver(t, body, origin);
  }
  /** `dg/c/{c}/ctl` to one client */
  ctlTo(client: ServerClient, msg: object): void {
    client.deliver(`dg/c/${client.opts.clientId}/ctl`, new TextEncoder().encode(JSON.stringify(msg)));
  }
}

export class ServerClient extends MockMqttClient {
  ids = new Set<number>();
  constructor(private server: FakeServer, url: string, opts: MqttConnectOptions) {
    super(url, opts);
  }
  override connack(): void {
    if (!this.server.accepting) return this.drop();
    this.server.clients.add(this);
    this.server.all.push(this);
    super.connack();
  }
  override drop(): void {
    this.leave();
    super.drop();
  }
  override end(force?: boolean, o?: unknown, cb?: () => void): this {
    this.leave();
    return super.end(force, o, cb);
  }
  /** the presence ended (Will, clean leave, expiry): the server publishes a null awareness state for the ids */
  private leave(): void {
    if (!this.server.clients.delete(this)) return;
    if (this.ids.size) awarenessProtocol.removeAwarenessStates(this.server.awareness, [...this.ids], this);
  }
  /** deliver a message to this client if it subscribed to a matching topic */
  deliver(topic: string, payload: Uint8Array, origin?: string): void {
    if (!this.subs.some((f) => topicMatches(f, topic))) return;
    queueMicrotask(() => {
      if (!this.ended) this.message(topic, payload, origin);
    });
  }
  protected override onPublish(topic: string, payload: Uint8Array, opts: PublishOpts, cb?: (err?: Error | null, packet?: unknown) => void): void {
    const server = this.server;
    const done = (denied = false) => queueMicrotask(() => cb?.(denied ? Object.assign(new Error('Publish error: Not authorized'), { code: 135 }) : null, denied ? { reasonCode: 135 } : {}));
    const m = /^dg\/f\/([^/]+)\/(yjs\/req|yjs\/up|awareness\/up|presence|rtc\/up)\/([^/]+)$/.exec(topic);
    if (!m) return done();
    const [, f, kind] = m as unknown as [string, string, string];
    void opts;
    if (kind === 'presence') {
      server.presence.push({ clientId: this.opts.clientId, empty: payload.byteLength === 0 });
      if (payload.byteLength === 0 && this.ids.size) awarenessProtocol.removeAwarenessStates(server.awareness, [...this.ids], this);
      return done();
    }
    if (kind === 'awareness/up') {
      const d = decoding.createDecoder(payload);
      if (decoding.readVarUint(d) === MSG_AWARENESS) {
        const upd = decoding.readVarUint8Array(d);
        const dd = decoding.createDecoder(upd);
        const n = decoding.readVarUint(dd);
        for (let i = 0; i < n; i++) {
          this.ids.add(decoding.readVarUint(dd));
          decoding.readVarUint(dd);
          decoding.readVarString(dd);
        }
        awarenessProtocol.applyAwarenessUpdate(server.awareness, upd, this);
      }
      return done();
    }
    const d = decoding.createDecoder(payload);
    const type = decoding.readVarUint(d);
    if (kind === 'yjs/req') {
      // join: the answer on yjs/sync/{c}: what the asker lacks (sync step 2), then the server's own step 1, then the cursors it knows
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.readSyncMessage(d, e, server.doc, this);
      const to = `dg/f/${f}/yjs/sync/${this.opts.clientId}`;
      this.deliver(to, bytesOf(e));
      const s1 = encoding.createEncoder();
      encoding.writeVarUint(s1, MSG_SYNC);
      syncProtocol.writeSyncStep1(s1, server.doc);
      this.deliver(to, bytesOf(s1));
      const states = [...server.awareness.getStates().keys()];
      if (states.length) {
        const a = encoding.createEncoder();
        encoding.writeVarUint(a, MSG_AWARENESS);
        encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(server.awareness, states));
        this.deliver(to, bytesOf(a));
      }
      return done();
    }
    // yjs/up: editors only
    if (server.denyWrites) {
      if (type === MSG_SYNC && decoding.peekVarUint(d) === syncProtocol.messageYjsSyncStep1) return done();
      return done(true);
    }
    if (type === MSG_SYNC) {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.readSyncMessage(d, e, server.doc, this);
    } else if (type === MSG_COMPACT) {
      const seq = decoding.readVarUint(d);
      const update = decoding.readVarUint8Array(d);
      server.compactions.push({ seq, update });
      Y.applyUpdate(server.doc, update, this);
    }
    done();
  }
}
