import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useToken } from "@/contexts/identity/application/session";
import { engagementRepository } from "../infrastructure/engagementRepository";

/** Opens an SSE stream and calls `onEvent` per message; reconnects with backoff. */
function useEventStream(url: (() => Promise<string>) | null, onEvent: () => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!url || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let stopped = false;
    let delay = 2000;
    let timer: ReturnType<typeof setTimeout>;
    const open = async () => {
      try {
        es = new EventSource(await url());
        es.onmessage = () => handler.current();
        es.onopen = () => {
          delay = 2000;
        };
        es.onerror = () => {
          es?.close();
          if (!stopped) {
            delay = Math.min(delay * 2, 60_000);
            timer = setTimeout(open, delay);
          }
        };
      } catch {
        if (!stopped) {
          delay = Math.min(delay * 2, 60_000);
          timer = setTimeout(open, delay);
        }
      }
    };
    void open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [url]);
}

const ticketUrl = async () => `/api/me/notifications/stream?ticket=${encodeURIComponent(await engagementRepository.streamTicket())}`;

/** Live notifications for the signed-in reader (single-use ticket, never the token). */
export function useLiveNotifications() {
  const qc = useQueryClient();
  const token = useToken();
  useEventStream(token ? ticketUrl : null, () => void qc.invalidateQueries({ queryKey: ["notifications"] }));
}

/** Live responses while a story's responses are open. */
export function useLiveComments(postId: number, enabled: boolean) {
  const qc = useQueryClient();
  const url = useMemo(() => (enabled ? async () => `/api/posts/${postId}/comments/stream` : null), [postId, enabled]);
  useEventStream(url, () => void qc.invalidateQueries({ queryKey: ["comments", postId] }));
}
