import { Check, X } from 'lucide-react';
import type { ClassChange, MemberChange, RelChange } from '../../lib/uml/drift';
import { driftKey } from '../../lib/uml/drift';
import { useDriftStore } from '../../lib/uml/driftStore';
import { showProblem } from '../../lib/smart/lintBridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

const SIGN = { added: '+', removed: '−', changed: '~' } as const;
const memberText = (m: MemberChange) => {
  const f = m.status === 'changed' ? ` (${m.fields.join(', ')})` : '';
  const t = (x?: { type?: string; name: string }) => (x ? `${x.name}${x.type ? `: ${x.type}` : ''}` : '');
  return m.status === 'changed' ? `${t(m.before)} → ${t(m.after)}${f}` : t(m.after ?? m.before);
};

/** Code sync panel: what differs between the canvas and the code you re-imported, with Accept (take the code's version) and Reject (keep the diagram). */
export function DriftPanel() {
  const drift = useDriftStore((s) => s.drift);
  useDriftStore((s) => s.dismissed);
  const source = useDriftStore((s) => s.source);
  const store = useDriftStore.getState;
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const readOnly = useEditorSession((s) => s.readOnly);
  useDiagramStore((s) => s.nodes); // class nodes change as items are accepted
  if (!drift) return null;
  const v = store().visible()!;
  const open = (c: ClassChange) => c.nodeId && showProblem([c.nodeId]);
  const actions = (item: Parameters<ReturnType<typeof store>['accept']>[0], label: string) => (
    <span className="drift-actions">
      {!readOnly && <button type="button" className="drift-accept" aria-label={t('Accept {label}', { label })} title={t("Take the code's version")} onClick={() => store().accept(item)}><Check size={12} aria-hidden /></button>}
      <button type="button" className="drift-reject" aria-label={t('Reject {label}', { label })} title={t("Keep the diagram's version")} onClick={() => store().reject(driftKey(item))}><X size={12} aria-hidden /></button>
    </span>
  );
  const classRows = v.classes.filter((c) => c.status !== 'same');
  return (
    <aside className="drift-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Code sync')} data-testid="drift-panel">
      <div className="layers-head">
        <b>{t('Code sync')}</b>
        <span className="muted drift-src">{source}</span>
        <button type="button" className="layers-x" aria-label={t('Close code sync')} onClick={() => store().clear()}><X size={13} aria-hidden /></button>
      </div>
      {!v.isEmpty && (
        <div className="drift-bulk">
          {!readOnly && <button type="button" onClick={() => store().acceptAll()}>{t('Accept all')}</button>}
          <button type="button" onClick={() => store().rejectAll()}>{t('Reject all')}</button>
        </div>
      )}
      <div className="problems-body">
        {v.isEmpty && <p className="muted pad">{t('The diagram matches the code.')}</p>}
        {classRows.map((c) => (
          <section key={c.name} className="drift-class">
            <div className="drift-class-head">
              <button type="button" className="drift-name" onClick={() => open(c)}><span className={`review-sign ${c.status}`}>{SIGN[c.status as 'added']}</span> {c.name}<em> {c.status === 'added' ? t('new in code') : c.status === 'removed' ? t('not in code') : t('changed')}</em></button>
              {(c.status === 'added' || c.status === 'removed') && actions({ class: c }, `${c.status} class ${c.name}`)}
              {c.status === 'changed' && Object.keys(c.header).length > 0 && actions({ class: c }, `header of ${c.name}`)}
            </div>
            {Object.entries(c.header).map(([k, [a, b]]) => <div key={k} className="drift-line muted">{k}: {String(a ?? '(none)')} → {String(b ?? '(none)')}</div>)}
            {c.members.map((m) => (
              <div key={m.key} className={`drift-line drift-${m.status}`}>
                <span className={`review-sign ${m.status}`}>{SIGN[m.status]}</span>
                <span className="drift-text">{memberText(m)}</span>
                {actions({ class: c, member: m }, `${m.status} member ${m.name} of ${c.name}`)}
              </div>
            ))}
          </section>
        ))}
        {v.relations.map((r: RelChange) => (
          <div key={r.key} className={`drift-line drift-${r.status}`}>
            <span className={`review-sign ${r.status}`}>{SIGN[r.status]}</span>
            <span className="drift-text">{r.rel.from} {r.rel.kind} {r.rel.to}</span>
            {actions({ relation: r }, `${r.status} relation ${r.rel.from} to ${r.rel.to}`)}
          </div>
        ))}
      </div>
    </aside>
  );
}
