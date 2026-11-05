import type { ReactNode } from 'react';
import { t } from '../../i18n';

/** Friendly empty state with a small inline illustration (diagram of connected boxes). */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="160" height="110" viewBox="0 0 160 110" fill="none" aria-hidden>
        <rect x="8" y="8" width="52" height="34" rx="9" className="ill-a" />
        <rect x="100" y="8" width="52" height="34" rx="9" className="ill-b" />
        <rect x="54" y="68" width="52" height="34" rx="9" className="ill-c" />
        <path d="M60 25h40M34 42v14a8 8 0 008 8h12M126 42v14a8 8 0 01-8 8h-12" className="ill-line" strokeDasharray="4 4" />
        <circle cx="34" cy="25" r="4" className="ill-dot" />
        <circle cx="126" cy="25" r="4" className="ill-dot" />
      </svg>
      <h3>{t(title)}</h3>
      {hint && <p className="muted">{t(hint)}</p>}
      {action}
    </div>
  );
}
