import { useEffect } from "react";
import { i18n } from "@/shared/i18n";

export interface Head {
  title?: string;
  description?: string;
  /** Absolute or site-relative canonical URL. */
  canonical?: string;
  image?: string;
  type?: "website" | "article" | "profile";
  /** Keep the page out of search results (drafts, settings). */
  noindex?: boolean;
}

const SITE = "IWillBeGoogler";
/** Link-preview image for pages without a cover. */
const DEFAULT_IMAGE = "/og-default.png";

function meta(attr: "name" | "property", key: string, content: string | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.content = content;
}

const abs = (u: string) => (u.startsWith("http") ? u : new URL(u, location.origin).href);

/** Writes title, description, canonical, Open Graph and Twitter tags for the current page. */
export function applyHead(h: Head) {
  const title = h.title ? `${h.title} — ${SITE}` : SITE;
  const description = h.description || i18n.t("meta.description");
  document.title = title;
  meta("name", "description", description);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:type", h.type ?? "website");
  meta("property", "og:url", abs(h.canonical ?? location.pathname));
  const image = abs(h.image || DEFAULT_IMAGE);
  meta("property", "og:image", image);
  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", description);
  meta("name", "twitter:image", image);
  meta("name", "robots", h.noindex ? "noindex" : undefined);
  const url = abs(h.canonical ?? location.pathname);
  // A ?lang= variant is its own canonical URL; hreflang alternates pair the variants (indexable pages only).
  const variant = new URLSearchParams(location.search).get("lang");
  const langs = ["uz", "ru", "en"];
  const own = !url.includes("?") && variant && langs.includes(variant) ? `${url}?lang=${variant}` : url;
  link("canonical", own);
  for (const el of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) el.remove();
  if (!h.noindex && !url.includes("?")) {
    link("alternate", url, "x-default");
    for (const l of langs) link("alternate", `${url}?lang=${l}`, l);
  }
}

function link(rel: string, href: string, hreflang?: string) {
  let el = hreflang ? null : document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.append(el);
  }
  el.href = href;
}

/** Sets the document head while the page is shown. */
export function useHead(h: Head) {
  const { title, description, canonical, image, type, noindex } = h;
  useEffect(() => {
    applyHead({ title, description, canonical, image, type, noindex });
  }, [title, description, canonical, image, type, noindex]);
}
