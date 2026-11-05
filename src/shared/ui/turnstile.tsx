import { useEffect, useRef } from "react";
import { useLang } from "@/shared/i18n";
import { useDark } from "@/shared/ui/theme";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.append(s);
  });
  return loading;
}

/** Cloudflare Turnstile widget; onToken("") when the token expires or fails. */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const lang = useLang();
  const dark = useDark();
  useEffect(() => {
    let id: string | undefined;
    let api: TurnstileApi | undefined;
    let gone = false;
    loadTurnstile()
      .then((t) => {
        if (gone || !ref.current) return;
        api = t;
        id = t.render(ref.current, {
          sitekey: siteKey,
          language: lang,
          theme: dark ? "dark" : "light",
          callback: (tok: string) => cb.current(tok),
          "expired-callback": () => cb.current(""),
          "error-callback": () => cb.current(""),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (api && id) api.remove(id);
    };
  }, [siteKey, lang, dark]);
  return <div ref={ref} className="min-h-[65px]" />;
}
