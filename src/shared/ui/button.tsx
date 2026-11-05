import { Loader2Icon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-mono text-[12px] font-medium uppercase tracking-[0.08em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none";
const sizes = { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-5 text-[13px]" };
const primary =
  "bg-inverse text-on-inverse shadow-[inset_0_-2px_0_0_color-mix(in_srgb,var(--on-inverse)_22%,transparent)] hover:bg-accent-hover active:shadow-none active:translate-y-px motion-reduce:active:translate-y-0";
const variants = {
  primary,
  /** Alias of primary (monochrome identity); key kept for call sites. */
  accent: primary,
  outline: "border border-line-strong bg-card text-fg hover:border-fg hover:bg-surface-2 active:bg-surface-2",
  "outline-accent": "border border-fg bg-card text-fg hover:bg-inverse hover:text-on-inverse",
  link: "h-auto px-0 font-sans text-[15px] normal-case tracking-normal font-medium text-fg underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-fg rounded-[var(--radius-xs)]",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  "ghost-icon":
    "size-10 rounded-[var(--radius-sm)] border border-transparent text-muted hover:text-fg hover:border-line-strong hover:bg-surface-2 [&_svg]:size-[18px]",
  danger: "bg-danger text-surface hover:opacity-90 shadow-[inset_0_-2px_0_0_rgb(0_0_0/0.2)]",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, asChild, className, children, disabled, type, ...p }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const icon = variant === "ghost-icon" || variant === "link";
  return (
    <Comp
      className={cn(base, !icon && sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...p}
    >
      {asChild ? (
        children
      ) : (
        <>
          <span className={loading ? "invisible contents" : "contents"}>{children}</span>
          {loading ? <Loader2Icon className="absolute size-4 animate-spin" aria-hidden /> : null}
        </>
      )}
    </Comp>
  );
}
