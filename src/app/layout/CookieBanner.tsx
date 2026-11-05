import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { consent, useConsent } from "@/shared/consent";
import { useT } from "@/shared/i18n";

const choice =
  "h-9 cursor-pointer rounded-[var(--radius-sm)] border px-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Asks once for analytics consent; necessary storage needs none. Compact card: full width above the
 * bottom edge on phones, 360px bottom-left on desktop. Publishes its footprint as --cookie-h on <html>
 * so the article action bar and reading dock lift clear of it.
 */
export function CookieBanner() {
  if (useConsent() !== null) return null;
  return <Banner />;
}

function Banner() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      root.style.setProperty("--cookie-h", `${Math.ceil(innerHeight - r.top)}px`);
    };
    sync();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    ro?.observe(el);
    addEventListener("resize", sync);
    return () => {
      ro?.disconnect();
      removeEventListener("resize", sync);
      root.style.removeProperty("--cookie-h");
    };
  }, []);

  return (
    <section
      ref={ref}
      data-chrome
      aria-label={t("cookie.title")}
      className="float-surface fixed inset-x-3 bottom-3 z-40 rounded-[var(--radius-md)] border border-line-strong bg-card p-3 shadow-[3px_3px_0_0_var(--fg)] md:inset-x-auto md:bottom-6 md:left-6 md:w-[360px]"
    >
      <h2 className="kicker text-fg">{t("cookie.title")}</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-muted">
        {t("cookie.body")}{" "}
        <Link to="/privacy" className="text-fg underline decoration-line-strong underline-offset-4">
          {t("cookie.more")}
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className={`${choice} border-line-strong text-fg hover:bg-surface-2`} onClick={() => consent.set("necessary")}>
          {t("cookie.necessary")}
        </button>
        <button type="button" className={`${choice} border-inverse bg-inverse text-on-inverse hover:opacity-90`} onClick={() => consent.set("all")}>
          {t("cookie.accept")}
        </button>
      </div>
    </section>
  );
}
