import { X } from 'lucide-react';
import { useCapacity } from '../../hooks/useCapacity';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

const SPIKES = [2, 5, 10];
const usd = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const rps = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;

/**
 * Global metrics strip: RPS in, worst-path p99, availability, dropped requests and monthly cost against the project budget, plus
 * the chaos controls (traffic spike, reset). Toggled from the command palette; recomputes with chaos applied.
 */
export function MetricsBar() {
  const open = useSmart((s) => s.metrics);
  const setOpen = useSmart((s) => s.setMetrics);
  const spike = useSmart((s) => s.spike);
  const setSpike = useSmart((s) => s.setSpike);
  const simulating = useSmart((s) => s.simulating);
  const resetChaos = useSmart((s) => s.resetChaos);
  const downCount = useSmart((s) => Object.keys(s.chaosNodes).length);
  const readOnly = useEditorSession((s) => s.readOnly);
  const settings = useDiagramStore((s) => s.projectSettings);
  const setSettings = useDiagramStore((s) => s.setProjectSettings);
  const result = useCapacity(open);
  if (!open) return null;
  const tot = result?.totals;
  const availCls = !tot ? '' : tot.availability >= 0.999 ? 'good' : tot.availability >= 0.99 ? 'warn' : 'bad';
  const setBudget = (v: number | null) => {
    const { monthlyBudgetUsd: _drop, ...rest } = settings;
    void _drop;
    setSettings(v && v > 0 ? { ...rest, monthlyBudgetUsd: v } : rest);
  };
  return (
    <div className="metrics-bar" role="region" aria-label={t('Metrics')} data-testid="metrics-bar">
      <span className="m"><span>{t('RPS in')}</span><b data-testid="m-rps">{tot ? rps(tot.rpsIn) : '–'}</b></span>
      <span className="m"><span>p99</span><b data-testid="m-p99">{tot && tot.p99Ms > 0 ? `${rps(tot.p99Ms)} ms` : '–'}</b></span>
      <span className={`m ${availCls}`}><span>{t('Availability')}</span><b data-testid="m-avail">{tot ? pct(tot.availability) : '–'}</b></span>
      <span className={`m ${tot && tot.droppedPct > 0 ? 'bad' : ''}`}><span>{t('Dropped')}</span><b data-testid="m-dropped">{tot ? `${tot.droppedPct.toFixed(1)}%` : '–'}</b></span>
      <span className={`m m-budget ${tot?.overBudget ? 'bad' : ''}`}>
        <span>$/{t('mo')}</span><b data-testid="m-cost">{tot ? usd(tot.costUsdMonth) : '–'}</b>
        <span>{t('of')}</span>
        <input type="number" min={0} aria-label={t('Monthly budget (USD)')} placeholder={t('budget')} value={settings.monthlyBudgetUsd ?? ''} disabled={readOnly} onChange={(e) => setBudget(e.target.value === '' ? null : Number(e.target.value))} />
        {tot?.overBudget && <b data-testid="m-over">{t('over budget')}</b>}
      </span>
      <span className="m-chaos" role="group" aria-label={t('Chaos')}>
        <span className="muted">{t('Spike')}</span>
        {SPIKES.map((k) => <button key={k} type="button" aria-pressed={spike === k} onClick={() => setSpike(spike === k ? 1 : k)}>×{k}</button>)}
        {simulating && <input type="range" className="m-traffic" min={0.1} max={10} step={0.1} value={spike} aria-label={t('Traffic')} title={`${t('Traffic')} ×${spike.toFixed(1)}`} data-testid="m-traffic" onChange={(e) => setSpike(Number(e.target.value))} />}
        {simulating && <span className="muted" data-testid="m-traffic-val">×{spike.toFixed(1)}</span>}
        {(spike !== 1 || downCount > 0) && <button type="button" onClick={resetChaos}>{t('Reset')}</button>}
      </span>
      <button type="button" className="m-x" aria-label={t('Close metrics')} onClick={() => setOpen(false)}><X size={13} aria-hidden /></button>
    </div>
  );
}
