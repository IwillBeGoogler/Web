import type { MessageKey } from "@/shared/i18n";
import { ApiError, NetworkError } from "./problem";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export interface Explanation {
  /** What happened and what to do next, in the user's language. */
  text: string;
  /** Short reference code (from the server's request id) to quote to support. */
  ref: string | undefined;
  /** 5xx, network and unknown failures can be reported; the rest are the user's to fix. */
  reportable: boolean;
  /** Technical line for a bug report: status + endpoint path, never bodies, queries or stacks. */
  detail: string;
}

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_DETAIL = 300;
/** 401/403 codes whose server message is more exact than the status text: a wrong password is not an expired session. */
const SPECIFIC = new Set(["INVALID_CREDENTIALS", "EMAIL_NOT_VERIFIED"]);
const call = (r?: { method: string; path: string }) => (r ? ` ${r.method} ${r.path}` : "");

/**
 * explainError turns any failure into a full explanation. Server-provided messages of other 4xx
 * (400, 409, 422…) are kept as they are. "Not saved" is said only for a write the server refused
 * outright (401/403/404/429); after a 5xx or a lost connection nobody can know.
 */
export function explainError(e: unknown, t: T): Explanation {
  if (e instanceof NetworkError) {
    return { text: t("err.network"), ref: undefined, reportable: true, detail: `Network error${call(e.request)}` };
  }
  if (e instanceof ApiError) {
    const ref = e.requestId ? e.requestId.slice(0, 8) : undefined;
    const detail = `HTTP ${e.status}${call(e.request)}${e.requestId ? ` [request ${e.requestId}]` : ""}`;
    const refused = !!e.request && WRITE.has(e.request.method);
    const refusedNote = (key: MessageKey) => (refused ? `${t(key)} ${t("err.notSaved")}` : t(key));
    if (e.status >= 500) return { text: t("err.server"), ref, reportable: true, detail };
    if (e.code && SPECIFIC.has(e.code)) return { text: e.message, ref: undefined, reportable: false, detail };
    if (e.status === 401) return { text: refusedNote("err.session"), ref: undefined, reportable: false, detail };
    if (e.status === 403) return { text: refusedNote("err.forbidden"), ref: undefined, reportable: false, detail };
    if (e.status === 404) return { text: refusedNote("err.notFound"), ref: undefined, reportable: false, detail };
    if (e.status === 429) return { text: refusedNote("err.rateLimit"), ref: undefined, reportable: false, detail };
    // 400/409/422…: the server's own message says what to fix
    if (e.status >= 400 && e.message !== `HTTP ${e.status}`) return { text: e.message, ref: undefined, reportable: false, detail };
    return { text: t("err.unknown"), ref, reportable: true, detail };
  }
  const detail = (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, MAX_DETAIL);
  return { text: t("err.unknown"), ref: undefined, reportable: true, detail };
}
