import { topics } from '../realtime/topics';
import type { LinkEvent, MqttLink } from '../realtime/link';

export interface PresenceUser {
  clientId: string;
  userId: string | null;
  name: string;
  role: string;
  /** project channel: the file this connection has open */
  fileId?: string | null;
}
/** `file.updated`: somebody saved a file */
export interface Updated {
  projectId?: string;
  fileId?: string;
  version: number;
  name?: string;
  updatedAt?: number;
  by?: { userId?: string; name?: string; share?: boolean };
  restored?: boolean;
}
/** `tree.updated`: folders / files were created, moved, renamed or deleted */
export interface TreeUpdated {
  projectId: string;
  rev: number;
  reason?: string;
  by?: { userId?: string; name?: string; share?: boolean };
}
export interface RealtimeEvents {
  /** every (re)connect, with this connection's client id (REST calls send it as `X-Client-Id`; version / tree rev come from REST) */
  onConnected?: (info: { clientId: string; reconnect: boolean }) => void;
  onTree?: (t: TreeUpdated) => void;
  onPresence?: (users: PresenceUser[]) => void;
  onUpdated?: (u: Updated) => void;
  onStatus?: (connected: boolean) => void;
  /** the connection is back after a drop: refetch, you may have missed updates (events are not queued) */
  onReconnected?: () => void;
  /** every event (comments, notifications, audio-room signaling, ctl ...); the typed callbacks above still fire first */
  onMessage?: (m: { type: string } & Record<string, unknown>) => void;
  /** the server ended the channel for good (4404: the file or project is gone, 401: the session ended): no reconnect */
  onFatalClose?: (code: number) => void;
}
export interface RealtimeOptions extends RealtimeEvents {
  /** the connection; the creator closes it (a file link is shared with the Yjs provider) */
  link: MqttLink;
}

/**
 * Project / file events, roster and audio-room signaling on top of an `MqttLink`: the typed callbacks of the old WebSocket client.
 * Events caused by this page's own REST calls (origin = my client id) never arrive. `close()` detaches; the link's owner closes it.
 */
export class Realtime {
  private off: (() => void) | null = null;
  private up = false;
  constructor(private o: RealtimeOptions) {}

  connect(): void {
    if (!this.off) {
      const link = this.o.link;
      this.off = link.on({
        onOpen: ({ clientId, reconnect }) => this.opened(clientId, reconnect),
        onClose: () => {
          if (this.up) this.o.onStatus?.(false);
          this.up = false;
        },
        onFatal: (code) => this.o.onFatalClose?.(code),
        onRoster: (users) => this.o.onPresence?.(users),
        onEvent: (m) => this.event(m),
        onMessage: (topic, payload) => {
          const l = this.o.link;
          if (!l.clientId || !l.fileId || topic !== topics.rtcInbox(l.fileId, l.clientId)) return;
          try {
            const m = JSON.parse(new TextDecoder().decode(payload)) as LinkEvent;
            if (typeof m.type === 'string') this.o.onMessage?.(m);
          } catch {
            /* malformed */
          }
        },
      });
    }
    const link = this.o.link;
    if (link.connected && link.clientId) this.opened(link.clientId, false); // the shared link is already up
    else link.start();
  }

  private opened(clientId: string, reconnect: boolean): void {
    const link = this.o.link;
    this.up = true;
    this.o.onStatus?.(true);
    this.o.onConnected?.({ clientId, reconnect });
    // audio-room inbox: the signaling that used to ride on the file socket
    if (link.scope === 'file' && link.fileId) void link.subscribe([[topics.rtcInbox(link.fileId, clientId), 1]]).catch(() => undefined);
    if (reconnect) this.o.onReconnected?.();
  }

  private event(m: LinkEvent): void {
    if (m.type === 'file.updated' && typeof m.version === 'number') this.o.onUpdated?.(m as unknown as Updated);
    else if (m.type === 'tree.updated' && typeof m.rev === 'number') this.o.onTree?.(m as unknown as TreeUpdated);
    this.o.onMessage?.(m);
  }

  /** publish an audio-room command (`rtc.join`, `rtc.signal` ...) on the file's rtc topic; false when not connected */
  send(msg: Record<string, unknown>): boolean {
    const l = this.o.link;
    if (l.scope !== 'file' || !l.fileId || !l.clientId) return false;
    return l.publish(topics.rtcUp(l.fileId, l.clientId), JSON.stringify(msg), { qos: 1 });
  }

  close(): void {
    this.off?.();
    this.off = null;
  }
}
