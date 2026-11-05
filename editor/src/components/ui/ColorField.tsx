import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover } from './Popover';
import { useFieldId } from './fieldContext';
import type { Rect } from '../../lib/tooltip';
import { t } from '../../i18n';

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Colour control: a row of quick preset dots (`quick`) plus a trigger (swatch + mono hex) that opens a popover with every preset,
 * the native picker and a hex input.
 */
export function ColorField({ label, value, presets, onChange, mixed, quick = 0 }: { label: string; value: string; presets: readonly string[]; onChange: (c: string) => void; mixed?: boolean; quick?: number }) {
  const fieldId = useFieldId();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [hex, setHex] = useState(value);
  const btn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.left, y: r.top, width: r.width, height: r.height });
    setHex(value);
    setOpen((o) => !o);
  };
  const quickPresets = quick > 0 ? presets.filter((c) => c !== 'transparent').slice(0, quick) : [];
  const dot = (c: string, extra = '') => (
    <button
      key={c}
      type="button"
      aria-label={`${t(label)} ${c}`}
      title={c}
      className={`swatch${!mixed && c.toLowerCase() === value.toLowerCase() ? ' active' : ''}${c === 'transparent' ? ' none' : ''}${extra}`}
      style={c === 'transparent' ? undefined : { background: c }}
      onClick={() => { onChange(c); setOpen(false); }}
    />
  );
  const bad = hex !== '' && !HEX.test(hex);
  return (
    <div className={`color-field${quickPresets.length ? ' has-quick' : ''}`}>
      {quickPresets.length > 0 && <div className="swatches quick" role="group" aria-label={t('{label} quick colours', { label: t(label) })}>{quickPresets.map((c) => dot(c))}</div>}
      <button ref={btn} id={fieldId} type="button" className="color-trigger" aria-label={mixed ? t('{label}: mixed', { label: t(label) }) : `${t(label)}: ${value}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <span className={`color-chip${mixed ? ' mixed' : ''}`} style={mixed ? undefined : { background: value }} />
        <span className="color-hex">{mixed ? 'Mixed' : value.toUpperCase()}</span>
        <ChevronDown size={14} className="color-chev" aria-hidden />
      </button>
      <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label={`${label} colour`}>
        <div className="color-pop">
          <div className="swatches" role="group" aria-label={t('{label} presets', { label: t(label) })}>{presets.map((c) => dot(c))}</div>
          <div className="color-row">
            <input type="color" aria-label={t('{label} custom colour', { label: t(label) })} value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
            <input type="text" className="mono" spellCheck={false} aria-label={t('{label} hex', { label: t(label) })} aria-invalid={bad || undefined} value={hex} placeholder="#RRGGBB" onChange={(e) => { setHex(e.target.value); if (HEX.test(e.target.value)) onChange(e.target.value); }} />
          </div>
          {bad && <p className="prop-hint error">{t('Use a 6-digit hex like #2F6FDB')}</p>}
        </div>
      </Popover>
    </div>
  );
}
