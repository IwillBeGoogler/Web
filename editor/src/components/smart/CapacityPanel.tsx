import { useState } from 'react';
import { X } from 'lucide-react';
import { PRICES, describePriceSource } from '@core/capacity/prices';
import type { EdgeTraffic, NodeCapacity } from '@core/capacity';
import { useCapacity } from '../../hooks/useCapacity';
import { showProblem } from '../../lib/smart/lintBridge';
import { setEdgeTraffic, setNodeCapacity } from '../../lib/smart/capacityBridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useSmart } from '../../store/smartStore';
import { useEditorSession } from '../../sync/status';
import { t } from '../../i18n';

const usd = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const fmt = (n: number, d = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(d));
const SKUS = Object.entries(PRICES);

function NumField({ label, value, onChange, unit, step = 'any', disabled }: { label: string; value: number | undefined; onChange: (v: number | null) => void; unit?: string; step?: string; disabled?: boolean }) {
  return (
    <label className="cap-field">
      <span>{t(label)}</span>
      <input type="number" min={0} step={step} aria-label={t(label)} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
      {unit && <em>{t(unit)}</em>}
    </label>
  );
}

/**
 * Capacity & latency: enter rps / replicas / capacity / latency on the selected component and call, read bottlenecks, the worst-case
 * path, storage growth and a ROUGH monthly cost estimate (provider list prices, generated). Closed by default; the overlay marks the canvas while open.
 */
export function CapacityPanel() {
  const open = useSmart((s) => s.capacity);
  const setOpen = useSmart((s) => s.setCapacity);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const readOnly = useEditorSession((s) => s.readOnly);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const result = useCapacity(open);
  const [showCost, setShowCost] = useState(false);
  if (!open) return null;
  const selNodes = nodes.filter((n) => n.selected && ['icon', 'cluster', 'card'].includes(n.type ?? ''));
  const selEdges = edges.filter((e) => e.selected);
  const node = selNodes.length === 1 && !selEdges.length ? selNodes[0] : null;
  const edge = selEdges.length === 1 && !selNodes.length ? selEdges[0] : null;
  const cap = (node?.data.capacity ?? {}) as NodeCapacity;
  const traffic = (edge?.data?.traffic ?? {}) as EdgeTraffic;
  const name = (id: string) => String(nodes.find((n) => n.id === id)?.data.label ?? id);
  const w = result?.worstPath;
  const rows = result ? Object.entries(result.nodes).filter(([, r]) => r.costUsdMonth !== undefined).sort((a, b) => b[1].costUsdMonth! - a[1].costUsdMonth!) : [];
  return (
    <aside className="capacity-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Capacity and latency')} data-testid="capacity-panel">
      <div className="layers-head">
        <b>{t('Capacity & latency')}</b>
        <button type="button" className="layers-x" aria-label={t('Close capacity')} onClick={() => setOpen(false)}><X size={13} aria-hidden /></button>
      </div>
      <div className="problems-body cap-body">
        {node && (
          <fieldset className="cap-form" aria-label={t('Inputs of {name}', { name: name(node.id) })}>
            <legend>{name(node.id)}</legend>
            <NumField label="Requests in (rps)" value={cap.rps} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { rps: v })} unit="entry traffic" />
            <NumField label="Replicas" value={cap.replicas} step="1" disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { replicas: v })} />
            <NumField label="Capacity per replica" value={cap.capacityRps} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { capacityRps: v })} unit="rps" />
            <NumField label="Latency p50" value={cap.p50Ms} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { p50Ms: v })} unit="ms" />
            <NumField label="Latency p99" value={cap.p99Ms} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { p99Ms: v })} unit="ms" />
            <NumField label="Payload" value={cap.payloadKb} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { payloadKb: v })} unit="KB" />
            <NumField label="Write share" value={cap.writeRatio} step="0.01" disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { writeRatio: v === null ? null : Math.min(1, v) })} unit="0-1" />
            <NumField label="Stored now" value={cap.storageGb} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { storageGb: v })} unit="GB" />
            <label className="cap-field">
              <span>{t('Price')}</span>
              <select aria-label={t('Price')} value={cap.sku ?? ''} disabled={readOnly} onChange={(e) => setNodeCapacity(node.id, { sku: e.target.value || null })}>
                <option value="">{t('Default for this icon')}</option>
                {SKUS.map(([k, p]) => <option key={k} value={k}>{p.label} (${usd(p.usd)}{p.unit === 'instance-month' ? '/mo' : p.unit === 'per-gb-month' ? '/GB-mo' : p.unit === 'per-gb-transfer' ? '/GB' : '/M req'})</option>)}
              </select>
            </label>
            <NumField label="Monthly cost override" value={cap.monthlyCostUsd} disabled={readOnly} onChange={(v) => setNodeCapacity(node.id, { monthlyCostUsd: v })} unit="USD" />
          </fieldset>
        )}
        {edge && (
          <fieldset className="cap-form" aria-label={t('Inputs of the call')}>
            <legend>{name(edge.source)} → {name(edge.target)}</legend>
            <NumField label="Calls per request" value={traffic.ratio} step="0.1" disabled={readOnly} onChange={(v) => setEdgeTraffic(edge.id, { ratio: v })} unit="default 1" />
            <NumField label="Network p50" value={traffic.p50Ms} disabled={readOnly} onChange={(v) => setEdgeTraffic(edge.id, { p50Ms: v })} unit="ms" />
            <NumField label="Network p99" value={traffic.p99Ms} disabled={readOnly} onChange={(v) => setEdgeTraffic(edge.id, { p99Ms: v })} unit="ms" />
            <NumField label="Payload per call" value={traffic.payloadKb} disabled={readOnly} onChange={(v) => setEdgeTraffic(edge.id, { payloadKb: v })} unit="KB" />
          </fieldset>
        )}
        {!node && !edge && <p className="muted pad">{t('Select a component or a connection to enter its numbers. Give entry points an “rps”.')}</p>}
        {result && (
          <section className="cap-summary" aria-label={t('Results')}>
            <h4>{t('Worst-case path')}</h4>
            {w ? (
              <button type="button" className="cap-path" data-testid="cap-worst" onClick={() => showProblem(w.nodeIds, w.edgeIds)}>
                {w.nodeIds.map(name).join(' → ')}
                <strong>p99 {fmt(w.p99Ms)} ms</strong> <span className="muted">p50 {fmt(w.p50Ms)} ms{w.incomplete ? ` · ${t('some figures missing')}` : ''}</span>
              </button>
            ) : <p className="muted">{t('Enter latencies (p50 / p99) to see the slowest path.')}</p>}
            <h4>{t('Bottlenecks')}</h4>
            {result.bottlenecks.length ? (
              <ul className="cap-list">
                {result.bottlenecks.map((id) => {
                  const r = result.nodes[id];
                  return <li key={id}><button type="button" className={`cap-bn ${r.status}`} onClick={() => showProblem([id])}>{name(id)}<strong>{Math.round(r.utilization! * 100)}%</strong><span className="muted">{fmt(r.load)} of {fmt(r.capacity!)} rps</span></button></li>;
                })}
              </ul>
            ) : <p className="muted">{t('None. Set “Capacity per replica” to compare it with the load.')}</p>}
            {result.totals.storageGbPerMonth > 0 && (
              <>
                <h4>{t('Storage growth')}</h4>
                <p data-testid="cap-storage">{fmt(result.totals.storageGbPerMonth)} GB / month · {fmt(result.totals.storageGbPerYear, 0)} GB / year</p>
              </>
            )}
            <h4>{t('Monthly cost')} <span className="cap-estimate">{t('rough estimate')}</span></h4>
            {rows.length ? (
              <>
                <p data-testid="cap-cost"><strong>≈ ${usd(result.totals.costUsdMonth)}</strong> {t('per month')} <button type="button" className="link" onClick={() => setShowCost(!showCost)}>{showCost ? t('hide') : t('details')}</button></p>
                {showCost && (
                  <ul className="cap-list" aria-label={t('Cost per component')}>
                    {rows.map(([id, r]) => <li key={id}><span>{name(id)}{r.costAssumed ? ` ${t('(assumed)')}` : ''}</span><span>${usd(r.costUsdMonth!)}</span><span className="muted">{r.costLabel}</span></li>)}
                  </ul>
                )}
              </>
            ) : <p className="muted">{t('Pick a price on a component to estimate its cost.')}</p>}
            <p className="cap-disclaimer muted">{result.disclaimer}</p>
            <p className="cap-disclaimer muted" data-testid="cap-prices">{t('Prices:')} {result.priceSources.map(describePriceSource).join('; ')}</p>
            {result.warnings.map((m) => <p key={m} className="er-warn">{m}</p>)}
          </section>
        )}
      </div>
    </aside>
  );
}
