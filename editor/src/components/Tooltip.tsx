import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { portalRoot } from '../lib/host';
import { TIP_DELAY, useTipStore } from '../store/tipStore';
import { computeTooltipPosition, isTruncated, type TipContent, type TipPosition } from '../lib/tooltip';
import { t } from '../i18n';

/**
 * Props to spread on any element to give it a custom tooltip (portal, 300 ms delay, flips, also on keyboard focus).
 * Hides on mouse leave, blur, scroll and drag start. `onlyWhenTruncated` skips the tip unless the element overflows.
 */
export function useTip(content: TipContent | null, opts: { delay?: number; onlyWhenTruncated?: boolean } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useTipStore((s) => s.show);
  const hide = useTipStore((s) => s.hide);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    hide();
  }, [hide]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = useCallback(
    (el: HTMLElement) => {
      if (!content) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (opts.onlyWhenTruncated && !isTruncated(el)) return;
        const r = el.getBoundingClientRect();
        show({ x: r.left, y: r.top, width: r.width, height: r.height }, content);
      }, opts.delay ?? TIP_DELAY);
    },
    [content, opts.delay, opts.onlyWhenTruncated, show],
  );
  return {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => start(e.currentTarget),
    onMouseLeave: cancel,
    onFocus: (e: FocusEvent<HTMLElement>) => start(e.currentTarget),
    onBlur: cancel,
    onDragStart: cancel,
    onMouseDown: cancel,
  };
}

/** Mount once near the app root. Renders the active tooltip in a portal so no overflow container can clip it. */
export function TooltipLayer() {
  const tip = useTipStore((s) => s.tip);
  const hide = useTipStore((s) => s.hide);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<TipPosition | null>(null);

  useLayoutEffect(() => {
    if (!tip || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos(computeTooltipPosition(tip.anchor, { width: r.width || 160, height: r.height || 40 }, { width: window.innerWidth, height: window.innerHeight }));
  }, [tip]);

  useEffect(() => {
    if (!tip) return;
    const off = () => hide();
    window.addEventListener('scroll', off, true);
    window.addEventListener('wheel', off, { passive: true });
    window.addEventListener('keydown', off);
    return () => {
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('wheel', off);
      window.removeEventListener('keydown', off);
    };
  }, [tip, hide]);

  if (!tip) return null;
  const { title, path, aliases, lines, tags } = tip.content;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`tip tip-${pos?.placement ?? 'top'}`}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, ['--arrow-x' as string]: `${pos?.arrowX ?? 20}px` }}
    >
      <div className="tip-title">{title}</div>
      {path && <div className="tip-path">{path}</div>}
      {lines && lines.length > 0 && (
        <ul className="tip-lines">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {aliases && aliases.length > 0 && <div className="tip-aka">{t('aka: {list}', { list: aliases.join(', ') })}</div>}
      {tags && tags.length > 0 && <div className="tip-tags" aria-label={t('Tags')}>{tags.map((t) => (<span key={t} className="tip-tag">#{t}</span>))}</div>}
    </div>,
    portalRoot(),
  );
}
