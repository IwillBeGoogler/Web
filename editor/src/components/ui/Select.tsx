import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { portalRoot } from '../../lib/host';
import { useFieldId } from './fieldContext';
import { t } from '../../i18n';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** small secondary text on the right of the row */
  hint?: string;
}
interface Props<T extends string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (v: T) => void;
  /** accessible name */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** several selected items disagree: shows "Mixed" until a value is picked */
  mixed?: boolean;
  mono?: boolean;
}
interface Pos { left: number; top: number; width: number; maxH: number; up: boolean }

/** Themed, keyboard-accessible select (combobox + listbox, focus stays on the trigger and `aria-activedescendant` follows the highlight). */
export function Select<T extends string>({ value, options, onChange, label, placeholder = 'Select…', disabled, mixed, mono }: Props<T>) {
  const fieldId = useFieldId();
  const uid = useId();
  const listId = `${uid}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const selIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [active, setActive] = useState(selIndex);
  const current = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const show = () => {
    if (disabled) return;
    setActive(selIndex);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    close();
    if (o.value !== value || mixed) onChange(o.value);
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const r = trigger.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const want = Math.min(280, options.length * 32 + 10);
    const below = vh - r.bottom - 12;
    const up = below < want && r.top > below;
    const room = up ? r.top - 12 : below;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)), top: up ? r.top - 6 : r.bottom + 6, width: r.width, maxH: Math.max(120, Math.min(280, room)), up });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const t = e.target as Node;
      if (trigger.current?.contains(t) || list.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, pos]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // editor shortcuts must not fire while operating the control
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter':
      case ' ': e.preventDefault(); pick(active); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          typed.current = { s: (now - typed.current.t < 600 ? typed.current.s : '') + e.key.toLowerCase(), t: now };
          const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s));
          if (hit >= 0) setActive(hit);
        }
    }
  };

  const shown = mixed ? t('Mixed') : t(current?.label ?? placeholder);
  return (
    <>
      <button
        ref={trigger}
        id={fieldId}
        type="button"
        role="combobox"
        className={`sel${open ? ' open' : ''}${mono ? ' mono' : ''}`}
        aria-label={t(label)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${uid}-o${active}` : undefined}
        disabled={disabled}
        data-empty={!current || mixed ? 'true' : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={onKey}
      >
        <span className="sel-value">{shown}</span>
        <ChevronDown className="sel-chev" size={14} aria-hidden />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={t(label)}
            className={`sel-pop${pos.up ? ' up' : ''}`}
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH, transform: pos.up ? 'translateY(-100%)' : undefined }}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${uid}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={!mixed && o.value === value}
                className={`sel-opt${i === active ? ' active' : ''}${!mixed && o.value === value ? ' selected' : ''}`}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="sel-opt-label">{t(o.label)}</span>
                {o.hint && <span className="sel-opt-hint">{t(o.hint)}</span>}
                {!mixed && o.value === value && <Check size={13} aria-hidden className="sel-check" />}
              </div>
            ))}
          </div>,
          portalRoot(),
        )}
    </>
  );
}
