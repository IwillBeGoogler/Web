import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface AccordionSection {
  id: string;
  label: ReactNode;
  count?: number;
  content: ReactNode;
}
interface Props {
  sections: AccordionSection[];
  open: string[];
  onToggle: (id: string) => void;
  /** nesting level: 1 = big section header, 2 = sub header */
  level?: 1 | 2;
  className?: string;
  /** keep a closing section mounted until its fold animation ends (inspector) */
  smooth?: boolean;
}

function onHeaderKey(e: KeyboardEvent<HTMLButtonElement>) {
  const root = e.currentTarget.closest('[data-acc-root]');
  if (!root) return;
  const own = Array.from(root.querySelectorAll<HTMLButtonElement>(':scope > .acc-item > .acc-header'));
  const i = own.indexOf(e.currentTarget);
  let next = -1;
  if (e.key === 'ArrowDown') next = Math.min(own.length - 1, i + 1);
  else if (e.key === 'ArrowUp') next = Math.max(0, i - 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = own.length - 1;
  if (next >= 0) {
    e.preventDefault();
    own[next]?.focus();
  }
}

/** keeps a closing section's content mounted until its collapse animation has played, so it folds instead of vanishing */
function Body({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);
  return <>{open || mounted ? children : null}</>;
}

export function Accordion({ sections, open, onToggle, level = 1, className = '', smooth = false }: Props) {
  const uid = useId();
  return (
    <div className={`acc acc-l${level} ${className}`} data-acc-root>
      {sections.map((s) => {
        const isOpen = open.includes(s.id);
        const panelId = `${uid}-panel-${s.id}`;
        const headerId = `${uid}-header-${s.id}`;
        return (
          <div key={s.id} className={`acc-item${isOpen ? ' open' : ''}`}>
            <button
              type="button"
              id={headerId}
              className="acc-header"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => onToggle(s.id)}
              onKeyDown={onHeaderKey}
            >
              <svg className="acc-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="acc-label">{s.label}</span>
              {s.count !== undefined && <span className="acc-count">{s.count}</span>}
            </button>
            <div id={panelId} role="region" aria-labelledby={headerId} className="acc-body" data-open={isOpen}>
              <div className="acc-inner" inert={!isOpen || undefined}>{smooth ? <Body open={isOpen}>{s.content}</Body> : isOpen ? s.content : null}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
