import { i18n } from "@/shared/i18n";

/** iBlog-style date: "Oct 5" this year, "Oct 5, 2024" otherwise. */
export const shortDate = (iso: string | null | undefined, now = new Date()): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) };
  return new Intl.DateTimeFormat("en-US", opts).format(d);
};

/** 999 -> "999", 1200 -> "1.2K", 3400000 -> "3.4M". */
export const compact = (n: number): string =>
  n < 1000 ? String(n) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** "2m ago" style for notifications. */
export const timeAgo = (iso: string, now = new Date()): string => {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return i18n.t("time.justNow");
  if (s < 3600) return i18n.t("time.m", { n: Math.floor(s / 60) });
  if (s < 86400) return i18n.t("time.h", { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return i18n.t("time.d", { n: Math.floor(s / 86400) });
  return shortDate(iso, now);
};
