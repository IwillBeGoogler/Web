import { pageAddress } from "@/contexts/engagement/domain/feedback";
import { ApiError, NetworkError } from "@/shared/http";

/**
 * Automatic reports of unexpected JavaScript errors (POST /api/client-errors).
 * Sends only message, stack, page address without query and browser type: no account, no cookies,
 * no auth header, no form or DOM content. It never throws, never toasts and never reports itself.
 */

const MAX_SENDS = 10;
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;

const EXTENSION_FRAME = /(?:chrome|moz|safari)-extension:\/\//;
const FRAME_LINE = /^\s*at\s|@|:\/\//;

type Send = (input: string, init: RequestInit) => Promise<unknown> | undefined;

export interface ReportDeps {
  /** Replaces fetch and turns sending on outside production builds (tests). */
  send?: Send;
}

const seen = new Set<string>();
let sent = 0;
let installed = false;

/** Clears the per-page limits; for tests. */
export function resetErrorReporting() {
  seen.clear();
  sent = 0;
}

/** First layer of scrubbing; the server scrubs again. Emails, tokens and URL query strings go. */
export function scrub(s: string): string {
  return s
    .replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>)?#]*[?#][^\s"'<>)]*/g, (u) => u.slice(0, u.search(/[?#]/)) + (u.match(/(?::\d+){1,2}$/)?.[0] ?? ""))
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, (m) => (/\d/.test(m) ? "[redacted]" : m));
}

function describe(e: unknown): { name: string; message: string; stack: string } {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack ?? "" };
  if (typeof e === "string") return { name: "", message: e, stack: "" };
  if (e && typeof e === "object") {
    const o = e as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof o.name === "string" ? o.name : "",
      message: typeof o.message === "string" ? o.message : "",
      stack: typeof o.stack === "string" ? o.stack : "",
    };
  }
  return { name: "", message: "", stack: "" };
}

/** Errors that are not bugs worth a report. */
function isNoise(e: unknown, d: { name: string; message: string; stack: string }): boolean {
  if (!d.message.trim()) return true;
  if (e instanceof ApiError || e instanceof NetworkError) return true; // the server and the toast already show these
  if (d.name === "AbortError" || /^AbortError\b/.test(d.message)) return true;
  if (/ResizeObserver loop/.test(d.message)) return true;
  if (/^Script error\.?$/.test(d.message.trim()) && !d.stack) return true;
  const frames = d.stack.split("\n").filter((l) => l.includes("://"));
  return frames.length > 0 && frames.every((l) => EXTENSION_FRAME.test(l));
}

function dedupeKey(message: string, stack: string): string {
  const lines = stack.split("\n").filter((l) => l.trim());
  return `${message}\n${(lines.find((l) => FRAME_LINE.test(l)) ?? lines[0] ?? "").trim()}`;
}

/** Reports an unexpected error once per page session, at most 10 times. Never throws. */
export function reportError(error: unknown, deps: ReportDeps = {}): void {
  try {
    if (!deps.send && !import.meta.env.PROD) return;
    const d = describe(error);
    if (isNoise(error, d)) return;
    const key = dedupeKey(d.message, d.stack);
    if (seen.has(key) || sent >= MAX_SENDS) return;
    seen.add(key);
    sent++;
    const body = JSON.stringify({
      message: scrub(d.message).slice(0, MAX_MESSAGE),
      stack: scrub(d.stack).slice(0, MAX_STACK),
      page_url: pageAddress(location.href),
      user_agent: navigator.userAgent,
    });
    const send: Send = deps.send ?? ((url, init) => fetch(url, init));
    // No auth header and no cookies: this cannot start the 401 refresh flow and says nothing about who you are.
    void Promise.resolve(
      send("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "omit" }),
    ).catch(() => {});
  } catch {
    // reporting must never break the app
  }
}

/** Listens for uncaught errors and unhandled promise rejections; call once at startup. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason));
}
