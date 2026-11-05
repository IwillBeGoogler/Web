import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SIDEBAR_MAX, SIDEBAR_MIN } from '../lib/layout';
import { t } from '../i18n';

interface Props {
  side: 'left' | 'right';
  open: boolean;
  width: number;
  children: ReactNode;
  /** called with the new width while dragging the handle (left panel only) */
  onResize?: (w: number) => void;
  className?: string;
}

/** Floating glass panel that slides in/out; optionally resizable by dragging its inner edge. */
export function FloatingPanel({ side, open, width, children, onResize, className }: Props) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  const dir = side === 'left' ? -1 : 1;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={`panel glass panel-${side}${className ? ` ${className}` : ''}`}
          style={{ width }}
          initial={{ x: dir * (width + 24), opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir * (width + 24), opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        >
          {children}
          {onResize && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('Resize palette')}
              aria-valuenow={Math.round(width)}
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              tabIndex={0}
              className={`resize-handle${dragging ? ' dragging' : ''}`}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, w: width };
                setDragging(true);
              }}
              onPointerMove={(e) => dragging && onResize(start.current.w + (e.clientX - start.current.x))}
              onPointerUp={() => setDragging(false)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onResize(width - 16);
                if (e.key === 'ArrowRight') onResize(width + 16);
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
