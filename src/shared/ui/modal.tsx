import { XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "./button";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-md)] border border-line-strong bg-card md:inset-auto md:top-1/2 md:left-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-md)] md:shadow-[4px_4px_0_0_var(--fg)]",
            className,
          )}
        >
          <div className="tile-head sticky top-0 z-10 justify-between rounded-none md:rounded-t-[calc(var(--radius-md)-1px)]">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 bg-fg" />
              <span aria-hidden>Dialog</span>
            </span>
            <span className="flex items-center gap-2">
              <kbd className="kbd hidden md:inline-grid" aria-hidden>
                esc
              </kbd>
              <Dialog.Close asChild>
                <Button variant="ghost-icon" aria-label="Close" className="-mr-2 size-8">
                  <XIcon aria-hidden />
                </Button>
              </Dialog.Close>
            </span>
          </div>
          <div className="p-5 md:p-6">
            <Dialog.Title className="font-display text-xl font-bold tracking-[-0.02em]">{title}</Dialog.Title>
            <Dialog.Description className={description ? "mt-1 text-sm text-muted" : "sr-only"}>{description ?? title}</Dialog.Description>
            <div className="mt-5">{children}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Segmented tabs (inverted fill) with roving arrow-key focus (APG tabs). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
  className?: string;
}) {
  const move = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const k = (j + n) % n;
    const next = items[k];
    if (!next) return;
    onChange(next[0]);
    (e.currentTarget.parentElement as HTMLElement).querySelectorAll<HTMLButtonElement>("[role=tab]")[k]?.focus();
  };
  return (
    <div className={cn("overflow-x-auto [scrollbar-width:none]", className)}>
      <div role="tablist" className="seg">
        {items.map(([id, label], i) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={value === id}
            tabIndex={value === id ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => move(e, i)}
            className="seg-item shrink-0"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Segmented "lens" control (radiogroup); replaces underline tabs for feed/section switching. */
export function Lens<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
  label: string;
  className?: string;
}) {
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = items[(i + d + items.length) % items.length];
    if (!next) return;
    onChange(next[0]);
    const btns = (e.currentTarget.parentElement as HTMLElement).querySelectorAll<HTMLButtonElement>("[role=radio]");
    btns[(i + d + items.length) % items.length]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("seg", className)}>
      {items.map(([id, text], i) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => move(e, i)}
          className="seg-item"
        >
          <span aria-hidden className="idx text-[10px] text-current opacity-70">
            {String(i + 1).padStart(2, "0")}
          </span>
          {text}
        </button>
      ))}
    </div>
  );
}
