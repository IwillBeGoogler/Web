import { useState } from 'react';
import { rowDropIndex } from '../../lib/rows/engine';

export interface RowDrag { id: string; from: number; to: number }

/**
 * Drag-to-reorder for a list of fixed-height rows: pointer movement -> target index (zoom aware); `onMove` fires once
 * on release with the id and the index among the VISIBLE rows. Shared by ER columns and UML members.
 */
export function useRowReorder({ count, rowH, zoom, disabled, onMove }: { count: number; rowH: number; zoom: number; disabled?: boolean; onMove: (id: string, to: number) => void }) {
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const start = (e: React.PointerEvent, id: string, from: number) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    const y0 = e.clientY;
    let to = from;
    setDrag({ id, from, to });
    const move = (ev: PointerEvent) => {
      to = rowDropIndex(from, ev.clientY - y0, rowH, zoom, count);
      setDrag({ id, from, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (to !== from) onMove(id, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** CSS classes for a row while a drag is running */
  const rowClass = (id: string, i: number): string => {
    if (!drag) return '';
    if (drag.id === id) return ' dragging';
    if (drag.to === i) return ` drop-${drag.to > drag.from ? 'below' : 'above'}`;
    return '';
  };
  return { drag, start, rowClass };
}

/** Which cell of which row is being edited inline (double-click to open). */
export function useInlineEdit<F extends string = string>() {
  const [cur, setCur] = useState<{ row: string; field: F } | null>(null);
  return {
    cur,
    open: (row: string, field: F) => setCur({ row, field }),
    close: () => setCur(null),
    is: (row: string, field: F) => !!cur && cur.row === row && cur.field === field,
  };
}
