import { useEffect, useRef } from 'react';
import { useFileStore } from '../store/fileStore';
import { useSddActions } from '../hooks/useSdd';
import { importConflictDialog } from '../lib/dialogActions';
import { Modal } from './ui/Modal';
import { t } from '../i18n';

/** Import conflict dialog (Replace / Open as copy), plus the list of import warnings (unknown icons, ...). */
export function OpenPrompts() {
  const pending = useFileStore((s) => s.pending);
  const warnings = useFileStore((s) => s.warnings);
  const setWarnings = useFileStore((s) => s.setWarnings);
  const { resolve } = useSddActions();
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const asked = useRef<unknown>(null);
  useEffect(() => {
    if (!pending || asked.current === pending) return;
    asked.current = pending;
    void importConflictDialog(pending.project.name).then((c) => resolveRef.current(c ?? 'cancel'));
  }, [pending]);
  return (
    <>
      <Modal open={warnings.length > 0 && !pending} title={t('Opened with warnings')} onClose={() => setWarnings([])}>
        <p className="muted">{t('These icons could not be found and are shown as a generic icon. Nothing was lost.')}</p>
        <ul className="warn-list">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <div className="modal-foot">
          <button type="button" className="primary" onClick={() => setWarnings([])}>{t('OK')}</button>
        </div>
      </Modal>
    </>
  );
}
