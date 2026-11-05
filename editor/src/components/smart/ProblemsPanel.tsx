import { useMemo } from 'react';
import { AlertTriangle, Info, OctagonAlert, Wrench, X } from 'lucide-react';
import { LINT_RULES_META } from '../../lib/smart/lintMeta';
import type { Problem, Severity } from '@core/lint';
import { useLintProblems } from '../../hooks/useLintProblems';
import { applyFixToStore, showProblem } from '../../lib/smart/lintBridge';
import { useSmart } from '../../store/smartStore';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

const ICON = { error: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const TITLE: Record<string, string> = Object.fromEntries(LINT_RULES_META.map((r) => [r.id, r.title]));

/** Problems popover: opened from the rail badge or ⌘K; click a row to select and zoom, "Fix" for the trivial ones. */
export function ProblemsPanel() {
  const open = useSmart((s) => s.problems);
  const setOpen = useSmart((s) => s.setProblems);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const readOnly = useEditorSession((s) => s.readOnly);
  const problems = useLintProblems(open);
  const groups = useMemo(() => (['error', 'warning', 'info'] as Severity[]).map((sev) => ({ sev, items: problems.filter((p) => p.severity === sev) })).filter((g) => g.items.length), [problems]);
  if (!open) return null;
  const openRules = () => { useUiStore.getState().setSettingsOpen(true); };
  return (
    <aside className="problems-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Problems')} data-testid="problems-panel">
      <div className="layers-head">
        <b>{t('Problems')}</b>
        <span className="muted">{problems.length ? `${problems.length}` : t('none')}</span>
        <button type="button" className="problems-rules" onClick={openRules}>{t('Rules…')}</button>
        <button type="button" className="layers-x" aria-label={t('Close problems')} onClick={() => setOpen(false)}><X size={13} aria-hidden /></button>
      </div>
      <div className="problems-body">
        {!problems.length && <p className="muted pad">{t('No problems found.')}</p>}
        {groups.map((g) => {
          const Icon = ICON[g.sev];
          return (
            <section key={g.sev} aria-label={`${g.sev} problems`}>
              {g.items.map((p: Problem) => (
                <div key={p.id} className={`problem-row sev-${p.severity}`}>
                  <button type="button" className="problem-main" onClick={() => showProblem(p.nodeIds, p.edgeIds)} title={t(TITLE[p.rule] ?? p.rule)}>
                    <Icon size={14} aria-hidden className="problem-ico" />
                    <span className="problem-msg">{p.message}</span>
                    <span className="problem-rule">{t(TITLE[p.rule] ?? p.rule)}</span>
                  </button>
                  {p.fix && !readOnly && (
                    <button type="button" className="problem-fix" onClick={() => applyFixToStore(p.fix!)} title={p.fix.label}><Wrench size={12} aria-hidden /> {t('Fix')}</button>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
