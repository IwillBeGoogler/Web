import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { t } from '../../i18n';

interface Props {
  open: boolean;
  title: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** `alertdialog` for confirmations */
  role?: 'dialog' | 'alertdialog';
}

/** scale + fade duration (ms): <= 180 */
export const MODAL_MS = 160;
const EASE = [0.2, 0, 0, 1] as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** open modals, oldest first: only the top-most reacts to Esc */
const openStack: symbol[] = [];

function useSheet(): boolean {
  const query = '(max-width: 479px)';
  const [sheet, setSheet] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setSheet(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return sheet;
}

/**
 * Premium modal: blurred backdrop, scale + fade (<= 180ms), bottom sheet under 480px, aria-modal, focus trap,
 * initial focus (`[data-autofocus]`, else the first field / button), focus returns to the opener on close, Esc closes
 * the top-most dialog only, backdrop click closes. Light / dark through the theme tokens.
 */
export function Modal({ open, title, closeLabel = 'Close', onClose, children, className = '', role = 'dialog' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const sheet = useSheet();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    openStack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === token) {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    // initial focus once the dialog is in the DOM
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="radio"]),textarea,select') ?? el.querySelector<HTMLElement>('.modal-foot button, button:not(.modal-x)') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(token);
      if (i >= 0) openStack.splice(i, 1);
      if (prev && prev.isConnected) prev.focus?.();
    };
  }, [open]);

  const trap = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((x) => x.offsetParent !== null || x.getClientRects().length > 0 || true);
    if (!items.length) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const tween = { duration: MODAL_MS / 1000, ease: EASE };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className={`modal-backdrop${sheet ? ' sheet' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            ref={ref}
            className={`modal ${className}`.trim()}
            role={role}
            aria-label={title}
            aria-modal="true"
            data-sheet={sheet ? 'true' : 'false'}
            onKeyDown={trap}
            initial={sheet ? { opacity: 0, y: 40 } : { opacity: 0, scale: 0.96 }}
            animate={sheet ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1 }}
            exit={sheet ? { opacity: 0, y: 40 } : { opacity: 0, scale: 0.97 }}
            transition={tween}
          >
            <div className="modal-head">
              <h2>{title}</h2>
              <button type="button" className="btn btn-icon btn-ghost modal-x" aria-label={t(closeLabel)} onClick={onClose}>
                <X size={16} aria-hidden />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
