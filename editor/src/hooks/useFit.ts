import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useLayoutStore } from '../store/layoutStore';
import { fitPadding } from '../lib/viewport';

/** fitView that keeps content clear of the floating top bar, dock and the open side panels. */
export function useFit(): (duration?: number, nodeIds?: string[]) => void {
  const { fitView } = useReactFlow();
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  const wsbar = useLayoutStore((s) => s.wsbar);
  return useCallback(
    (duration = 200, nodeIds) => {
      void fitView({
        ...(nodeIds ? { nodes: nodeIds.map((id) => ({ id })) } : {}),
        padding: fitPadding(sidebarOpen, inspectorOpen, wsbar),
        maxZoom: 1,
        duration,
      });
    },
    [fitView, sidebarOpen, inspectorOpen, wsbar],
  );
}
