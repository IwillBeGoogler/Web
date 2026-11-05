import { animate, type HTMLMotionProps, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { scrollProgress } from "./progress";

export { AnimatePresence, motion, useReducedMotion } from "motion/react";

export const ease = [0.22, 1, 0.36, 1] as const;
export const spring = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 } as const;

/** Fades and rises into view once. Renders statically under reduced motion. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </Comp>
  );
}

const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const staggerChild = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } };

/** Children of a Stagger animate in one after another. */
export function Stagger({
  children,
  className,
  as = "div",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
  "aria-label"?: string;
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      aria-label={ariaLabel}
      variants={staggerParent}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </Comp>
  );
}
export function StaggerItem({
  children,
  className,
  as = "div",
  ...p
}: { children: ReactNode; className?: string; as?: "div" | "li" } & Omit<HTMLMotionProps<"div">, "children">) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} variants={staggerChild} {...p}>
      {children}
    </Comp>
  );
}

/** Pulls its child slightly toward the pointer (CTA buttons). */
export function Magnetic({ children, strength = 0.25, className }: { children: ReactNode; strength?: number; className?: string }) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), spring);
  const y = useSpring(useMotionValue(0), spring);
  return (
    <motion.div
      className={cn("inline-block", className)}
      style={reduce ? undefined : { x, y }}
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** 3D tilt toward the pointer, for cards. */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), spring);
  return (
    <motion.div
      className={className}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to `value` when scrolled into view. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!seen || reduce) return setN(value);
    const c = animate(0, value, { duration: 1.4, ease, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [seen, value, reduce]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {new Intl.NumberFormat("en-US").format(n)}
    </span>
  );
}

/** Thin bar at the top of the page showing progress through `target`. */
export function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const p = useMotionValue(0);
  const scaleX = useSpring(p, { stiffness: 200, damping: 30, mass: 0.4 });
  useEffect(() => {
    const update = () => {
      const el = target.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + scrollY;
      p.set(scrollProgress(scrollY, top, el.offsetHeight, innerHeight));
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, [target, p]);
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left" style={{ scaleX, background: "var(--grad-brand)" }} />;
}

/** Cycles through words with a vertical slide. */
export function RotatingWord({ words, className, every = 2200 }: { words: string[]; className?: string; every?: number }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || words.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % words.length), every);
    return () => clearInterval(t);
  }, [words.length, every, reduce]);
  const w = words[i] ?? "";
  return (
    <span className={cn("relative -mb-[0.18em] inline-grid overflow-hidden pb-[0.18em] align-bottom", className)}>
      <motion.span
        key={w}
        initial={reduce ? false : { y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease }}
        className="col-start-1 row-start-1"
      >
        {w}
      </motion.span>
    </span>
  );
}
