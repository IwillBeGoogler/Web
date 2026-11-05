import { useId } from 'react';
import { t } from '../../i18n';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** helper line under the label */
  hint?: string;
  /** selected items disagree (renders the switch in its in-between state) */
  mixed?: boolean;
  disabled?: boolean;
}

/** Switch row: label (+ helper) on the left, track on the right. A real checkbox with role=switch underneath, so keyboard and screen readers work natively. */
export function Toggle({ checked, onChange, label, hint, mixed, disabled }: Props) {
  const hintId = useId();
  return (
    <label className={`toggle${mixed ? ' is-mixed' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={t(label)}
        aria-describedby={hint ? hintId : undefined}
        aria-checked={mixed ? 'mixed' : checked}
        checked={!mixed && checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-text">
        <span className="toggle-label">{t(label)}{mixed ? <em className="mixed-tag"> {t('Mixed')}</em> : null}</span>
        {hint && <span id={hintId} className="toggle-hint">{t(hint)}</span>}
      </span>
      <span className="toggle-track" aria-hidden><span className="toggle-thumb" /></span>
    </label>
  );
}
