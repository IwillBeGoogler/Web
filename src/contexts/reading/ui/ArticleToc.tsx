import { type RefObject, useEffect, useState } from "react";
import { useT } from "@/shared/i18n";

type Item = { id: string; text: string; level: number };

const MIN_ITEMS = 3;

const slugOf = (text: string, used: Set<string>) => {
  const base =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
};

/** Contents of a story: its h1–h3 headings, read from the rendered body (each gets an id to link to), with the section being read marked. */
export function ArticleToc({ container, deps }: { container: RefObject<HTMLElement | null>; deps: unknown }) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `deps` is the body being read; the ref is stable
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const used = new Set<string>();
    for (const el of root.querySelectorAll("[id]")) used.add(el.id);
    const heads = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3"));
    const list = heads.map((h) => {
      if (!h.id) h.id = slugOf(h.textContent ?? "", used);
      return { id: h.id, text: (h.textContent ?? "").trim(), level: Number(h.tagName[1]) };
    });
    setItems(list);
    if (list.length < MIN_ITEMS || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = list.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-56px 0px -65% 0px" },
    );
    for (const h of heads) io.observe(h);
    return () => io.disconnect();
  }, [container, deps]);

  if (items.length < MIN_ITEMS) return null;
  const top = Math.min(...items.map((i) => i.level));
  return (
    <nav aria-label={t("toc.label")} className="tile mt-10">
      <details open>
        <summary className="tile-head cursor-pointer select-none">{t("toc.label")}</summary>
        <ol className="grid gap-1 px-4 py-3 text-sm">
          {items.map((i) => (
            <li key={i.id} style={{ paddingLeft: `${(i.level - top) * 1}rem` }}>
              <a
                href={`#${i.id}`}
                aria-current={active === i.id ? "location" : undefined}
                className="text-muted hover:text-fg aria-[current=location]:font-semibold aria-[current=location]:text-fg"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  history.replaceState(null, "", `#${i.id}`);
                }}
              >
                {i.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
