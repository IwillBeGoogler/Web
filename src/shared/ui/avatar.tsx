import { Avatar as A } from "radix-ui";
import { cn } from "@/shared/lib/cn";

const sizes = {
  xs: "size-5 text-[9px] rounded-[var(--radius-xs)]",
  sm: "size-6 text-[10px] rounded-[var(--radius-xs)]",
  md: "size-8 text-[11px] rounded-[var(--radius-sm)]",
  lg: "size-11 text-sm rounded-[var(--radius-sm)]",
  xl: "size-22 text-2xl rounded-[var(--radius-md)]",
  "2xl": "size-30 text-3xl rounded-[var(--radius-md)]",
};
const hues = ["bg-[#171717]", "bg-[#262626]", "bg-[#3f3f3f]", "bg-[#525252]", "bg-[#2b2b2b]", "bg-[#404040]", "bg-[#1f1f1f]", "bg-[#4a4a4a]"];

export const hueFor = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hues[h % hues.length] as string;
};

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export function Avatar({
  name,
  src,
  size = "md",
  labelled = true,
  className,
}: {
  name: string;
  src?: string | undefined;
  size?: keyof typeof sizes;
  labelled?: boolean;
  className?: string;
}) {
  return (
    <A.Root className={cn("relative inline-flex shrink-0 overflow-hidden bg-surface-2 ring-1 ring-line-strong ring-inset", sizes[size], className)}>
      {src ? <A.Image src={src} alt={labelled ? "" : name} className="size-full object-cover contrast-[1.05] grayscale" /> : null}
      <A.Fallback
        className="flex size-full items-center justify-center bg-surface-2 font-medium font-mono text-fg tracking-tight after:absolute after:right-0 after:bottom-0 after:size-[3px] after:bg-fg"
        aria-label={labelled ? undefined : name}
      >
        {initialsOf(name)}
      </A.Fallback>
    </A.Root>
  );
}
