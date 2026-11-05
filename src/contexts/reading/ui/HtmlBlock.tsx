import { PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/shared/i18n";
import { useReducedMotion } from "@/shared/motion";
import { clampLiveHeight } from "../domain/liveBlocks";

/** The static frame page (public/html-frame.html). nginx/Caddy serve it with its own sandbox CSP. */
export const FRAME_SRC = "/html-frame.html";

/** The only sandbox flag: scripts run, but in an opaque origin (no cookies, storage or access to this page), and the frame cannot navigate, pop up or submit. */
export const FRAME_SANDBOX = "allow-scripts";

/** How far outside the viewport a block still runs; farther off, its frame is removed so it cannot burn CPU. */
const NEAR = "600px 0px";

/** Is `el` within NEAR of the viewport? Without IntersectionObserver (old browsers, tests) it counts as near. */
function useNear(el: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!el.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setNear(entries.at(-1)?.isIntersecting ?? true), { rootMargin: NEAR });
    io.observe(el.current);
    return () => io.disconnect();
  }, [el]);
  return near;
}

/**
 * Author-written HTML/CSS/JS, run inside a sandboxed iframe. The markup is never put into this page's DOM: it goes to the frame
 * with postMessage once the frame has loaded, and nothing the frame sends is read.
 */
export function HtmlBlock({ html, height }: { html: string; height: number }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const near = useNear(box);
  const reduce = useReducedMotion();
  const [started, setStarted] = useState(false);
  const h = clampLiveHeight(height);
  const run = !reduce || started;
  return (
    <figure className="my-10">
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card"
        style={{ height: h }}
        data-live-block=""
      >
        {run && near ? (
          <iframe
            src={FRAME_SRC}
            sandbox={FRAME_SANDBOX}
            allow=""
            referrerPolicy="no-referrer"
            loading="lazy"
            title={t("live.title")}
            width="100%"
            height={h}
            className="block w-full border-0"
            // a light canvas whatever the site theme, so author colours behave the same everywhere
            style={{ colorScheme: "light", height: h }}
            onLoad={(e) => e.currentTarget.contentWindow?.postMessage(html, "*")}
          />
        ) : !run ? (
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="grid size-full place-items-center gap-2 font-mono text-[12px] tracking-[0.08em] text-muted uppercase hover:text-fg"
          >
            <span className="flex items-center gap-2">
              <PlayIcon className="size-4" aria-hidden strokeWidth={1.5} /> {t("live.run")}
            </span>
          </button>
        ) : null}
      </div>
      <figcaption aria-hidden className="mt-2 text-left font-mono text-[11px] text-muted uppercase">
        {t("live.caption")}
      </figcaption>
    </figure>
  );
}
