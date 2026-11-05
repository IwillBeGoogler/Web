import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { t } from '../i18n';

/** Keyboard connect mode: says what to do next (a polite live region, so a screen reader announces it too). */
export function ConnectHint() {
  const from = useUiStore((s) => s.connectFrom);
  const label = useDiagramStore((s) => (from ? String(s.nodes.find((n) => n.id === from)?.data.label || t('the selected node')) : ''));
  if (!from) return null;
  return (
    <div className="connect-hint glass" role="status" aria-live="polite" data-testid="connect-hint">
      {t('Connecting from')} <b>{label}</b>. {t('Move to the target with Tab or Alt+arrows, then press Enter. Esc cancels.')}
    </div>
  );
}
