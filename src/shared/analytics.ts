import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { tokens } from "@/shared/api";
import { publicConfigQuery } from "@/shared/config";
import { consent, useConsent } from "@/shared/consent";
import { i18n } from "@/shared/i18n";

export type AnalyticsEvent = { name: "page_view"; path: string } | { name: "signup_open" } | { name: "read_time"; post_id: number; value: number };

const VISITOR_KEY = "iwillbegoogler.visitor";

/** Random id kept only after consent; dropped when consent is withdrawn. */
function visitorId(): string | null {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

consent.subscribe(() => {
  if (consent.get() !== "all")
    try {
      localStorage.removeItem(VISITOR_KEY);
    } catch {}
});

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

let gtmId = "";

/** Loads Google Tag Manager once; page views reach the container as dataLayer events from track(). */
function loadTagManager(id: string) {
  if (gtmId || typeof document === "undefined" || !/^GTM-[A-Z0-9]+$/.test(id)) return;
  gtmId = id;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
  document.head.append(s);
  pushPageView(location.pathname);
}

function pushPageView(path: string) {
  window.dataLayer?.push({ event: "page_view", page_path: path, page_location: location.href, page_title: document.title });
}

/** Turns Tag Manager on while the visitor has accepted "all" and the deployment sets GTM_CONTAINER_ID. */
export function useTagManager() {
  const id = useQuery(publicConfigQuery()).data?.gtm_container_id ?? "";
  const accepted = useConsent() === "all";
  useEffect(() => {
    if (accepted && id) loadTagManager(id);
  }, [accepted, id]);
}

let lastPath = "";

/** Sends one event to POST /api/events. Nothing leaves the browser without "all" consent. */
export function track(e: AnalyticsEvent, send: typeof fetch = (...a) => fetch(...a)) {
  if (consent.get() !== "all") return;
  if (e.name === "page_view") {
    if (e.path === lastPath) return; // search-param changes, re-renders
    lastPath = e.path;
  }
  if (gtmId && e.name === "page_view") pushPageView(e.path);
  const visitor = visitorId();
  if (!visitor) return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = tokens.get();
  if (tok) headers.Authorization = `Bearer ${tok.token}`;
  const body = JSON.stringify({
    ...e,
    visitor,
    lang: i18n.get(),
    referrer: e.name === "page_view" && typeof document !== "undefined" ? document.referrer : "",
  });
  // keepalive lets read_time leave with the closing tab.
  void send("/api/events", { method: "POST", headers, body, keepalive: true }).catch(() => {});
}

/** Test hook. */
export const resetTracking = () => {
  lastPath = "";
  gtmId = "";
};

/**
 * Counts seconds the reader actually spends on a post (tab visible) and
 * reports them when the tab hides or the reader leaves the page.
 */
export function useReadTime(postId: number | undefined) {
  useEffect(() => {
    if (!postId) return;
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    let total = 0;
    const pause = () => {
      if (since) total += Date.now() - since;
      since = 0;
    };
    const flush = () => {
      pause();
      const value = Math.round(total / 1000);
      total = 0;
      if (value >= 3) track({ name: "read_time", post_id: postId, value });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [postId]);
}
