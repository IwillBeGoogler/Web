import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, Copy, RotateCcw, X } from 'lucide-react';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { diagramToSchema } from '../../lib/er/convert';
import { renderSql } from '../../lib/er/renderSql';
import { migrationSql } from '../../lib/er/migrate';
import { replaceTablesFromSql } from '../../lib/er/apply';
import { DIALECTS, type Dialect, type ErSchemaDef } from '../../lib/er/types';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

/**
 * Live CREATE TABLE script of the page's tables, kept in step with every edit on the canvas (editable: apply writes it
 * back), and a Migration tab with the ALTER script from a baseline (taken when the panel opens) to the current diagram.
 */
export function ErSqlPanel() {
  const open = useUiStore((s) => s.sqlPanelOpen);
  const nodes = useDeferredValue(useDiagramStore((s) => s.nodes));
  const edges = useDeferredValue(useDiagramStore((s) => s.edges));
  const [dialect, setDialect] = useState<Dialect>('postgres');
  const [tab, setTab] = useState<'schema' | 'migration'>('schema');
  const schema = useMemo(() => (open ? diagramToSchema(nodes, edges) : null), [open, nodes, edges]);
  const [baseline, setBaseline] = useState<ErSchemaDef | null>(null);
  useEffect(() => {
    if (!open) setBaseline(null);
    else if (!baseline && schema) setBaseline(schema);
  }, [open, baseline, schema]);
  const sql = useMemo(() => (schema && schema.tables.length + schema.enums.length ? renderSql(schema, dialect) : ''), [schema, dialect]);
  const migration = useMemo(() => (schema && baseline && tab === 'migration' ? migrationSql(baseline, schema, dialect) : ''), [schema, baseline, dialect, tab]);
  // null: showing the live script; a string: the user's unapplied edit
  const [draft, setDraft] = useState<string | null>(null);
  if (!open) return null;
  const apply = () => {
    if (draft === null) return;
    const r = replaceTablesFromSql(draft);
    if (!r) return void toast.error(t('No CREATE TABLE found'));
    setDraft(null);
    if (r.warnings.length) toast.info(t('Applied {n} tables · {w} warning(s): {first}', { n: r.tables, w: r.warnings.length, first: r.warnings[0] }));
    else toast.success(t(r.tables === 1 ? 'Applied {n} table' : 'Applied {n} tables', { n: r.tables }));
  };
  const close = () => useUiStore.getState().setDesign({ sqlPanelOpen: false });
  const shown = tab === 'migration' ? migration : draft ?? sql;
  return (
    <aside className="er-sql-panel" aria-label={t('SQL preview')}>
      <header>
        <div className="er-sql-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'schema'} onClick={() => setTab('schema')}>{t('Schema')}</button>
          <button type="button" role="tab" aria-selected={tab === 'migration'} onClick={() => setTab('migration')}>{t('Migration')}</button>
        </div>
        <select value={dialect} aria-label={t('SQL dialect')} onChange={(e) => setDialect(e.target.value as Dialect)}>
          {DIALECTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        {tab === 'schema' && draft !== null && <button type="button" title={t('Apply to diagram (Ctrl+Enter)')} aria-label={t('Apply SQL to diagram')} onClick={apply}><Check size={14} aria-hidden /></button>}
        {tab === 'schema' && draft !== null && <button type="button" title={t('Discard edit')} aria-label={t('Discard SQL edit')} onClick={() => setDraft(null)}><RotateCcw size={14} aria-hidden /></button>}
        {tab === 'migration' && <button type="button" title={t('Set baseline to the current diagram')} aria-label={t('Set migration baseline')} onClick={() => { setBaseline(schema); toast.success(t('Baseline set')); }}><Bookmark size={14} aria-hidden /></button>}
        <button type="button" title={t('Copy SQL')} aria-label={t('Copy SQL')} disabled={!shown} onClick={() => void navigator.clipboard?.writeText(shown).then(() => toast.success(t('Copied SQL')))}><Copy size={14} aria-hidden /></button>
        <button type="button" title={t('Close')} aria-label={t('Close SQL preview')} onClick={close}><X size={14} aria-hidden /></button>
      </header>
      {tab === 'schema' ? (
        <textarea
          className={draft !== null ? 'dirty' : undefined}
          spellCheck={false}
          aria-label={t('SQL')}
          value={draft ?? (sql || `-- ${t('no tables on this page')}\n`)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); apply(); } }}
        />
      ) : (
        <textarea readOnly spellCheck={false} aria-label={t('Migration SQL')} value={migration} onKeyDown={(e) => e.stopPropagation()} />
      )}
    </aside>
  );
}
