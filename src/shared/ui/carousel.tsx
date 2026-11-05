import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useReducedMotion } from "@/shared/motion";

/**
 * Scroll-snap carousel: swipe/trackpad native, prev/next buttons, dots,
 * optional autoplay that pauses on hover, focus, hidden tab and reduced motion.
 * `slide` sets each item's width (e.g. "basis-full", "basis-[80%] sm:basis-1/2").
 */
const pad = (n: number) => String(n).padStart(2, "0");

export function Carousel({
  label,
  children,
  slide = "basis-full",
  autoplay,
  className,
  controls = "below",
}: {
  label: string;
  children: ReactNode;
  slide?: string;
  autoplay?: number;
  className?: string;
  controls?: "below" | "overlay";
}) {
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState(1);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth : el.clientWidth;
    const perView = Math.max(1, Math.round(el.clientWidth / Math.max(1, step)));
    setPages(Math.max(1, items.length - perView + 1));
    setIndex(Math.round(el.scrollLeft / Math.max(1, step)));
  }, [items.length]);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure]);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      const target = el?.children[((i % pages) + pages) % pages] as HTMLElement | undefined;
      if (!el || !target) return;
      el.scrollTo?.({ left: target.offsetLeft - el.offsetLeft, behavior: reduce ? "auto" : "smooth" });
    },
    [pages, reduce],
  );

  useEffect(() => {
    if (!autoplay || paused || reduce || pages < 2) return;
    const t = setInterval(() => {
      if (!document.hidden) go(index + 1);
    }, autoplay);
    return () => clearInterval(t);
  }, [autoplay, paused, reduce, pages, index, go]);

  if (!items.length) return null;
  const btn =
    "grid size-9 place-items-center rounded-[var(--radius-sm)] border border-line-strong bg-card text-fg transition-colors hover:bg-inverse hover:text-on-inverse disabled:pointer-events-none disabled:opacity-30";
  const nav =
    pages > 1 ? (
      <div
        className={cn(
          "flex items-center gap-3",
          controls === "overlay"
            ? "absolute top-3 right-7 z-10 rounded-[var(--radius-sm)] border border-line-strong bg-card py-1 pr-1 pl-2"
            : "mt-4 justify-between",
        )}
      >
        <div className="flex items-center gap-1">
          <span className="idx mr-1 text-[11px]" aria-hidden>
            {pad(index + 1)} / {pad(pages)}
          </span>
          {Array.from({ length: pages }, (_, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index || undefined}
              onClick={() => go(i)}
              className="group grid h-6 w-6 place-items-center"
            >
              <span aria-hidden className={cn("h-1 w-4 rounded-[1px] transition-colors", i === index ? "bg-fg" : "bg-line-strong group-hover:bg-muted")} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} aria-label="Previous" disabled={index <= 0} onClick={() => go(index - 1)}>
            <ChevronLeftIcon className="size-4" aria-hidden />
          </button>
          <button type="button" className={btn} aria-label="Next" onClick={() => go(index + 1 >= pages ? 0 : index + 1)}>
            <ChevronRightIcon className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    ) : null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={track}
        className="-mx-1 flex snap-x snap-mandatory scroll-px-1 overflow-x-auto scroll-smooth px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((child, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: wrapper per child
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className={cn("shrink-0 snap-start pr-4 last:pr-0", slide)}
          >
            {child}
          </div>
        ))}
      </div>
      {nav}
    </section>
  );
}
