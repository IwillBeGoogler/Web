import { useEffect, useState } from 'react';
import type { Problem } from '@core/lint';
import { activePage } from '../lib/dsl/bridge';
import { useDiagramStore } from '../store/diagramStore';
import { useLintStore } from '../store/lintStore';

/** Problems of the active page. The lint module (and the icon catalog it reads) loads on first use; results are debounced while editing. */
export function useLintProblems(enabled = true, delay = 350): Problem[] {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const config = useLintStore((s) => s.config);
  const [problems, setProblems] = useState<Problem[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const t = setTimeout(() => {
      void import('@core/lint').then((m) => {
        if (alive) setProblems(m.lintPage(activePage(), config));
      });
    }, delay);
    return () => { alive = false; clearTimeout(t); };
  }, [nodes, edges, config, enabled, delay]);
  return problems;
}
