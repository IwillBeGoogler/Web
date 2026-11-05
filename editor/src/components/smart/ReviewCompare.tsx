import { createElement, useState } from 'react';
import { dialogs, type CustomApi } from '../../lib/dialogs';
import { compareWithCurrent, listCompareTargets, loadBaseline, type CompareTarget } from '../../lib/smart/review';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';
import { toast } from '../../store/toastStore';
import { useDiffStore } from '../../versions/diffStore';
import { t as tr } from '../../i18n';

function ComparePicker({ done, cancel }: CustomApi<CompareTarget>) {
  const [targets, setTargets] = useState<CompareTarget[] | null>(null);
  if (targets === null) void listCompareTargets().then(setTargets);
  return (
    <div className="dialog-body">
      <p className="muted">{tr('Compare the open file with another file of this project or with a saved version. The changes are drawn on the canvas.')}</p>
      {targets === null && <p className="muted">{tr('Loading…')}</p>}
      {targets?.length === 0 && <p className="muted">{tr('There is nothing to compare with yet: add another file or save a version.')}</p>}
      <ul className="share-list" aria-label={tr('Compare with')}>
        {targets?.map((t) => (
          <li key={`${t.kind}-${t.id}`}>
            <span>{t.kind === 'version' ? '⏱ ' : ''}{t.name}</span>
            <button type="button" onClick={() => done(t)}>{tr('Compare')}</button>
          </li>
        ))}
      </ul>
      <div className="modal-foot dialog-actions"><button type="button" onClick={cancel}>{tr('Cancel')}</button></div>
    </div>
  );
}

/** ⌘K "Compare…": pick a file or version, then show the review panel and the overlay */
export async function openCompare(): Promise<void> {
  const t = await dialogs.custom<CompareTarget>({ title: tr('Compare with…'), className: 'share-dialog', render: (api) => createElement(ComparePicker, api) });
  if (!t) return;
  try {
    const baseline = await loadBaseline(t);
    const diff = compareWithCurrent(baseline, useDiagramStore.getState().toProject());
    useDiffStore.getState().show(diff, t.name, 'Current');
    useSmart.getState().setDiff(true);
    if (diff.isEmpty) toast.info(tr('No differences'));
  } catch (e) {
    toast.error(tr('Could not compare: {msg}', { msg: e instanceof Error ? e.message : String(e) }));
  }
}
