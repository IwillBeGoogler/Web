import { useEffect, useState } from 'react';
import type { CapacityResult } from '@core/capacity';
import { activePage } from '../lib/dsl/bridge';
import { useDiagramStore } from '../store/diagramStore';

/** capacity analysis of the active page, recomputed (debounced) while `enabled` */
export function useCapacity(enabled: boolean, delay = 150): CapacityResult | null {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const [result, setResult] = useState<CapacityResult | null>(null);
  useEffect(() => {
    if (!enabled) { setResult(null); return; }
    let alive = true;
    const t = setTimeout(() => void import('@core/capacity').then((m) => alive && setResult(m.analyzeCapacity(activePage()))), delay);
    return () => { alive = false; clearTimeout(t); };
  }, [nodes, edges, enabled, delay]);
  return result;
}
