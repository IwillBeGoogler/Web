import { useCommentsStore } from '../comments/store';
import { useFit } from './useFit';
import { useEffect } from 'react';
import { onFitRequest } from '../lib/fitBus';
import { useReactFlow } from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { isTypingTarget, keyToCommand } from '../lib/keymap';
import { executeAction } from '../lib/actions';
import { useLayoutStore } from '../store/layoutStore';
import { handleA11yKey } from '../lib/a11y/keyboard';
import { addNextStickyFrom, mmAddChild, mmAddSibling, mmNavigate, mmPromote } from '../lib/board/actions';

/** Global keyboard shortcuts (tools, clipboard, arrange, undo/redo, nudge, zoom). */
export function useShortcuts() {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const fit = useFit();
  // imports / template inserts ask the canvas to bring the new nodes into view
  useEffect(() => onFitRequest((ids) => fit(300, ids)), [fit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Board: Tab / Enter on a selected sticky or mind map node build the next one
      const onControl = !!(e.target as HTMLElement | null)?.closest?.('button, a, select, [role="menuitem"], [role="tab"]');
      if ((e.key === 'Tab' || e.key === 'Enter') && !e.metaKey && !e.ctrlKey && !e.altKey && !onControl) {
        const picked = useDiagramStore.getState().nodes.filter((n) => n.selected);
        const one = picked.length === 1 ? picked[0] : null;
        if (one?.type === 'mindmap') {
          e.preventDefault();
          if (e.key === 'Tab' && e.shiftKey) mmPromote(one.id);
          else if (e.key === 'Tab') mmAddChild(one.id);
          else mmAddSibling(one.id);
          return;
        }
        if (one?.type === 'sticky' && (e.key === 'Tab' || e.shiftKey)) {
          e.preventDefault();
          addNextStickyFrom(one.id, e.key === 'Tab' ? 'right' : 'below');
          return;
        }
        if (one && e.key === 'Enter' && (one.type === 'sticky' || one.type === 'frame')) {
          e.preventDefault();
          useUiStore.getState().setEditing(one.id);
          return;
        }
      }
      // mind map: arrows walk the tree, F2 or typing edits the selected node
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !onControl) {
        const sel = useDiagramStore.getState().nodes.filter((n) => n.selected);
        const mm = sel.length === 1 && sel[0].type === 'mindmap' ? sel[0] : null;
        if (mm) {
          const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key] as 'up' | 'down' | 'left' | 'right' | undefined;
          if (dir && !e.shiftKey) { e.preventDefault(); mmNavigate(mm.id, dir); return; }
          if (e.key === 'F2') { e.preventDefault(); useUiStore.getState().setEditing(mm.id); return; }
          if (e.key.length === 1 && e.key.trim() !== '' && e.key !== '?' && e.key !== '!') { e.preventDefault(); useUiStore.getState().setEditing(mm.id, e.key); return; } // typing replaces the text (tool letters: use the dock)
        }
      }
      if (!onControl && handleA11yKey(e)) return;
      const cmd = keyToCommand(e);
      if (!cmd || cmd.type === 'file') return; // file ops are handled app-wide (useFileShortcuts)
      const st = useDiagramStore.getState();
      const ui = useUiStore.getState();
      e.preventDefault();
      switch (cmd.type) {
        case 'tool':
          if (cmd.tool === 'comment' && !useCommentsStore.getState().fileId) return; // comments exist only in files of a server
          return ui.setTool(cmd.tool);
        case 'panel': return cmd.panel === 'sidebar' ? useLayoutStore.getState().toggleSidebar() : useLayoutStore.getState().toggleInspector();
        case 'undo': return st.undo();
        case 'redo': return st.redo();
        case 'nudge': return st.nudgeSelection(cmd.dx, cmd.dy);
        case 'zoom': return cmd.dir === 'in' ? void zoomIn({ duration: 100 }) : cmd.dir === 'out' ? void zoomOut({ duration: 100 }) : void zoomTo(1, { duration: 100 });
        case 'escape':
          if (ui.menu) ui.closeMenu();
          else if (ui.connectFrom) ui.setConnectFrom(null);
          else if (ui.traceNodeId) ui.setTrace(null);
          else if (ui.iconPickerFor) ui.setIconPicker(null);
          else if (ui.tool !== 'select') ui.setTool('select');
          else st.selectOnly('node', '');
          return;
        case 'action': {
          const sel = st.nodes.find((n) => n.selected);
          const edge = st.edges.find((x) => x.selected);
          return executeAction(cmd.action, {
            nodeId: sel?.id,
            edgeId: sel ? undefined : edge?.id,
            fitView: () => fit(200),
          });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit, zoomIn, zoomOut, zoomTo]);
}
