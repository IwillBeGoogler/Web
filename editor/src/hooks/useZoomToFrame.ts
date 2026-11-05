import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { frameRect } from '../lib/board/frames';

export interface FlowRect { x: number; y: number; width: number; height: number }

/** `zoomToRect(rect)` animates the viewport onto a flow rect; `zoomToFrame(id)` does it for a frame (returns false if it is gone) */
export function useZoomToFrame() {
  const { fitBounds } = useReactFlow();
  const zoomToRect = useCallback((r: FlowRect, o: { duration?: number; padding?: number } = {}) => void fitBounds(r, { duration: o.duration ?? 450, padding: o.padding ?? 0.1 }), [fitBounds]);
  const zoomToFrame = useCallback(
    (id: string, o: { duration?: number; padding?: number } = {}): boolean => {
      const f = useDiagramStore.getState().nodes.find((n) => n.id === id && n.type === 'frame');
      if (!f) return false;
      zoomToRect(frameRect(f), o);
      return true;
    },
    [zoomToRect],
  );
  return { zoomToRect, zoomToFrame };
}
