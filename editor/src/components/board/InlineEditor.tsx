import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

interface Props {
  value: string;
  onCommit: (v: string) => void;
  onDone: () => void;
  multiline?: boolean;
  /** typing started the edit: begin with this text and the caret at the end (instead of selecting everything) */
  seed?: string | null;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  /** live text (auto font size) */
  onInput?: (v: string) => void;
  /** return true when the key was handled; `commit` saves the text first (one undo step) */
  onKey?: (e: KeyboardEvent, commit: () => void) => boolean;
}

/**
 * Inline text editor for Board nodes. Blur commits, Esc cancels, Cmd/Ctrl+Enter commits; `onKey` adds node specific keys
 * (Tab / Enter / Shift+Enter create the next sticky or mind map node).
 */
export function InlineEditor({ value, onCommit, onDone, multiline, className, style, onInput, onKey, seed, ...rest }: Props) {
  const [v, setV] = useState(seed ?? value);
  const finished = useRef(false);
  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    if (v !== value) onCommit(v);
  };
  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      finished.current = true;
      onDone();
      return;
    }
    if (onKey?.(e, commit)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
      onDone();
    }
  };
  const common = {
    value: v,
    autoFocus: true,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (seed) { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); } else e.currentTarget.select(); },
    onChange: (e: { target: { value: string } }) => { setV(e.target.value); onInput?.(e.target.value); },
    onBlur: () => { commit(); onDone(); },
    onKeyDown: keys,
    className: `nodrag nowheel inline-edit ${className ?? ''}`,
    style,
    ...rest,
  };
  return multiline ? <textarea {...common} /> : <input type="text" {...common} />;
}
