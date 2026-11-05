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

const SITE = "iBlog";

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
  meta("property", "og:image", h.image ? abs(h.image) : undefined);
  meta("name", "twitter:card", h.image ? "summary_large_image" : "summary");
  meta("name", "robots", h.noindex ? "noindex" : undefined);
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.append(link);
  }
  link.href = abs(h.canonical ?? location.pathname);
}

/** Sets the document head while the page is shown. */
export function useHead(h: Head) {
  const { title, description, canonical, image, type, noindex } = h;
  useEffect(() => {
    applyHead({ title, description, canonical, image, type, noindex });
  }, [title, description, canonical, image, type, noindex]);
}
