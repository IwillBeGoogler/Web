import { useEffect, useRef } from 'react';

/**
 * Closes a floating panel when the person presses on the empty canvas (the "inactive" area), like a modal's backdrop.
 * Only the bare pane counts: nodes, edges, menus, dialogs and the toolbar button that opened the panel do not close it.
 */
export function usePaneDismiss(open: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.react-flow__pane')) ref.current();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [open]);
}
