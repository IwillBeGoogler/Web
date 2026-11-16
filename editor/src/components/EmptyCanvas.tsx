import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { ALL_TEMPLATES, type Template } from '../templates';
import { t } from '../i18n';

interface Group { key: string; label: string; color: string; test: RegExp }
/** Template families, in display order; the first matching pattern wins and UML is the catch-all. */
const GROUPS: Group[] = [
  { key: 'cloud', label: 'Cloud & DevOps', color: '#4f8cff', test: /^(aws|gcp|azure|k8s|devops|monitoring)/ },
  { key: 'sd', label: 'System design', color: '#a78bfa', test: /^(sd-|system-design)/ },
  { key: 'lld', label: 'Low-level design', color: '#34d399', test: /^lld-/ },
  { key: 'db', label: 'Database', color: '#f59e0b', test: /^er-/ },
  { key: 'board', label: 'Boards', color: '#f472b6', test: /^board/ },
  { key: 'uml', label: 'UML', color: '#22d3ee', test: /./ },
];
const groupOf = (tpl: Template): Group => GROUPS.find((g) => g.test.test(tpl.id)) ?? GROUPS[GROUPS.length - 1]!;
/** "UML — Strategy" -> "Strategy": the group header already says UML. */
const shortName = (name: string): string => name.replace(/^[^—:]+(?: — |: )/, '');

/** Shown over an empty page: a small illustration plus "Start from template" / "Blank canvas". */
export function EmptyCanvas() {
  const empty = useDiagramStore((s) => s.nodes.length === 0);
  const pageId = useDiagramStore((s) => s.activePageId);
  const insert = useDiagramStore((s) => s.insertContent);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const tool = useUiStore((s) => s.tool);
  useEffect(() => {
    setPicking(false);
    setQuery('');
  }, [pageId]);
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
        <div className="empty-picker">
          <input type="search" className="empty-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search templates')} aria-label={t('Search templates')} />
          <div className="empty-templates" role="menu" aria-label={t('Templates')}>
            {GROUPS.map((g) => {
              const q = query.trim().toLowerCase();
              const items = ALL_TEMPLATES.filter((tpl) => groupOf(tpl) === g && (!q || t(tpl.name).toLowerCase().includes(q) || (tpl.tags ?? []).some((x) => x.toLowerCase().includes(q))));
              if (items.length === 0) return null;
              return (
                <section key={g.key} className="empty-group" style={{ ['--g' as string]: g.color }}>
                  <h4>{t(g.label)}<span className="badge">{items.length}</span></h4>
                  {items.map((tpl) => (
                    <button key={tpl.id} type="button" role="menuitem" aria-label={t(tpl.name)} className="empty-tpl" onClick={() => insert(tpl.build(), { select: false })}>
                      <span className="empty-tpl-dot" aria-hidden />
                      <span className="empty-tpl-name">{shortName(t(tpl.name))}</span>
                    </button>
                  ))}
                </section>
              );
            })}
            {ALL_TEMPLATES.every((tpl) => !t(tpl.name).toLowerCase().includes(query.trim().toLowerCase()) && !(tpl.tags ?? []).some((x) => x.toLowerCase().includes(query.trim().toLowerCase()))) ? <p className="muted">{t('No templates match')}</p> : null}
          </div>
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
