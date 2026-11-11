import type { z } from "zod";
import { ApiError, ContractError, NetworkError, problemSchema } from "./problem";
import type { TokenStore } from "./tokenStore";

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

const refreshSchema = { token: "", expires_at: "" };

/**
 * createHttpClient: JSON over fetch with Bearer auth, Accept-Language, RFC 9457
 * errors and Zod-validated responses. A 401 on an authenticated call triggers
 * one shared POST /auth/refresh (the token rotates) and a single retry. The
 * server refreshes only a session that is still valid, so this does not bring
 * back one that ran out (SESSION_IDLE_TIMEOUT / SESSION_ABSOLUTE_TIMEOUT on
 * the API): it covers a token that another tab or device rotated meanwhile.
 */
export const createHttpClient = (cfg: HttpClientConfig): HttpClient => {
  const base = cfg.baseUrl ?? "/api";
  const doFetch = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  // "ok": new token; "expired": server refused the session; "error": network/5xx, keep the session.
  let refreshing: Promise<"ok" | "expired" | "error"> | null = null;

  const refresh = (): Promise<"ok" | "expired" | "error"> => {
    refreshing ??= (async () => {
      const t = cfg.tokens.get();
      if (!t) return "expired";
      try {
        const r = await doFetch(`${base}/auth/refresh`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${t.token}` },
        });
        if (r.status === 401 || r.status === 403) {
          // another tab may have rotated the token meanwhile: keep the newer one
          const now = cfg.tokens.get();
          return now && now.token !== t.token ? "ok" : "expired";
        }
        if (!r.ok) return "error";
        const body = (await readBody(r)) as { data?: typeof refreshSchema } | null;
        if (!body?.data?.token) return "error";
        cfg.tokens.set({ token: body.data.token, expiresAt: body.data.expires_at });
        return "ok";
      } catch {
        return "error";
      }
    })().finally(() => {
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
