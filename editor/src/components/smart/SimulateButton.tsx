import { Play, Square } from 'lucide-react';
import { executeSmartAction } from '../../lib/smart/actions';
import { useSmart } from '../../store/smartStore';
import { t } from '../../i18n';
import { useWorkspace } from '../../workspace/store';

/**
 * one-click simulation toggle, bottom-left of the canvas (clear of the left rail / panels via --inset-l).
 * Traffic simulation only means something for system design: ER, UML and board files do not get the button
 * (a file outside the workspace tree, e.g. a shared one, keeps it).
 */
export function SimulateButton({ fileId }: { fileId?: string }) {
  const running = useSmart((s) => s.simulating);
  const kind = useWorkspace((s) => (fileId ? s.tree.files.find((f) => f.id === fileId)?.kind : undefined));
  if (kind && kind !== 'sdd' && !running) return null;
  const Icon = running ? Square : Play;
  const label = running ? t('Stop simulation') : t('Start simulation');
  return (
    <button type="button" className={`sim-btn ${running ? 'running' : ''}`} aria-pressed={running} data-testid="sim-btn" onClick={() => executeSmartAction('simulate-toggle')}>
      <Icon size={14} aria-hidden fill="currentColor" /> {label}
    </button>
  );
}
