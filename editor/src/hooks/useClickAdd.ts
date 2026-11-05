import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { DiagramNode } from '../types';
import { useLayoutStore } from '../store/layoutStore';
import { clickAdd, clickInsets, visibleFlowArea } from '../lib/clickAdd';

/** `const add = useClickAdd(); add(createNodesFromPaletteItem(...))`: places into free room of the visible viewport. */
export function useClickAdd() {
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const inspectorOpen = useLayoutStore((s) => s.inspectorOpen);
  const wsbar = useLayoutStore((s) => s.wsbar);
  return useCallback(
    (made: DiagramNode[]) => {
      const el = document.querySelector('.react-flow');
      const r = el?.getBoundingClientRect() ?? null;
      const insets = clickInsets(sidebarOpen, inspectorOpen, wsbar);
      const view = visibleFlowArea(r, insets, screenToFlowPosition);
      const paneCenter = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: view.x + view.width / 2, y: view.y + view.height / 2 };
      const centerShift = { x: paneCenter.x - (view.x + view.width / 2), y: paneCenter.y - (view.y + view.height / 2) };
      return clickAdd(made, { view, zoom: getZoom?.() ?? 1, setCenter, centerShift });
    },
    [screenToFlowPosition, setCenter, getZoom, sidebarOpen, inspectorOpen, wsbar],
  );
}
