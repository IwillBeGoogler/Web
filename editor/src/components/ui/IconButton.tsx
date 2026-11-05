import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { t } from '../../i18n';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  children: ReactNode;
  active?: boolean;
  shortcut?: string;
  variant?: 'ghost' | 'secondary';
}

/** Icon-only button: aria-label is mandatory. */
export function IconButton({ label, children, active, shortcut, variant = 'ghost', className = '', ...rest }: Props) {
  return (
    <button type="button" aria-label={t(label)} title={shortcut ? `${t(label)} (${shortcut})` : t(label)} className={`btn btn-icon btn-${variant}${active ? ' is-active' : ''} ${className}`} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}
