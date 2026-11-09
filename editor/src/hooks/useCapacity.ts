import { useEffect, useState } from 'react';
import type { CapacityResult } from '@core/capacity';
import { activePage } from '../lib/dsl/bridge';
import { useDiagramStore } from '../store/diagramStore';
import { useSmart } from '../store/smartStore';

export const SIM_ENTRY_RPS = 1000;

/** capacity analysis of the active page (chaos and the project budget applied), recomputed (debounced) while `enabled` */
export function useCapacity(enabled: boolean, delay = 150): CapacityResult | null {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const budgetUsd = useDiagramStore((s) => s.projectSettings.monthlyBudgetUsd);
  const chaosNodes = useSmart((s) => s.chaosNodes);
  const spike = useSmart((s) => s.spike);
  const simulating = useSmart((s) => s.simulating);
  const [result, setResult] = useState<CapacityResult | null>(null);
  useEffect(() => {
    if (!enabled) { setResult(null); return; }
    let alive = true;
    const t = setTimeout(() => void import('@core/capacity').then((m) => alive && setResult(m.analyzeCapacity(activePage(), { chaos: { nodes: chaosNodes, spike }, budgetUsd, ...(simulating ? { assumeDefaults: true, defaultEntryRps: SIM_ENTRY_RPS } : {}) }))), delay);
    return () => { alive = false; clearTimeout(t); };
  }, [nodes, edges, enabled, delay, chaosNodes, spike, budgetUsd, simulating]);
  return result;
}
