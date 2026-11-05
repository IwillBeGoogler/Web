import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { ALL_TEMPLATES } from '../templates';
import { t } from '../i18n';

/** Shown over an empty page: a small illustration plus "Start from template" / "Blank canvas". */
export function EmptyCanvas() {
  const empty = useDiagramStore((s) => s.nodes.length === 0);
  const pageId = useDiagramStore((s) => s.activePageId);
  const insert = useDiagramStore((s) => s.insertContent);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const tool = useUiStore((s) => s.tool);
  useEffect(() => setPicking(false), [pageId]);
  if (!empty || dismissedFor === pageId || tool !== 'select') return null;
  return (
    <motion.div className={`empty-canvas${picking ? ' picking' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} data-testid="empty-canvas">
      <svg className="empty-ill" width="200" height="130" viewBox="0 0 160 110" fill="none" aria-hidden>
        <rect x="8" y="8" width="52" height="34" rx="9" className="ill-a" />
        <rect x="100" y="8" width="52" height="34" rx="9" className="ill-b" />
        <rect x="54" y="68" width="52" height="34" rx="9" className="ill-c" />
        <path d="M60 25h40M34 42v14a8 8 0 008 8h12M126 42v14a8 8 0 01-8 8h-12" className="ill-line" strokeDasharray="4 4" />
        <circle cx="34" cy="25" r="4" className="ill-dot" />
        <circle cx="126" cy="25" r="4" className="ill-dot" />
      </svg>
      <h3>{t('Start your diagram')}</h3>
      <p className="muted">{t('Drag components from the left, or press')} <kbd>⌘K</kbd> {t('to search.')}</p>
      {picking ? (
        <div className="empty-templates" role="menu" aria-label={t('Templates')}>
          {ALL_TEMPLATES.map((tpl) => (
            <button key={tpl.id} type="button" role="menuitem" className="btn" onClick={() => insert(tpl.build(), { select: false })}>{t(tpl.name)}</button>
          ))}
        </div>
      ) : (
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>{t('Start from template')}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setDismissedFor(pageId)}>{t('Blank canvas')}</button>
        </div>
      )}
    </motion.div>
  );
}
