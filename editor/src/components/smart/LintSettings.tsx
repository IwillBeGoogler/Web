import type { Severity } from '@core/lint';
import { LINT_RULES_META } from '../../lib/smart/lintMeta';
import { useLintStore } from '../../store/lintStore';
import { t } from '../../i18n';

const CATS = [['architecture', 'Architecture'], ['erd', 'ERD'], ['uml', 'UML']] as const;

/** Settings > Problems: switch each lint rule on or off and change its severity. */
export function LintSettings() {
  const config = useLintStore((s) => s.config);
  const setRule = useLintStore((s) => s.setRule);
  const setNaming = useLintStore((s) => s.setNaming);
  const reset = useLintStore((s) => s.reset);
  return (
    <fieldset data-testid="lint-settings">
      <legend>{t('Problems (lint rules)')}</legend>
      <p className="muted">{t('Deterministic checks, no AI. Turn a rule off or change how serious it is.')}</p>
      {CATS.map(([cat, name]) => (
        <div key={cat} className="lint-cat">
          <div className="lint-cat-title">{t(name)}</div>
          {LINT_RULES_META.filter((r) => r.category === cat).map((r) => {
            const c = config.rules?.[r.id];
            const enabled = c?.enabled !== false;
            return (
              <div key={r.id} className="prop-row lint-rule">
                <label className="prop-check"><input type="checkbox" checked={enabled} aria-label={t('Enable {title}', { title: t(r.title) })} onChange={(e) => setRule(r.id, { enabled: e.target.checked })} /> {t(r.title)}</label>
                <select aria-label={t('Severity of {title}', { title: t(r.title) })} disabled={!enabled} value={c?.severity ?? r.severity} onChange={(e) => setRule(r.id, { severity: e.target.value === r.severity ? null : (e.target.value as Severity) })}>
                  <option value="error">{t('Error')}</option><option value="warning">{t('Warning')}</option><option value="info">{t('Info')}</option>
                </select>
              </div>
            );
          })}
        </div>
      ))}
      <div className="prop-row">
        <span className="prop-label">{t('Naming style')}</span>
        <select aria-label={t('Naming style')} value={config.naming ?? 'snake_case'} onChange={(e) => setNaming(e.target.value as 'snake_case' | 'camelCase' | 'any')}>
          <option value="snake_case">snake_case</option><option value="camelCase">camelCase</option><option value="any">{t('Anything')}</option>
        </select>
      </div>
      <button type="button" onClick={reset}>{t('Reset rules')}</button>
    </fieldset>
  );
}
