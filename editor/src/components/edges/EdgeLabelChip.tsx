import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { t } from '../../i18n';

export interface EdgeLabelChipProps {
  /** label text (read from the store on every render: never cached) */
  text: string;
  /** anchor on the REAL routed path, in flow coordinates */
  x: number;
  y: number;
  color: string;
  /** knock out the line behind the text with the canvas colour */
  background: boolean;
  /** start editing programmatically (F2 / "Edit label") */
  editing?: boolean;
  locked?: boolean;
  onCommit: (text: string) => void;
  onEditingChange?: (editing: boolean) => void;
  /** drag start / move (client coords) / end: the parent maps the pointer to a position along the path */
  onDragStart?: () => void;
  onDrag?: (clientX: number, clientY: number) => void;
  onDragEnd?: () => void;
  selected?: boolean;
  /** bold text, and the side of the line the chip sits on (beside vertical segments) */
  bold?: boolean;
  anchor?: 'center' | 'left' | 'right';
}

/** HTML label chip (rendered through EdgeLabelRenderer): padded, wraps after ~180px (max 3 lines), editable inline. */
export function EdgeLabelChip({ text, x, y, color, background, editing: editingProp, locked, onCommit, onEditingChange, onDragStart, onDrag, onDragEnd, selected, bold, anchor = 'center' }: EdgeLabelChipProps) {
  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState(text);
  const cancelled = useRef(false);
  const drag = useRef<{ moved: boolean } | null>(null);
  const setEditing = (v: boolean) => {
    setEditingState(v);
    onEditingChange?.(v);
  };
  useEffect(() => {
    if (editingProp) {
      cancelled.current = false;
      setDraft(text);
      setEditingState(true);
    }
  }, [editingProp, text]);
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  const commit = () => {
    if (cancelled.current) return;
    setEditing(false);
    if (draft !== text) onCommit(draft);
  };

  const shift = anchor === 'right' ? '0%' : anchor === 'left' ? '-100%' : '-50%';
  const gap = anchor === 'right' ? 8 : anchor === 'left' ? -8 : 0;
  const style: CSSProperties = {
    transform: `translate(${shift}, -50%) translate(${x + gap}px, ${y}px)`,
    color,
    fontWeight: bold ? 700 : undefined,
    ...(background && anchor === 'center' ? {} : { background: 'transparent' }),
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (editing || locked || !onDrag) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { moved: false };
    onDragStart?.();
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.moved = true;
    onDrag?.(e.clientX, e.clientY);
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    onDragEnd?.();
  };

  if (editing)
    return (
      <div className="edge-label editing nodrag nopan" style={style} data-testid="edge-label">
        <input
          autoFocus
          className="edge-label-input"
          aria-label={t('Edge label')}
          value={draft}
          size={Math.max(6, draft.length + 1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation(); // typing / Delete / Backspace here must never reach the global shortcuts
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              cancelled.current = true;
              setDraft(text);
              setEditing(false);
              queueMicrotask(() => (cancelled.current = false));
            }
          }}
        />
      </div>
    );
  if (!text) return null;
  return (
    <div
      className={`edge-label nodrag nopan${selected ? ' selected' : ''}${background ? ' with-bg' : ''}`}
      style={style}
      data-testid="edge-label"
      title={t('Double-click to edit; drag to move along the line')}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!locked) {
          cancelled.current = false;
          setDraft(text);
          setEditing(true);
        }
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    >
      {text}
    </div>
  );
}
