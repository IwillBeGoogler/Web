import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { executeAction } from '../actions';
import { toast } from '../../store/toastStore';
import { nearestInDirection, type Dir } from './nav';

const ARROWS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** The node that has DOM focus (Tab / Alt+arrows put it there), if any. */
export function focusedNodeId(): string | null {
  const el = (document.activeElement as HTMLElement | null)?.closest?.('.react-flow__node[data-id]');
  return el?.getAttribute('data-id') ?? null;
}

/** DOM focus + selection for a node (the inspector, nudge, Delete and the screen reader all follow it). */
export function focusNode(id: string): void {
  useDiagramStore.getState().selectOnly('node', id);
  const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
  el?.focus({ preventScroll: false });
}

/** nodes whose label is edited inline (everything else has its own editor or dialog) */
const editable = (type: string | undefined) => type !== 'junction' && type !== 'draw' && type !== 'stamp';

/**
 * Keyboard-only editing, on top of React Flow's own focus handling (Tab walks the nodes in DOM order):
 *  - Alt+arrows: move focus (and selection) to the nearest node in that direction
 *  - Enter on a focused node: edit its label (or, in connect mode, connect to it)
 *  - Shift+C: connect mode - the focused / selected node is the source, pick the target the same way, Enter connects, Esc cancels
 *  - Delete / Backspace on a focused node that is not selected yet: select it first (then the normal delete runs)
 * Returns true when the key was handled.
 */
export function handleA11yKey(e: KeyboardEvent): boolean {
  const st = useDiagramStore.getState();
  const ui = useUiStore.getState();
  const focused = focusedNodeId();
  const selected = st.nodes.filter((n) => n.selected);
  const current = focused ?? (selected.length === 1 ? selected[0].id : null);

  if (e.altKey && !e.metaKey && !e.ctrlKey && ARROWS[e.key]) {
    const from = current ?? st.nodes.find((n) => !n.hidden)?.id ?? null;
    if (!from) return false;
    e.preventDefault();
    const to = current ? nearestInDirection(st.nodes, from, ARROWS[e.key]) : from; // nothing selected yet: land on the first node
    if (to) focusNode(to);
    return true;
  }

  if (e.key === ' ' && focused && !e.altKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    st.selectOnly('node', focused); // Space selects the focused node (React Flow's own handler is off)
    return true;
  }

  if (e.key === 'Enter' && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && focused) {
    const node = st.nodes.find((n) => n.id === focused);
    if (!node) return false;
    if (ui.connectFrom) {
      e.preventDefault();
      const source = ui.connectFrom;
      if (source === focused) return toast.info('Pick a different node as the target'), true;
      st.connect({ source, target: focused, sourceHandle: null, targetHandle: null });
      ui.setConnectFrom(null);
      const label = (id: string) => String(st.nodes.find((n) => n.id === id)?.data.label || 'node');
      toast.success(`Connected ${label(source)} to ${label(focused)}`);
      return true;
    }
    if (!editable(node.type)) return false;
    e.preventDefault();
    st.selectOnly('node', focused);
    executeAction('rename', { nodeId: focused });
    return true;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && focused && !st.nodes.find((n) => n.id === focused)?.selected) {
    st.selectOnly('node', focused); // then the regular delete shortcut acts on it
    return false;
  }
  return false;
}
