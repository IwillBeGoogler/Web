import { lazy, Suspense, useState } from 'react';
import { X } from 'lucide-react';
import type { Diagnostic } from '@core/dsl';
import { useSmart } from '../../store/smartStore';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

const CodeEditor = lazy(() => import('./CodeEditor'));

/** Diagrams as code: the `.sdd` text of this page next to the canvas (⌘⇧E). Opens on demand; the editor chunk loads on first use. */
export function SplitView() {
  const setCode = useSmart((s) => s.setCode);
  const readOnly = useEditorSession((s) => s.readOnly);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const errors = diags.filter((d) => d.severity === 'error');
  const warns = diags.length - errors.length;
  return (
    <section className="split-view" aria-label={t('Diagram text')} data-testid="split-view">
      <header className="split-head">
        <b>{t('Text')}</b>
        <span className={`split-status${errors.length ? ' bad' : ''}`} role="status" aria-live="polite" data-testid="split-status">
          {readOnly ? 'view only' : errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'}: ${errors[0].message} (line ${errors[0].line})` : warns ? `${warns} warning${warns === 1 ? '' : 's'}` : 'in sync'}
        </span>
        <button type="button" className="icon-btn" aria-label={t('Close text view')} title={`${t('Close')} (⇧⌘E)`} onClick={() => setCode(false)}><X size={14} aria-hidden /></button>
      </header>
      <Suspense fallback={<div className="split-loading muted pad">{t('Loading editor…')}</div>}>
        <CodeEditor onDiagnostics={setDiags} />
      </Suspense>
    </section>
  );
}
