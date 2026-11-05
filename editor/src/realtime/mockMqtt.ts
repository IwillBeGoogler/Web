import type { MqttConnectFn, MqttConnectOptions, MqttLike, PublishOpts } from './link';

/** test double of an mqtt.js client (no broker, no network): records what the code under test does, tests drive the rest */
export class MockMqttClient implements MqttLike {
  connected = false;
  ended = false;
  subs: string[] = [];
  published: { topic: string; payload: Uint8Array; text: string; opts: PublishOpts }[] = [];
  /** topics the broker refuses with SUBACK 0x87 */
  denyTopics = new Set<string>();
  /** PUBACK 0x87 for publishes to these topics */
  denyPublish = new Set<string>();
  private handlers = new Map<string, ((...a: never[]) => void)[]>();
  constructor(public url: string, public opts: MqttConnectOptions) {}

  on(event: string, fn: (...a: never[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const f of this.handlers.get(event) ?? []) (f as (...a: unknown[]) => void)(...args);
  }
  subscribe(map: Record<string, { qos: 0 | 1 | 2 }>, cb: (err?: Error | null, packet?: unknown) => void): this {
    const names = Object.keys(map);
    this.subs.push(...names);
    queueMicrotask(() => {
      const granted = names.map((t) => (this.denyTopics.has(t) ? 135 : map[t]!.qos));
      cb(granted.some((g) => g >= 128) ? Object.assign(new Error('Subscribe error: Not authorized'), { code: 135 }) : null, { granted });
    });
    return this;
  }
  publish(topic: string, payload: string | Uint8Array, opts: PublishOpts, cb?: (err?: Error | null, packet?: unknown) => void): this {
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    this.published.push({ topic, payload: bytes, text: typeof payload === 'string' ? payload : '', opts });
    this.onPublish(topic, bytes, opts, cb);
    return this;
  }
  /** subclass hook (the fake server routes here) */
  protected onPublish(topic: string, _payload: Uint8Array, _opts: PublishOpts, cb?: (err?: Error | null, packet?: unknown) => void): void {
    queueMicrotask(() => {
      if (this.denyPublish.has(topic)) cb?.(Object.assign(new Error('Publish error: Not authorized'), { code: 135 }), { reasonCode: 135 });
      else cb?.(null, {});
    });
  }
  end(_force?: boolean, _o?: unknown, cb?: () => void): this {
    if (!this.ended) {
      this.ended = true;
      this.connected = false;
      queueMicrotask(() => this.emit('close'));
    }
    cb?.();
    return this;
  }

  // ---- test drivers ----
  connack(): void {
    this.connected = true;
    this.emit('connect', {});
  }
  /** the broker sends a message (`origin` = the MQTT 5 user property) */
  message(topic: string, payload: string | Uint8Array | object, origin?: string): void {
    const bytes = ArrayBuffer.isView(payload) ? (payload as Uint8Array) : new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
    this.emit('message', topic, bytes, origin ? { properties: { userProperties: { origin } } } : {});
  }
  /** the connection dies (network, broker restart) */
  drop(): void {
    if (this.ended) return;
    this.ended = true;
    this.connected = false;
    this.emit('close');
  }
  /** CONNACK refused (0x86 bad credentials / 0x87 not authorized) */
  refuse(code: number): void {
    this.emit('error', Object.assign(new Error('Connection refused'), { code }));
    this.drop();
  }
  sentOn(prefix: string): MockMqttClient['published'] {
    return this.published.filter((p) => p.topic.startsWith(prefix));
  }
}

export interface MockMqtt {
  connect: MqttConnectFn;
  clients: MockMqttClient[];
  /** CONNACK right after the connect (default true) */
  auto: boolean;
  last(): MockMqttClient;
}
/** a connect function for `MqttLink` / `setMqttConnect`; every call yields a new `MockMqttClient` */
export function createMockMqtt(make: (url: string, opts: MqttConnectOptions) => MockMqttClient = (u, o) => new MockMqttClient(u, o)): MockMqtt {
  const m: MockMqtt = {
    clients: [],
    auto: true,
    last: () => m.clients[m.clients.length - 1]!,
    connect: (url, opts) => {
      const c = make(url, opts);
      m.clients.push(c);
      // like the network: the CONNACK comes after the caller attached its handlers (the link awaits the connect function)
      if (m.auto) queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => !c.ended && c.connack())));
      return c;
    },
  };
  return m;
}
