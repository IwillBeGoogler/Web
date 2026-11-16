import { afterEach, describe, expect, it } from "vitest";
import { applyHead } from "./head";

const alt = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => [l.hreflang, l.href]);
const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
const metaOf = (k: string) => document.head.querySelector<HTMLMetaElement>(`meta[property="${k}"],meta[name="${k}"]`)?.content;

describe("applyHead", () => {
  afterEach(() => history.replaceState(null, "", "/"));

  it("falls back to the default share image with a large card", () => {
    applyHead({ title: "A" });
    expect(metaOf("og:image")).toMatch(/\/og-default\.png$/);
    expect(metaOf("twitter:image")).toMatch(/\/og-default\.png$/);
    expect(metaOf("twitter:card")).toBe("summary_large_image");
    expect(metaOf("twitter:title")).toBe("A — IWillBeGoogler");
  });

  it("uses the page image when given", () => {
    applyHead({ image: "https://cdn.test/c.jpg" });
    expect(metaOf("og:image")).toBe("https://cdn.test/c.jpg");
  });

  it("adds hreflang alternates for indexable pages and replaces them on the next call", () => {
    applyHead({ canonical: "/topics" });
    expect(alt().map(([l]) => l)).toEqual(["x-default", "uz", "ru", "en"]);
    expect(alt()[1]?.[1]).toBe(`${location.origin}/topics?lang=uz`);
    applyHead({ canonical: "/about" });
    expect(alt()).toHaveLength(4);
    expect(canonical()).toBe(`${location.origin}/about`);
  });

  it("keeps a ?lang variant as its own canonical", () => {
    history.replaceState(null, "", "/topics?lang=ru");
    applyHead({ canonical: "/topics" });
    expect(canonical()).toBe(`${location.origin}/topics?lang=ru`);
  });

  it("ignores an unknown lang and skips alternates for noindex or query urls", () => {
    history.replaceState(null, "", "/topics?lang=xx");
    applyHead({ canonical: "/topics" });
    expect(canonical()).toBe(`${location.origin}/topics`);
    applyHead({ canonical: "/me", noindex: true });
    expect(alt()).toEqual([]);
    applyHead({ canonical: "/x?page=2" });
    expect(alt()).toEqual([]);
  });
});
