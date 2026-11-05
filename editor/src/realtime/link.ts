import type { PresenceUser } from '../sync/realtime';
import { getTicketProvider } from '../lib/host';
import { brokerUrl, getBrokerUrlOverride, loadRealtimeConfig, type RealtimeConfig } from './config';
import { topics } from './topics';

/** the slice of an mqtt.js client the link uses (a mock in tests) */
export interface MqttLike {
  connected?: boolean;
  on(event: string, fn: (...args: never[]) => void): unknown;
  subscribe(topics: Record<string, { qos: 0 | 1 | 2 }>, cb: (err?: Error | null, packet?: unknown) => void): unknown;
  publish(topic: string, payload: string | Uint8Array, opts: PublishOpts, cb?: (err?: Error | null, packet?: unknown) => void): unknown;
  end(force?: boolean, opts?: unknown, cb?: () => void): unknown;
}
export interface PublishOpts {
  qos: 0 | 1 | 2;
  retain?: boolean;
  properties?: { userProperties?: Record<string, string> };
}
export interface MqttConnectOptions {
  protocolVersion: 5;
  clean: true;
  keepalive: number;
  clientId: string;
  username: string;
  password: string;
  reconnectPeriod: 0;
  connectTimeout: number;
  resubscribe: false;
  will?: { topic: string; payload: string; qos: 1; retain: false };
}
export type MqttConnectFn = (url: string, opts: MqttConnectOptions) => MqttLike | Promise<MqttLike>;

/** mqtt.js, loaded on first use (own chunk: pages without realtime never download it) */
const defaultConnect: MqttConnectFn = async (url, opts) => {
  const m = await import('mqtt');
  // a host bundler may resolve mqtt's CommonJS build (Web: only a `default` export, no named `connect`)
  const connect = m.connect ?? (m as unknown as { default: { connect: typeof m.connect } }).default.connect;
  return connect(url, opts as never) as unknown as MqttLike;
};
let globalConnect: MqttConnectFn | null = null;
/** tests: every link created afterwards without its own `connect` uses this one (null = mqtt.js) */
export const setMqttConnect = (fn: MqttConnectFn | null): void => {
  globalConnect = fn;
};

/** `[A-Za-z0-9_-]{8,48}`, new for every connection */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** MQTT 5 reason codes: bad credentials / not authorized */
const AUTH_REFUSED = new Set([134, 135]);

export interface LinkEvent { type: string; [k: string]: unknown }
export interface LinkListener {
  /** connected AND the link's own topics (events, roster) are subscribed */
  onOpen?(info: { clientId: string; reconnect: boolean }): void;
  /** the connection dropped, or an attempt failed (offline until the next try) */
  onClose?(): void;
  /** a (re)connect attempt starts */
  onConnecting?(): void;
  /** JSON from the events topic (own echoes already dropped) */
  onEvent?(ev: LinkEvent, origin: string | undefined): void;
  /** the roster changed (file: who has this file open; project: who has which file open) */
  onRoster?(users: PresenceUser[]): void;
  /** every other message (Yjs, awareness, rtc inbox, ctl inbox ...) */
  onMessage?(topic: string, payload: Uint8Array, origin: string | undefined): void;
  /** final: 4404 (deleted), or the session ended (401: code 401) */
  onFatal?(code: number): void;
  /** ctl 1012: the document was replaced */
  onRestart?(): void;
}

export interface LinkOptions {
  scope: 'file' | 'project';
  /** file scope */
  fileId?: string;
  /** project scope */
  projectId?: string;
  /** signed-in user id (client id `u<id>.<nonce>`); ignored when `shareToken` is set */
  userId: string | null;
  /** a share-link holder connects as a guest (`g.<nonce>`, username `share`) */
  shareToken?: string | null;
  /** single-use ticket from the host (`POST /api/me/stream-ticket`); default = the host's `setTicketProvider` function */
  getTicket?: (() => Promise<string>) | null;
  config?: RealtimeConfig | (() => Promise<RealtimeConfig>);
  /** explicit broker URL (default: same origin, config `wsPath`) */
  url?: string | null;
  connect?: MqttConnectFn;
  /** a refused file subscription: is the file really gone / forbidden (GET /files/:id 404 / 403)? */
  checkGone?: () => Promise<boolean>;
  keepaliveSec?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** a connection that stayed up this long resets the backoff */
  stableMs?: number;
  random?: () => number;
}

type Status = 'idle' | 'connecting' | 'open' | 'stopped';

/**
 * ONE MQTT connection (mqtt.js over WebSocket) for an open file (with its Last Will and presence) or an open project (tree only).
 * It owns what is shared: credentials (a NEW ticket + client id for every connect / reconnect), the reconnect loop (full-jitter
 * exponential backoff), the events / roster topics, presence heartbeats and the final control messages. Yjs, awareness and
 * audio signaling attach as listeners and use `subscribe` / `publish`.
 *
 * mqtt.js's own reconnect is switched off (`reconnectPeriod: 0`): its `transformWsUrl` hook is synchronous so it cannot await a
 * ticket, and a reconnect would reuse the client id, which the broker wants fresh per connection (docs/MQTT.md "Reconnecting").
 */
export class MqttLink {
  clientId: string | null = null;
  config: RealtimeConfig | null = null;
  private status: Status = 'idle';
  private client: MqttLike | null = null;
  private listeners = new Set<LinkListener>();
  private roster = new Map<string, PresenceUser>();
  private attempt = 0;
  private authFails = 0;
  private everOpened = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stable: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private gen = 0;
  private connSeq = 0;
  private running = false;

  constructor(private o: LinkOptions) {}

  get connected(): boolean {
    return this.status === 'open';
  }
  get stopped(): boolean {
    return this.status === 'stopped';
  }
  get scope(): 'file' | 'project' {
    return this.o.scope;
  }
  get fileId(): string | undefined {
    return this.o.fileId;
  }

  on(l: LinkListener): () => void {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private each(fn: (l: LinkListener) => void): void {
    for (const l of [...this.listeners]) {
      try {
        fn(l);
      } catch {
        /* a listener must not break the others */
      }
    }
  }

  /** open the connection (idempotent) */
  start(): void {
    if (this.running || this.status === 'stopped') return;
    this.running = true;
    void this.connectNow();
  }

  /** the browser is back online / the tab came back: try right now */
  reconnectNow(): void {
    if (!this.running || this.status === 'stopped' || this.status === 'open' || this.client) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.attempt = 0;
    void this.connectNow();
  }

  private presenceTopic(): string | null {
    return this.o.scope === 'file' && this.o.fileId && this.clientId ? topics.presence(this.o.fileId, this.clientId) : null;
  }

  private async credentials(): Promise<{ clientId: string; username: string; password: string }> {
    const nonce = newNonce();
    if (this.o.shareToken) return { clientId: `g.${nonce}`, username: 'share', password: this.o.shareToken };
    const mint = this.o.getTicket === undefined ? getTicketProvider() : this.o.getTicket;
    if (!this.o.userId || !mint) throw Object.assign(new Error('no credentials for the broker'), { status: 401 });
    return { clientId: `u${this.o.userId}.${nonce}`, username: 'ticket', password: await mint() };
  }

  private async connectNow(): Promise<void> {
    if (!this.running || this.status === 'stopped' || this.client) return;
    this.status = 'connecting';
    this.each((l) => l.onConnecting?.());
    const gen = ++this.gen;
    const stale = () => gen !== this.gen || this.status === 'stopped';
    let cfg: RealtimeConfig;
    let creds: { clientId: string; username: string; password: string };
    try {
      const c = this.o.config;
      cfg = this.config ?? (typeof c === 'function' ? await c() : (c ?? (await loadRealtimeConfig(this.o.shareToken))));
      this.config = cfg;
      creds = await this.credentials(); // a NEW single-use ticket for every attempt
    } catch (e) {
      if (stale()) return;
      if ((e as { status?: number })?.status === 401) return this.endSession(401);
      return this.scheduleReconnect();
    }
    if (stale()) return;
    const clientId = creds.clientId;
    const opts: MqttConnectOptions = {
      protocolVersion: 5,
      clean: true,
      keepalive: this.o.keepaliveSec ?? 30,
      clientId,
      username: creds.username,
      password: creds.password,
      reconnectPeriod: 0,
      connectTimeout: 15_000,
      resubscribe: false,
      ...(this.o.scope === 'file' && this.o.fileId ? { will: { topic: topics.presence(this.o.fileId, clientId), payload: '', qos: 1 as const, retain: false as const } } : {}),
    };
    let client: MqttLike;
    try {
      client = await (this.o.connect ?? globalConnect ?? defaultConnect)(brokerUrl(cfg, this.o.url ?? getBrokerUrlOverride()), opts);
    } catch {
      if (stale()) return;
      return this.scheduleReconnect();
    }
    if (stale()) {
      client.end(true);
      return;
    }
    const seq = ++this.connSeq;
    const live = () => this.client === client && seq === this.connSeq;
    this.client = client;
    this.clientId = clientId;
    let opened = false;
    let lastErr: unknown = null;
    client.on('connect', (() => {
      if (!live() || opened) return;
      opened = true;
      void this.onConnected(client, clientId, seq);
    }) as never);
    client.on('message', ((topic: string, payload: Uint8Array, packet?: { properties?: { userProperties?: Record<string, string | string[]> } }) => {
      if (!live()) return;
      const raw = packet?.properties?.userProperties?.origin;
      this.onMessage(topic, payload, Array.isArray(raw) ? raw[0] : raw);
    }) as never);
    client.on('error', ((e: unknown) => {
      lastErr = e;
    }) as never);
    client.on('close', (() => {
      if (!live()) return;
      this.client = null;
      this.afterDrop(opened, lastErr);
    }) as never);
  }

  private async onConnected(client: MqttLike, clientId: string, seq: number): Promise<void> {
    const live = () => this.client === client && seq === this.connSeq && this.status !== 'stopped';
    this.roster.clear();
    this.authFails = 0;
    const base: [string, 0 | 1][] =
      this.o.scope === 'file' && this.o.fileId
        ? [[topics.fileEvents(this.o.fileId), 1], [topics.fileRoster(this.o.fileId), 0]]
        : this.o.projectId
          ? [[topics.projectEvents(this.o.projectId), 1], [topics.projectRoster(this.o.projectId), 0]]
          : [];
    let denied: string[] = [];
    try {
      denied = await this.subscribe(base);
    } catch {
      return; // dropped while subscribing: 'close' follows
    }
    if (!live()) return;
    if (denied.length) {
      // "gone or no access": confirm over REST before giving up
      const gone = await (this.o.checkGone?.() ?? Promise.resolve(false)).catch(() => false);
      if (!live()) return;
      if (gone) return this.finish(4404);
    }
    this.status = 'open';
    const reconnect = this.everOpened;
    this.everOpened = true;
    if (this.stable) clearTimeout(this.stable);
    this.stable = setTimeout(() => {
      this.attempt = 0; // it stayed up: the next drop starts the backoff over
    }, this.o.stableMs ?? 30_000);
    this.startPresence();
    this.each((l) => l.onOpen?.({ clientId, reconnect }));
  }

  private startPresence(): void {
    this.stopBeat();
    if (!this.presenceTopic()) return;
    const send = () => {
      const t = this.presenceTopic();
      if (t && this.connected) this.client?.publish(t, JSON.stringify({ ts: Date.now() }), { qos: 0 });
    };
    send(); // immediately after every (re)connect
    this.beat = setInterval(send, this.config?.presenceEveryMs ?? 30_000);
  }
  private stopBeat(): void {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
  }

  private afterDrop(opened: boolean, err: unknown): void {
    this.stopBeat();
    if (this.stable) clearTimeout(this.stable);
    this.stable = null;
    this.roster.clear();
    if (this.status === 'stopped') return;
    this.status = 'connecting';
    this.each((l) => l.onClose?.()); // also for an attempt that never got through: the listeners say "offline" until the next try
    const code = (err as { code?: number } | null)?.code;
    if (!opened && typeof code === 'number' && AUTH_REFUSED.has(code)) {
      // the ticket was refused: fetch a new one once; if that fails too the session is over
      if (++this.authFails >= 2) return this.endSession(401);
      this.attempt = 0;
      void this.connectNow();
      return;
    }
    this.scheduleReconnect();
  }

  /** full-jitter exponential backoff: random(0, min(max, base * 2^attempt)) */
  private scheduleReconnect(): void {
    if (this.status === 'stopped' || !this.running) return;
    this.status = 'connecting';
    const cap = Math.min(this.o.maxDelayMs ?? 30_000, (this.o.baseDelayMs ?? 1000) * 2 ** this.attempt++);
    const delay = (this.o.random ?? Math.random)() * cap;
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connectNow();
    }, delay);
  }

  private onMessage(topic: string, payload: Uint8Array, origin: string | undefined): void {
    const f = this.o.fileId;
    const p = this.o.projectId;
    const isEvents = this.o.scope === 'file' ? !!f && topic === topics.fileEvents(f) : !!p && topic === topics.projectEvents(p);
    if (isEvents) {
      if (origin && origin === this.clientId) return; // my own REST call echoed back
      let ev: LinkEvent;
      try {
        ev = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (!ev || typeof ev.type !== 'string') return;
      if (ev.type === 'ctl') {
        if (ev.code === 4404) return this.finish(4404);
        if (ev.code === 1012) this.each((l) => l.onRestart?.());
      }
      this.each((l) => l.onEvent?.(ev, origin));
      return;
    }
    const parts = topic.split('/');
    const rosterKind = this.o.scope === 'file' ? (f && topic.startsWith(`dg/f/${f}/roster/`) ? 'file' : null) : p && topic.startsWith(`dg/p/${p}/roster/`) ? 'project' : null;
    if (rosterKind) {
      const cid = parts[parts.length - 1]!;
      if (payload.byteLength === 0) this.roster.delete(cid);
      else {
        try {
          const e = JSON.parse(new TextDecoder().decode(payload)) as PresenceUser;
          this.roster.set(cid, { clientId: e.clientId ?? cid, userId: e.userId ?? null, name: e.name ?? '', role: e.role ?? '', ...(e.fileId !== undefined ? { fileId: e.fileId } : {}) });
        } catch {
          return;
        }
      }
      const users = [...this.roster.values()];
      this.each((l) => l.onRoster?.(users));
      return;
    }
    this.each((l) => l.onMessage?.(topic, payload, origin));
  }

  /** subscribe and wait for the SUBACK; resolves with the topics the broker refused (reason 0x87) */
  subscribe(list: [string, 0 | 1][]): Promise<string[]> {
    const client = this.client;
    if (!client || !list.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const map: Record<string, { qos: 0 | 1 }> = {};
      for (const [t, qos] of list) map[t] = { qos };
      client.subscribe(map, (err, packet) => {
        const granted = (packet as { granted?: number[] } | undefined)?.granted;
        if (Array.isArray(granted)) {
          const names = Object.keys(map);
          return resolve(names.filter((_, i) => ((granted[i] ?? 0) & 0x80) !== 0));
        }
        if (err) return reject(err);
        resolve([]);
      });
    });
  }

  /** false when not connected. `cb` gets the PUBACK result (reason code 0x87 = refused). */
  publish(topic: string, payload: string | Uint8Array, opts: PublishOpts, cb?: (err?: { code?: number } | null) => void): boolean {
    const client = this.client;
    if (!client || this.status !== 'open') return false;
    const withOrigin: PublishOpts = opts;
    try {
      client.publish(topic, payload, withOrigin, (err, pkt) => {
        const rc = (pkt as { reasonCode?: number } | undefined)?.reasonCode;
        cb?.(err ? (err as { code?: number }) : rc && rc >= 128 ? { code: rc } : null);
      });
      return true;
    } catch {
      return false;
    }
  }

  /** tell the room I left (empty presence, QoS 1) without closing: the Will does not fire on a clean DISCONNECT, and `pagehide` may be a bfcache stop */
  leave(): void {
    const t = this.presenceTopic();
    if (t && this.connected) this.client?.publish(t, '', { qos: 1 });
  }

  /** a refused subscription of a file: is it gone? (REST confirmation) -> final 4404 */
  async confirmGone(): Promise<boolean> {
    const gone = await (this.o.checkGone?.() ?? Promise.resolve(false)).catch(() => false);
    if (gone && !this.stopped) this.finish(4404);
    return gone;
  }

  private teardown(clean: boolean): void {
    this.gen++;
    if (this.retry) clearTimeout(this.retry);
    if (this.stable) clearTimeout(this.stable);
    this.retry = this.stable = null;
    this.stopBeat();
    const c = this.client;
    this.client = null;
    this.connSeq++;
    if (c) {
      try {
        if (clean) {
          const t = this.presenceTopic();
          if (t && this.status === 'open') c.publish(t, '', { qos: 1 });
          c.end(false);
        } else c.end(true);
      } catch {
        /* closing */
      }
    }
  }

  /** final server answer (4404): stop for good and tell the listeners */
  private finish(code: number): void {
    if (this.status === 'stopped') return;
    const wasOpen = this.status === 'open';
    this.teardown(true);
    this.status = 'stopped';
    this.running = false;
    this.roster.clear();
    if (wasOpen) this.each((l) => l.onClose?.());
    this.each((l) => l.onFatal?.(code));
  }
  private endSession(code: number): void {
    this.finish(code);
  }

  /** disconnect for good (publishes the empty presence first) */
  close(): void {
    if (this.status === 'stopped') {
      this.listeners.clear();
      return;
    }
    const wasOpen = this.status === 'open';
    this.teardown(true);
    this.status = 'stopped';
    this.running = false;
    this.roster.clear();
    if (wasOpen) this.each((l) => l.onClose?.());
    this.listeners.clear();
  }
}
