import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { FieldIdCtx } from './fieldContext';
import { useTip } from '../Tooltip';
import { t } from '../../i18n';

/** Labelled form row: visible label tied to the control inside (through context), optional value readout and helper / error text. */
export function Field({ label, hint, value, mixed, error, children, inline }: { label: string; hint?: string; value?: ReactNode; mixed?: boolean; error?: string; children: ReactNode; inline?: boolean }) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={`prop-row${inline ? ' inline' : ''}`} data-mixed={mixed ? 'true' : undefined}>
      <div className="prop-head">
        <label className="prop-label" htmlFor={id}>{t(label)}{mixed ? <em className="mixed-tag"> {t('Mixed')}</em> : null}</label>
        {value !== undefined && <span className="prop-value">{value}</span>}
      </div>
      <FieldIdCtx.Provider value={id}>{children}</FieldIdCtx.Provider>
      {(error || hint) && <p id={noteId} className={`prop-hint${error ? ' error' : ''}`} role={error ? 'alert' : undefined}>{error ? t(error) : hint ? t(hint) : null}</p>}
    </div>
  );
}

/** Slider with the live value in the label row and a filled track. */
export function Slider({ label, value, min, max, step = 1, unit = '', onChange, ariaLabel }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; ariaLabel?: string }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <FieldSlider label={label} value={`${value}${unit}`}>
      {(id) => <input id={id} type="range" className="slider" min={min} max={max} step={step} aria-label={t(ariaLabel ?? label)} aria-valuetext={`${value}${unit}`} value={value} style={{ ['--pct' as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />}
    </FieldSlider>
  );
}
function FieldSlider({ label, value, children }: { label: string; value: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="prop-row">
      <div className="prop-head">
        <label className="prop-label" htmlFor={id}>{t(label)}</label>
        <span className="prop-value">{value}</span>
      </div>
      {children(id)}
    </div>
  );
}

/** Segmented control (buttons with aria-pressed so each stays an ordinary, labelled button). */
export function Seg<T extends string>({ value, options, onChange, label, mixed }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string; mixed?: boolean }) {
  return (
    <div className="seg" role="group" aria-label={t(label)}>
      {options.map(([v, text]) => {
        const on = !mixed && value === v;
        return (
          <button key={v} type="button" className={on ? 'active' : ''} aria-pressed={on} onClick={() => onChange(v)}>
            {t(text)}
          </button>
        );
      })}
    </div>
  );
}

/** Small read-only pill (member count, topology, ...). */
export function Chip({ children, tone, title }: { children: ReactNode; tone?: 'accent' | 'warn'; title?: string }) {
  return <span className={`chip${tone ? ` chip-${tone}` : ''}`} title={title}>{children}</span>;
}

interface ToolProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  danger?: boolean;
}
/** Square icon button of the header toolbar; aria-label + custom tooltip. */
export function ToolButton({ label, children, pressed, danger, className = '', ...rest }: ToolProps) {
  const tip = useTip({ title: t(label) });
  return (
    <button type="button" aria-label={t(label)} aria-pressed={pressed} className={`tool${danger ? ' danger-tool' : ''}${pressed ? ' on' : ''} ${className}`} {...tip} {...rest}>
      {children}
    </button>
  );
}

/** Section sub-heading inside a section body. */
export function SubHead({ children }: { children: ReactNode }) {
  return <div className="prop-subhead">{children}</div>;
}

/** Row of equal compact buttons (align, order, ...). */
export function ButtonGrid({ label, children, cols }: { label: string; children: ReactNode; cols?: number }) {
  return <div className="btn-grid" role="group" aria-label={t(label)} style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>{children}</div>;
}

/** Card at the top of the inspector: tile + title + meta chips, and a toolbar of actions. */
export function InspectorHeader({ tile, title, kind, meta, tools, primary }: { tile: ReactNode; title: ReactNode; kind: string; meta?: ReactNode; tools?: ReactNode; primary?: ReactNode }) {
  return (
    <header className="ins-head" data-testid="inspector-header">
      <div className="ins-head-main">
        <span className="ins-tile" aria-hidden>{tile}</span>
        <div className="ins-titles">
          {title}
          <div className="ins-meta">
            <span className="ins-kind">{t(kind)}</span>
            {meta}
          </div>
        </div>
      </div>
      {(tools || primary) && (
        <div className="ins-tools" role="toolbar" aria-label={t('{kind} actions', { kind: t(kind) })}>
          {primary}
          {tools}
        </div>
      )}
    </header>
  );
}
