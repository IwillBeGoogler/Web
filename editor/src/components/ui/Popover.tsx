import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { portalRoot } from '../../lib/host';
import { AnimatePresence, motion } from 'motion/react';
import type { Rect } from '../../lib/tooltip';
import { t } from '../../i18n';

interface Props {
  open: boolean;
  anchor: Rect | null;
  onClose: () => void;
  children: ReactNode;
  label: string;
  align?: 'start' | 'end';
}

/** Portal popover anchored under a rect; scale 0.96 -> 1 + fade, origin-aware; closes on Esc / outside click. */
export function Popover({ open, anchor, onClose, children, label, align = 'start' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [open, onClose]);
  const left = anchor ? (align === 'start' ? anchor.x : anchor.x + anchor.width) : 0;
  const top = anchor ? anchor.y + anchor.height + 6 : 0;
  return createPortal(
    <AnimatePresence>
      {open && anchor && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label={t(label)}
          className="popover"
          style={{ left: Math.min(left, window.innerWidth - 240), top, transformOrigin: align === 'start' ? 'top left' : 'top right', translate: align === 'end' ? '-100% 0' : undefined }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    portalRoot(),
  );
}
