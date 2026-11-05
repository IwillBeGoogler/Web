import { beforeEach, describe, expect, it } from 'vitest';
import { handleA11yKey, focusedNodeId } from './keyboard';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import type { DiagramNode } from '../../types';

const node = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id.toUpperCase() } });
const key = (k: string, extra: Partial<KeyboardEventInit> = {}) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });

/** the DOM React Flow would render: focusable wrappers carrying data-id */
function mountNodes(ids: string[]) {
  document.body.innerHTML = '';
  for (const id of ids) {
    const el = document.createElement('div');
    el.className = 'react-flow__node';
    el.setAttribute('data-id', id);
    el.tabIndex = 0;
    document.body.appendChild(el);
  }
}
const focusDom = (id: string) => (document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement).focus();
const selected = () => useDiagramStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);

beforeEach(() => {
  useUiStore.getState().resetUi();
  useDiagramStore.getState().reset();
  useDiagramStore.getState().loadDiagram({ nodes: [node('a', 0, 0), node('b', 300, 0), node('c', 0, 200)], edges: [] });
  mountNodes(['a', 'b', 'c']);
});

describe('keyboard-only editing', () => {
  it('knows which node has focus', () => {
    expect(focusedNodeId()).toBeNull();
    focusDom('b');
    expect(focusedNodeId()).toBe('b');
  });

  it('Alt+arrows move focus and selection to the nearest node in that direction', () => {
    focusDom('a');
    expect(handleA11yKey(key('ArrowRight', { altKey: true }))).toBe(true);
    expect(focusedNodeId()).toBe('b');
    expect(selected()).toEqual(['b']);
    handleA11yKey(key('ArrowDown', { altKey: true }));
    expect(selected()).toEqual(['b']); // nothing below b: stays
    focusDom('a');
    handleA11yKey(key('ArrowDown', { altKey: true }));
    expect(selected()).toEqual(['c']);
  });

  it('plain arrows are left to the nudge shortcut', () => {
    focusDom('a');
    expect(handleA11yKey(key('ArrowRight'))).toBe(false);
  });

  it('Enter on a focused node edits its label', () => {
    focusDom('b');
    expect(handleA11yKey(key('Enter'))).toBe(true);
    expect(useUiStore.getState().editingId).toBe('b');
    expect(selected()).toEqual(['b']);
  });

  it('connect mode: Shift+C remembers the source, Enter on another node draws the edge, then the mode ends', () => {
    useDiagramStore.getState().selectOnly('node', 'a');
    const ui = useUiStore.getState();
    ui.setConnectFrom('a');
    focusDom('b');
    expect(handleA11yKey(key('Enter'))).toBe(true);
    const edges = useDiagramStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect([edges[0].source, edges[0].target]).toEqual(['a', 'b']);
    expect(useUiStore.getState().connectFrom).toBeNull();
  });

  it('connect mode refuses to connect a node to itself', () => {
    useUiStore.getState().setConnectFrom('a');
    focusDom('a');
    handleA11yKey(key('Enter'));
    expect(useDiagramStore.getState().edges).toHaveLength(0);
    expect(useUiStore.getState().connectFrom).toBe('a');
  });

  it('Delete on a focused but unselected node selects it first so the delete shortcut acts on it', () => {
    focusDom('c');
    expect(selected()).toEqual([]);
    expect(handleA11yKey(key('Delete'))).toBe(false);
    expect(selected()).toEqual(['c']);
  });
});
