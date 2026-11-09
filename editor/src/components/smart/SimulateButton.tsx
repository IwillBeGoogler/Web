import { Play, Square } from 'lucide-react';
import { executeSmartAction } from '../../lib/smart/actions';
import { useSmart } from '../../store/smartStore';
import { t } from '../../i18n';

/** one-click simulation toggle, bottom-left of the canvas (clear of the left rail / panels via --inset-l) */
export function SimulateButton() {
  const running = useSmart((s) => s.simulating);
  const Icon = running ? Square : Play;
  const label = running ? t('Stop simulation') : t('Start simulation');
  return (
    <button type="button" className={`sim-btn ${running ? 'running' : ''}`} aria-pressed={running} data-testid="sim-btn" onClick={() => executeSmartAction('simulate-toggle')}>
      <Icon size={14} aria-hidden fill="currentColor" /> {label}
    </button>
  );
}
