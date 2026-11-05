import { useEffect, useState, type CSSProperties } from 'react';
import { useFieldId } from './ui/fieldContext';

interface Props {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
}

/** Edits locally, commits on blur / Enter so one edit = one undo step. */
export function BufferedInput({ value, onCommit, multiline, autoFocus, onDone, ...rest }: Props) {
  const fieldId = useFieldId();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
    onDone?.();
  };
  const common = {
    id: fieldId,
    value: v,
    autoFocus,
    onFocus: autoFocus ? (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.currentTarget.select() : undefined,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        setV(value);
        onDone?.();
      } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    },
    ...rest,
  };
  return multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />;
}
