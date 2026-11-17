import type { z } from "zod";
import { ApiError, ContractError, NetworkError, problemSchema } from "./problem";
import { storedFrom, type TokenStore } from "./tokenStore";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions<S extends z.ZodType | undefined> {
  method?: Method;
  body?: unknown;
  query?: Query;
  schema?: S;
  signal?: AbortSignal | undefined;
  /** Abort the request after this many ms (uploads). */
  timeoutMs?: number;
  /** Skip the refresh-and-retry dance (auth endpoints). */
  noRefresh?: boolean;
  /** Resolve with the body as a Blob (downloads); errors are still parsed as JSON. */
  blob?: boolean;
}

export interface HttpClientConfig {
  baseUrl?: string;
  tokens: TokenStore;
  locale: () => string;
  /** Called once the session is gone for good (refresh failed). */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}

export type HttpClient = <S extends z.ZodType | undefined = undefined>(
  path: string,
  opts?: RequestOptions<S>,
) => Promise<S extends z.ZodType ? z.output<S> : unknown>;

export const buildQuery = (q?: Query) => {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const readBody = async (r: Response): Promise<unknown> => {
  if (r.status === 204) return null;
  const text = await r.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { title: text };
  }
};

const refreshSchema = { access_token: "", token: "", expires_at: "", refresh_token: "", refresh_expires_at: "" };

/** Runs fn under a cross-tab lock when the browser has one (Web Locks), so tabs never rotate the refresh token at once. */
const withTabLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? (locks.request("auth-refresh", fn) as Promise<T>) : fn();
};

/**
 * createHttpClient: JSON over fetch with Bearer auth, Accept-Language, RFC 9457
 * errors and Zod-validated responses. The access token (ACCESS_TOKEN_TTL on
 * the API, 3 hours) is short-lived; the refresh token (30 days) is kept next
 * to it in localStorage. A 401 on an authenticated call triggers one shared
 * POST /auth/refresh (both tokens rotate) and a single retry. Tabs take turns
 * refreshing; a tab that waited uses the pair the other one stored.
 */
export const createHttpClient = (cfg: HttpClientConfig): HttpClient => {
  const base = cfg.baseUrl ?? "/api";
  const doFetch = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  // "ok": new token; "expired": server refused the session; "error": network/5xx, keep the session.
  let refreshing: Promise<"ok" | "expired" | "error"> | null = null;

  const refresh = (): Promise<"ok" | "expired" | "error"> => {
    const asked = cfg.tokens.get()?.refreshToken;
    refreshing ??= withTabLock(async (): Promise<"ok" | "expired" | "error"> => {
      const before = cfg.tokens.get();
      // another tab refreshed while this one waited for the lock (storage event): use its pair
      if (before?.refreshToken && asked && before.refreshToken !== asked) return "ok";
      try {
        if (!before?.refreshToken) return "expired";
        const r = await doFetch(`${base}/auth/refresh`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: before.refreshToken }),
        });
        if (r.status === 401 || r.status === 403) {
          // a sign-in elsewhere may have left a newer token meanwhile: keep it
          const now = cfg.tokens.get();
          return now && now.token !== before?.token ? "ok" : "expired";
        }
        if (!r.ok) return "error";
        const body = (await readBody(r)) as { data?: Partial<typeof refreshSchema> } | null;
        const d = body?.data;
        const token = d?.access_token || d?.token;
        if (!token) return "error";
        cfg.tokens.set(storedFrom({ ...d, token, expires_at: d?.expires_at ?? "" }));
        return "ok";
      } catch {
        return "error";
      }
    }).finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  const send = async (path: string, opts: RequestOptions<z.ZodType | undefined>) => {
    const headers: Record<string, string> = { Accept: "application/json", "Accept-Language": cfg.locale() };
    const t = cfg.tokens.get();
    if (t) headers.Authorization = `Bearer ${t.token}`;
    const form = typeof FormData !== "undefined" && opts.body instanceof FormData;
    if (opts.body !== undefined && !form) headers["Content-Type"] = "application/json";
    const signal = opts.timeoutMs ? AbortSignal.any([...(opts.signal ? [opts.signal] : []), AbortSignal.timeout(opts.timeoutMs)]) : (opts.signal ?? null);
    try {
      return await doFetch(`${base}${path}${buildQuery(opts.query)}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? null : form ? (opts.body as FormData) : JSON.stringify(opts.body),
        signal,
      });
    } catch (e) {
      // aborts and timeouts are the caller's doing, not a network failure
      if (e instanceof DOMException || !(e instanceof TypeError)) throw e;
      throw new NetworkError(requestInfo(path, opts), e);
    }
  };

  const requestInfo = (path: string, opts: RequestOptions<z.ZodType | undefined>) => ({
    method: opts.method ?? "GET",
    path: `${base}${path}`.split(/[?#]/)[0] ?? "",
  });

  return (async (path: string, opts: RequestOptions<z.ZodType | undefined> = {}) => {
    const hadToken = cfg.tokens.get() !== null;
    let r = await send(path, opts);
    if (r.status === 401 && hadToken && !opts.noRefresh) {
      const res = await refresh();
      if (res === "ok") r = await send(path, opts);
      else if (res === "expired") {
        cfg.tokens.set(null);
        cfg.onSessionExpired?.();
      }
    }
    if (opts.blob && r.ok) return r.blob();
    const body = await readBody(r);
    if (!r.ok) {
      const p = problemSchema.safeParse(body ?? {});
      throw new ApiError(r.status, p.success ? p.data : {}, requestInfo(path, opts));
    }
    if (!opts.schema) return body;
    const parsed = opts.schema.safeParse(body);
    if (!parsed.success) throw new ContractError(path, parsed.error.issues);
    return parsed.data;
  }) as HttpClient;
};
