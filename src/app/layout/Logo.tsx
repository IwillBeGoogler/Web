import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import { motion, useReducedMotion } from "@/shared/motion";
import { playSplash } from "@/shared/splash";

export const BRAND = "iBlog";

/** Fired on logo click; the home page listens and replays its entrance. */
export const HOME_REPLAY = "iblog:home-replay";

/** iBlog wordmark: solid square mark + display "Blog". Monochrome, no gradient. `spin` changes on each logo click to replay the flip. */
export function Wordmark({ className, spin = 0 }: { className?: string; spin?: number }) {
  const reduce = useReducedMotion();
  const play = spin > 0 && !reduce;
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-[22px] font-extrabold tracking-[-0.05em]", className)}>
      <motion.span
        key={`m${spin}`}
        aria-hidden
        initial={play ? { rotate: -180, scale: 0.6 } : false}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className="relative grid size-7 place-items-center rounded-[var(--radius-xs)] bg-inverse font-mono text-[15px] font-medium text-on-inverse shadow-[2px_2px_0_0_var(--line-strong)] transition-[box-shadow] duration-150 group-hover:shadow-[3px_3px_0_0_var(--fg)] motion-reduce:transition-none"
      >
        i
      </motion.span>
      <motion.span key={`w${spin}`} initial={play ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.08 }}>
        Blog
      </motion.span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  const [spin, setSpin] = useState(0);
  return (
    <Link
      to="/"
      aria-label={`${BRAND} home`}
      className={cn("group text-fg", className)}
      onClick={(e) => {
        // New-tab clicks (modifier / middle button) leave this tab alone.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        setSpin((s) => s + 1);
        // Coming home from another page: replay the loading screen.
        if (location.pathname !== "/") playSplash();
        scrollTo({ top: 0, behavior: "smooth" });
        dispatchEvent(new Event(HOME_REPLAY));
      }}
    >
      <Wordmark spin={spin} />
    </Link>
  );
}
