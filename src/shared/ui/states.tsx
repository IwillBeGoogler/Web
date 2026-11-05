import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";

export const Bone = ({ className }: { className?: string }) => <div aria-hidden className={cn("shimmer rounded-[var(--radius-xs)]", className)} />;

/** Shows children only after `ms`, so fast loads don't flash skeletons. */
export function Delayed({ children, ms = 150 }: { children: ReactNode; ms?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? children : null;
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Delayed>{children}</Delayed>
    </div>
  );
}

export function PostCardSkeleton() {
  return (
    <div className="tile overflow-hidden">
      <div className="tile-head">
        <Bone className="h-2.5 w-8" />
        <Bone className="h-2.5 w-20" />
        <Bone className="ml-auto h-2.5 w-12" />
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_9rem]">
        <div className="space-y-2">
          <Bone className="h-5 w-11/12" />
          <Bone className="h-5 w-2/3" />
          <Bone className="h-3.5 w-full" />
        </div>
        <Bone className="hidden aspect-[4/3] w-full sm:block" />
      </div>
      <div className="flex gap-2 border-t border-line p-2">
        <Bone className="h-7 w-20" />
        <Bone className="h-7 w-16" />
        <Bone className="ml-auto h-7 w-24" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  code,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  /** Mono status line above the title (decorative, aria-hidden). */
  code?: string;
}) {
  return (
    <div className="mx-auto my-10 max-w-md rounded-[var(--radius-md)] border border-dashed border-line-strong bg-card px-6 py-12 text-center">
      <span className="hatch mx-auto grid size-12 place-items-center rounded-[var(--radius-sm)] border border-line-strong">
        <Icon className="size-5 text-fg" aria-hidden />
      </span>
      <p className="kicker mt-5" aria-hidden>
        {code ?? "0 · nothing here"}
      </p>
      <h2 className="mt-2 font-display text-xl font-bold tracking-[-0.02em]">{title}</h2>
      {body ? <p className="mt-2 text-sm leading-6 text-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}
