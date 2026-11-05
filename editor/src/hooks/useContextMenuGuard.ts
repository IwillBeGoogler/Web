import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';

const isTextField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el?.closest?.('input, textarea, [contenteditable="true"]');
};

/**
 * Belt and braces: the browser's native context menu must never appear on the app surface.
 * Handlers on nodes / edges / pane / selection open our menu; this capture-phase guard prevents the native
 * one everywhere (except real text fields, where copy / paste is useful) and opens a fallback menu when nothing did.
 */
export function useContextMenuGuard() {
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      if (isTextField(e.target)) return;
      e.preventDefault();
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      setTimeout(() => {
        const ui = useUiStore.getState();
        if (ui.menu) return;
        if (!t.closest('.canvas, .react-flow')) return; // not on the canvas: just no native menu
        const x = e.clientX;
        const y = e.clientY;
        const nodeEl = t.closest('.react-flow__node[data-id]');
        const edgeEl = t.closest('.react-flow__edge[data-id], .react-flow__edge-interaction, [data-edge-id]');
        const st = useDiagramStore.getState();
        if (nodeEl) {
          const id = nodeEl.getAttribute('data-id')!;
          if (!st.nodes.find((n) => n.id === id)?.selected) st.selectOnly('node', id);
          ui.openMenu({ x, y, target: { type: 'node', id } });
        } else if (edgeEl) {
          const id = edgeEl.getAttribute('data-id') ?? edgeEl.getAttribute('data-edge-id');
          if (id) {
            st.selectOnly('edge', id);
            ui.openMenu({ x, y, target: { type: 'edge', id } });
          }
        } else if (t.closest('.react-flow__nodesselection')) ui.openMenu({ x, y, target: { type: 'selection' } });
        else ui.openMenu({ x, y, target: { type: 'pane' } });
      }, 0);
    };
    document.addEventListener('contextmenu', onContext, true);
    return () => document.removeEventListener('contextmenu', onContext, true);
  }, []);
}
