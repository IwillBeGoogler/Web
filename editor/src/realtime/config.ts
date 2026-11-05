import { api } from '../api/api';

/** `GET <api>/realtime/config` */
export interface RealtimeConfig {
  wsPath: string;
  collab: boolean;
  presenceEveryMs: number;
  awarenessMaxPerSec: number;
}
export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = { wsPath: '/mqtt', collab: true, presenceEveryMs: 30_000, awarenessMaxPerSec: 15 };

export function normalizeConfig(raw: unknown): RealtimeConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RealtimeConfig, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
  const d = DEFAULT_REALTIME_CONFIG;
  return {
    wsPath: typeof r.wsPath === 'string' && r.wsPath ? r.wsPath : d.wsPath,
    collab: typeof r.collab === 'boolean' ? r.collab : d.collab,
    presenceEveryMs: num(r.presenceEveryMs, d.presenceEveryMs),
    awarenessMaxPerSec: num(r.awarenessMaxPerSec, d.awarenessMaxPerSec),
  };
}

let cached: Promise<RealtimeConfig> | null = null;
/** the broker config of this API (fetched once; a failure falls back to the documented defaults and is retried next time) */
export function loadRealtimeConfig(shareToken?: string | null): Promise<RealtimeConfig> {
  if (cached) return cached;
  const p = api
    .realtimeConfig(shareToken)
    .then(normalizeConfig)
    .catch(() => {
      if (cached === p) cached = null;
      return DEFAULT_REALTIME_CONFIG;
    });
  cached = p;
  return p;
}
export const resetRealtimeConfigCache = (): void => {
  cached = null;
};

/** `ws(s)://<current host><wsPath>`; an absolute `wsPath` or the host's explicit `override` wins */
export function brokerUrl(cfg: Pick<RealtimeConfig, 'wsPath'>, override?: string | null, loc: { protocol: string; host: string } = window.location): string {
  if (override) return override;
  if (/^wss?:\/\//.test(cfg.wsPath)) return cfg.wsPath;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${cfg.wsPath.startsWith('/') ? '' : '/'}${cfg.wsPath}`;
}

/** the host's explicit broker URL (embed prop `mqttUrl`); default = same origin `wsPath` */
let urlOverride: string | null = null;
export const setBrokerUrlOverride = (u: string | null): void => {
  urlOverride = u;
};
export const getBrokerUrlOverride = (): string | null => urlOverride;
