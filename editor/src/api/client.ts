/** fetch wrapper for the backend (`docs/backend.md`): cookies, CSRF, typed errors, request ids, timeout, retry. */

export class ApiError extends Error {
  readonly name = 'ApiError';
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
  /** no HTTP response at all (offline, DNS, CORS, timeout) */
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isConflict(): boolean {
    return this.status === 412 && this.code === 'VERSION_CONFLICT';
  }
  /** version the server holds now (412 details) */
  get currentVersion(): number | undefined {
    const v = (this.details as { currentVersion?: unknown } | undefined)?.currentVersion;
    return typeof v === 'number' ? v : undefined;
  }
  /** the server's current version came from a restore (412 details): never save a stale copy over it */
  get currentRestored(): boolean {
    return (this.details as { restored?: unknown } | undefined)?.restored === true;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const IDEMPOTENT = new Set<Method>(['GET', 'HEAD', 'PUT', 'DELETE']);
const TRANSIENT_STATUS = new Set([502, 503, 504]);

/**
 * Retry only transport failures (network / timeout) and 502-504, never 4xx. Non-idempotent requests (POST/PATCH) are not
 * repeated unless the caller says it is safe, because the first attempt may have reached the server.
 */
export function isRetryable(method: Method, err: ApiError, force = false): boolean {
  if (!force && !IDEMPOTENT.has(method)) return false;
  return err.isNetwork || TRANSIENT_STATUS.has(err.status);
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** extra attempts after the first (default 2) */
  retries?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  readCookie?: (name: string) => string | undefined;
  /** MQTT client id of the open file's connection, sent as X-Client-Id so own saves are not echoed */
  clientId?: () => string | undefined;
  onUnauthorized?: () => void;
  uuid?: () => string;
  /** extra headers on every request (an embedding host adds its `Authorization: Bearer` here) */
  headers?: () => Record<string, string | undefined>;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  ifMatch?: number;
  /** let the request outlive the page (tab close): only honoured for bodies under the 64 KB keepalive quota */
  keepalive?: boolean;
  timeoutMs?: number;
  retries?: number;
  /** allow retrying a non-idempotent request */
  retry?: boolean;
  as?: 'json' | 'blob' | 'text';
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  /** numeric version from the ETag header */
  etag: number | null;
}

const defaultCookie = (name: string): string | undefined => {
  try {
    const m = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
  } catch {
    return undefined;
  }
};
const defaultUuid = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export class ApiClient {
  csrfToken: string | null = null;
  private o: Required<Pick<ApiClientOptions, 'baseUrl' | 'timeoutMs' | 'retries' | 'backoffMs'>> & ApiClientOptions;

  constructor(opts: ApiClientOptions = {}) {
    this.o = { baseUrl: '/api', timeoutMs: 15000, retries: 2, backoffMs: 400, ...opts };
  }

  private get fetchImpl(): FetchLike {
    return this.o.fetch ?? ((u, i) => globalThis.fetch(u, i));
  }
  private sleep(ms: number) {
    return (this.o.sleep ?? ((n: number) => new Promise<void>((r) => setTimeout(r, n))))(ms);
  }
  get baseUrl(): string {
    return this.o.baseUrl;
  }
  /** re-point the client after construction (embedding: the host picks the API base, auth headers and 401 handler) */
  configure(patch: Pick<ApiClientOptions, 'baseUrl' | 'headers' | 'onUnauthorized'>): void {
    this.o = { ...this.o, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  }
  url(path: string, query?: RequestOptions['query']): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const s = qs.toString();
    return `${this.o.baseUrl}${path}${s ? `?${s}` : ''}`;
  }

  get = <T = unknown>(path: string, o?: RequestOptions) => this.send<T>('GET', path, o);
  post = <T = unknown>(path: string, json?: unknown, o?: RequestOptions) => this.send<T>('POST', path, { ...o, json });
  put = <T = unknown>(path: string, json?: unknown, o?: RequestOptions) => this.send<T>('PUT', path, { ...o, json });
  patch = <T = unknown>(path: string, json?: unknown, o?: RequestOptions) => this.send<T>('PATCH', path, { ...o, json });
  delete = <T = unknown>(path: string, o?: RequestOptions) => this.send<T>('DELETE', path, o);

  /** Re-read the CSRF token from the session (also refreshes the cookie). */
  async refreshCsrf(): Promise<void> {
    const r = await this.attempt<{ csrfToken?: string }>('GET', '/auth/me', {});
    if (r.data?.csrfToken) this.csrfToken = r.data.csrfToken;
  }

  async send<T = unknown>(method: Method, path: string, o: RequestOptions = {}): Promise<ApiResponse<T>> {
    const max = o.retries ?? this.o.retries;
    let csrfRetried = false;
    for (let n = 0; ; n++) {
      try {
        return await this.attempt<T>(method, path, o);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        if (e.status === 403 && e.code === 'CSRF_INVALID' && !csrfRetried && method !== 'GET') {
          csrfRetried = true;
          try {
            await this.refreshCsrf();
          } catch {
            throw e;
          }
          n--; // the refresh is not a retry attempt
          continue;
        }
        if (n < max && isRetryable(method, e, o.retry)) {
          await this.sleep(this.o.backoffMs * 2 ** n);
          continue;
        }
        if (e.isUnauthorized && !path.startsWith('/auth/')) this.o.onUnauthorized?.();
        throw e;
      }
    }
  }

  private async attempt<T>(method: Method, path: string, o: RequestOptions): Promise<ApiResponse<T>> {
    const headers = new Headers(o.headers);
    for (const [k, v] of Object.entries(this.o.headers?.() ?? {})) if (v && !headers.has(k)) headers.set(k, v);
    headers.set('x-request-id', (this.o.uuid ?? defaultUuid)());
    if (o.json !== undefined) headers.set('content-type', 'application/json');
    if (o.ifMatch !== undefined) headers.set('if-match', `"${o.ifMatch}"`);
    const cid = this.o.clientId?.();
    if (cid) headers.set('x-client-id', cid);
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = this.csrfToken ?? (this.o.readCookie ?? defaultCookie)('sdd_csrf');
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, o.timeoutMs ?? this.o.timeoutMs);
    o.signal?.addEventListener('abort', () => ctl.abort());
    let res: Response;
    try {
      const body = o.json !== undefined ? JSON.stringify(o.json) : o.body;
      res = await this.fetchImpl(this.url(path, o.query), {
        method,
        headers,
        credentials: 'include',
        signal: ctl.signal,
        body,
        ...(o.keepalive && typeof body === 'string' && body.length < 60_000 ? { keepalive: true } : {}),
      });
    } catch (e) {
      clearTimeout(timer);
      if (timedOut) throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond');
      if ((e as { name?: string })?.name === 'AbortError') throw new ApiError(0, 'ABORTED', 'Request cancelled');
      throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message || 'Network error' : 'Network error');
    }
    clearTimeout(timer);
    if (!res.ok) throw await this.toError(res);
    let data: unknown;
    if (res.status !== 204) {
      try {
        if (o.as === 'blob') data = await res.blob();
        else if (o.as === 'text') data = await res.text();
        else if ((res.headers.get('content-type') ?? '').includes('json')) data = await res.json();
        else data = await res.text();
      } catch {
        throw new ApiError(0, 'NETWORK', 'The response could not be read');
      }
    }
    const tag = /(\d+)/.exec(res.headers.get('etag') ?? '');
    return { data: data as T, status: res.status, headers: res.headers, etag: tag ? Number(tag[1]) : null };
  }

  private async toError(res: Response): Promise<ApiError> {
    let code = `HTTP_${res.status}`;
    let message = res.statusText || `Request failed (${res.status})`;
    let details: unknown;
    let requestId = res.headers.get('x-request-id') ?? undefined;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } };
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        details = body.error.details;
        requestId = body.error.requestId ?? requestId;
      }
    } catch {
      /* not JSON */
    }
    const ra = Number(res.headers.get('retry-after'));
    return new ApiError(res.status, code, message, details, requestId, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
}
