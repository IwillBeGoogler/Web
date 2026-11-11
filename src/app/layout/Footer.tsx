import { Link } from "@tanstack/react-router";
import { feedbackDialog } from "@/contexts/engagement/application/feedbackDialog";
import { readingPrefs, useReadingPrefs } from "@/contexts/preferences/application/store";
import { PALETTES } from "@/contexts/preferences/domain/reading";
import { consent } from "@/shared/consent";
import { i18n, LANGS, type Lang, useLang, useT } from "@/shared/i18n";
import { Wordmark } from "./Logo";

const select = "h-9 rounded-[var(--radius-sm)] border border-line-strong bg-card px-2 font-mono text-[12px] text-fg";

/** Language and theme pickers: work signed out too. */
export function Preferences() {
  const t = useT();
  const lang = useLang();
  const { palette } = useReadingPrefs();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className="sr-only">{t("footer.language")}</span>
        <select aria-label={t("footer.language")} className={select} value={lang} onChange={(e) => i18n.set(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="sr-only">{t("footer.theme")}</span>
        <select aria-label={t("footer.theme")} className={select} value={palette} onChange={(e) => readingPrefs.set({ palette: e.target.value })}>
          {(["light", "dark"] as const).map((mode) => (
            <optgroup key={mode} label={t(mode === "light" ? "footer.light" : "footer.dark")}>
              {PALETTES.filter((p) => p.mode === mode).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </span>
  );
}

export function Footer() {
  const t = useT();
  const link = "w-fit hover:text-fg";
  const year = new Date().getFullYear();
  return (
    <footer data-chrome className="liquid-glass mx-3 mt-24 mb-3 overflow-hidden rounded-[28px] md:mx-6">
      <div className="mx-auto grid max-w-shell divide-y divide-white/10 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:divide-x md:divide-y-0">
        <div className="p-6">
          <Wordmark className="text-[18px]" />
          <p className="mt-2 font-mono text-[12px] text-muted">{t("footer.rights", { year })}</p>
        </div>
        <div className="p-6">
          <p className="kicker">{t("footer.site")}</p>
          <nav aria-label="Site" className="mt-3 flex flex-col gap-2 font-mono text-[12px] tracking-[0.12em] text-muted uppercase">
            <Link to="/about" className={link}>
              {t("info.about")}
            </Link>
            <Link to="/help" className={link}>
              {t("info.help")}
            </Link>
            <Link to="/contact" className={link}>
              {t("info.contact")}
            </Link>
          </nav>
        </div>
        <div className="p-6">
          <p className="kicker">{t("footer.legal")}</p>
          <nav aria-label="Legal" className="mt-3 flex flex-col gap-2 font-mono text-[12px] tracking-[0.12em] text-muted uppercase">
            <Link to="/terms" className={link}>
              {t("legal.terms")}
            </Link>
            <Link to="/privacy" className={link}>
              {t("legal.privacy")}
            </Link>
            <button type="button" className={`${link} cursor-pointer text-left uppercase`} onClick={() => consent.reset()}>
              {t("legal.cookies")}
            </button>
            <button type="button" className={`${link} cursor-pointer text-left uppercase`} onClick={() => feedbackDialog.open()}>
              {t("feedback.link")}
            </button>
          </nav>
        </div>
        <div className="p-6">
          <p className="kicker">{t("footer.preferences")}</p>
          <div className="mt-3">
            <Preferences />
          </div>
        </div>
      </div>
      <div className="flex h-9 items-center justify-between border-t border-white/10 px-4 font-mono text-[11px] tracking-[0.12em] text-muted uppercase md:px-6">
        <a href="/api/feed.xml" className="hover:text-fg">
          {t("footer.rss")} · /api/feed.xml
        </a>
        <span>© {year}</span>
      </div>
    </footer>
  );
}
