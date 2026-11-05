import { useRef } from 'react';
import { scrubValue } from '../../lib/scrub';
import { useFieldId } from './fieldContext';
import { t } from '../../i18n';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

/** Number field whose label can be dragged sideways to scrub the value (Shift = coarse, Alt = fine). */
export function ScrubInput({ label, value, onChange, min, max, step = 1, suffix }: Props) {
  const fieldId = useFieldId();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const down = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    drag.current = { x: e.clientX, v: value };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    onChange(scrubValue(drag.current.v, e.clientX - drag.current.x, { step, min, max, shift: e.shiftKey, alt: e.altKey }));
  };
  const up = () => {
    drag.current = null;
  };
  return (
    <div className="scrub">
      <span className="scrub-label" role="presentation" data-testid={`scrub-${label}`} title={t('Drag to change')} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {t(label)}
      </span>
      <input
        type="number"
        id={fieldId}
        aria-label={t(label)}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(scrubValue(n, 0, { step, min, max }));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(scrubValue(value, (e.key === 'ArrowUp' ? 1 : -1) * 4, { step, min, max, shift: e.shiftKey, alt: e.altKey }));
          }
        }}
      />
      {suffix ? <span className="scrub-suffix">{suffix}</span> : null}
    </div>
  );
}
