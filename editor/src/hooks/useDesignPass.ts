import { useEffect } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { designPass } from '../lib/design/reflow';

/** auto-layout containers reflow and child constraints apply whenever the document changes (not while something is being dragged) */
export function useDesignPass(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const run = (nodes: ReturnType<typeof useDiagramStore.getState>['nodes'], prev: typeof nodes) => {
      const out = designPass(prev, nodes, { dragging: nodes.some((n) => n.dragging) });
      if (out) useDiagramStore.setState({ nodes: out });
    };
    run(useDiagramStore.getState().nodes, []);
    return useDiagramStore.subscribe((s, p) => {
      if (s.nodes !== p.nodes) run(s.nodes, p.nodes);
    });
  }, [enabled]);
}
