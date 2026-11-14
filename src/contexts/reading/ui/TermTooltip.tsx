import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TERM_CLASS, type Term } from "../domain/glossary";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 120;

const termOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? (target.closest(`.${TERM_CLASS}`) as HTMLElement | null) : null;

/**
 * The explanation of a marked term. One set of listeners on the article container serves every term.
 * Opens on hover (after a short delay), on keyboard focus and on tap; closes on Escape, blur, leaving, a tap elsewhere or scrolling away.
 * The tooltip holds only the term and its definition, as text.
 */
export function TermTooltip({ container, terms, tipId }: { container: RefObject<HTMLElement | null>; terms: readonly Term[]; tipId: string }) {
  const [active, setActive] = useState<{ el: HTMLElement; term: Term } | null>(null);
  const tip = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<"mouse" | "touch" | "key">("key");
  const byId = useRef(new Map<string, Term>());
  byId.current = new Map(terms.map((t) => [t.id, t]));
  const activeEl = useRef<HTMLElement | null>(null);
  activeEl.current = active?.el ?? null;

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const clear = () => clearTimeout(timer.current);
    const show = (el: HTMLElement) => {
      clear();
      const term = byId.current.get(el.dataset.termId ?? "");
      if (term) setActive((a) => (a?.el === el ? a : { el, term }));
    };
    const hide = () => {
      clear();
      setActive(null);
    };
    const later = (fn: () => void, ms: number) => {
      clear();
      timer.current = setTimeout(fn, ms);
    };

    const onOver = (e: MouseEvent) => {
      const el = termOf(e.target);
      if (el && input.current === "mouse") later(() => show(el), activeEl.current ? 0 : OPEN_DELAY_MS);
    };
    const onOut = (e: MouseEvent) => {
      if (!termOf(e.target) || input.current !== "mouse") return;
      const to = e.relatedTarget;
      if (to instanceof Node && (tip.current?.contains(to) || termOf(to) === termOf(e.target))) return;
      later(hide, CLOSE_DELAY_MS);
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = termOf(e.target);
      // a tap focuses the term first; the click that follows decides
      if (el && input.current === "key") show(el);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!termOf(e.target)) return;
      const to = e.relatedTarget;
      if (to instanceof Node && tip.current?.contains(to)) return;
      hide();
    };
    const onClick = (e: MouseEvent) => {
      const el = termOf(e.target);
      if (!el || input.current !== "touch") return;
      if (activeEl.current === el) hide();
      else show(el);
    };
    const onKey = (e: KeyboardEvent) => {
      input.current = "key";
      if (e.key === "Escape") return hide();
      const el = termOf(e.target);
      if (el && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (activeEl.current === el) hide();
        else show(el);
      }
    };
    const onPointer = (e: PointerEvent) => {
      input.current = e.pointerType === "touch" || e.pointerType === "pen" ? "touch" : "mouse";
      const t = e.target;
      if (t instanceof Node && !termOf(t) && !tip.current?.contains(t)) hide();
    };

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      clear();
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [container]);

  // the terms were marked again (new text or new glossary): the element being shown may be gone
  // biome-ignore lint/correctness/useExhaustiveDependencies: `terms` is the signal; the lookup itself is read through a ref
  useEffect(() => {
    setActive((a) => (a && container.current?.contains(a.el) && byId.current.has(a.el.dataset.termId ?? "") ? a : null));
  }, [container, terms]);

  // place the tooltip next to the term and keep it there; leave when the term has scrolled out of view
  useEffect(() => {
    if (!active) return;
    const { el } = active;
    const floating = tip.current;
    if (!floating) return;
    const place = async () => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return setActive(null);
      const { x, y } = await computePosition(el, floating, {
        strategy: "fixed",
        placement: "top",
        middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
      });
      floating.style.left = `${x}px`;
      floating.style.top = `${y}px`;
    };
    el.setAttribute("aria-describedby", tipId);
    return autoUpdate(el, floating, () => void place(), { animationFrame: false });
  }, [active, tipId]);

  if (!active) return null;
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: hovering the tooltip keeps it open (WCAG 1.4.13)
    <div
      ref={tip}
      id={tipId}
      role="tooltip"
      className="term-tip"
      style={{ position: "fixed", left: 0, top: 0 }}
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setActive(null), CLOSE_DELAY_MS);
      }}
    >
      <strong className="term-tip-name">{active.term.term}</strong>
      <span className="term-tip-def">{active.term.definition}</span>
    </div>,
    document.body,
  );
}
