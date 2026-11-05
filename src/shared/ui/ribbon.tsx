import { Children, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Slow, endless horizontal ribbon. Items render twice so the loop is seamless;
 * the copy is hidden from assistive tech and the tab order. Pauses on hover and
 * focus; with reduced motion it becomes a plain horizontal scroller.
 */
export function Ribbon({
  label,
  children,
  seconds = 90,
  reverse = false,
  className,
}: {
  label: string;
  children: ReactNode;
  seconds?: number;
  reverse?: boolean;
  className?: string;
}) {
  const items = Children.toArray(children);
  if (!items.length) return null;
  const row = (copy: boolean) =>
    items.map((child, i) => (
      <li
        // biome-ignore lint/suspicious/noArrayIndexKey: ribbon repeats items on purpose
        key={`${copy ? "b" : "a"}-${i}`}
        aria-hidden={copy || undefined}
        inert={copy || undefined}
        className={cn("shrink-0", copy && "motion-reduce:hidden")}
      >
        {child}
      </li>
    ));
  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        "-mx-4 overflow-hidden md:mx-0 motion-reduce:overflow-x-auto motion-reduce:[scrollbar-width:none] [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]",
        className,
      )}
    >
      <ul
        style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? "reverse" : undefined }}
        className="flex w-max animate-marquee gap-3 px-4 py-1 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none md:px-0"
      >
        {row(false)}
        {row(true)}
      </ul>
    </div>
  );
}
