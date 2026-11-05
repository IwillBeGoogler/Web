import { beforeEach, describe, expect, it } from 'vitest';
import { applyText } from '../dsl/bridge';
import { useDiagramStore } from '../../store/diagramStore';
import { executeAction } from '../actions';
import { getMenuItems, flattenMenu } from '../menu';
import { keyToCommand } from '../keymap';
import { runAutoArrange } from './apply';
import { loadPrefs, savePrefs } from './prefs';

const s = () => useDiagramStore.getState();
const TEXT = '#!sdd 1\nnode a "A"\nnode b "B"\nnode c "C"\nnode d "D"\na -> b\na -> c\nb -> d\nc -> d\n';
beforeEach(() => {
  localStorage.clear();
  s().reset();
  applyText(TEXT);
  s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
});

describe('auto arrange on the store', () => {
  it('is exactly one undo step and undo restores positions', () => {
    const past = s().past.length;
    expect(runAutoArrange().moved).toBe(4);
    expect(s().past.length).toBe(past + 1);
    expect(new Set(s().nodes.map((n) => `${n.position.x},${n.position.y}`)).size).toBe(4);
    s().undo();
    expect(s().nodes.every((n) => n.position.x === 7 && n.position.y === 7)).toBe(true);
  });
  it('locked nodes do not move', () => {
    s().updateNodeData('d', { locked: true });
    runAutoArrange();
    expect(s().nodes.find((n) => n.id === 'd')!.position).toEqual({ x: 7, y: 7 });
  });
  it('drops hand-placed bends of edges whose nodes moved', () => {
    const e = s().edges[0];
    useDiagramStore.setState({ edges: s().edges.map((x) => (x.id === e.id ? { ...x, data: { ...x.data, manual: true, waypoints: [{ x: 1, y: 1 }] } } : x)) });
    runAutoArrange();
    expect(s().edges.find((x) => x.id === e.id)!.data?.waypoints).toBeUndefined();
  });
  it('uses the per-file prefs (direction)', () => {
    s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
    savePrefs(s().projectId, { algo: 'layered', direction: 'TB', spacing: 'normal' });
    runAutoArrange();
    const y = (id: string) => s().nodes.find((n) => n.id === id)!.position.y;
    expect(y('a')).toBeLessThan(y('b'));
  });
  it('prefs round-trip per file and fall back to defaults', () => {
    savePrefs('f1', { algo: 'erd', direction: 'LR', spacing: 'roomy' });
    expect(loadPrefs('f1')).toEqual({ algo: 'erd', direction: 'LR', spacing: 'roomy' });
    expect(loadPrefs('other').algo).toBe('auto');
  });
  it('is reachable from the action, the Shift+L key and the canvas menu', () => {
    executeAction('auto-arrange:page');
    expect(new Set(s().nodes.map((n) => n.position.x)).size).toBeGreaterThan(1);
    expect(keyToCommand({ key: 'L', code: 'KeyL', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false })).toEqual({ type: 'action', action: 'auto-arrange' });
    const items = flattenMenu(getMenuItems({ type: 'pane' }, { nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 }));
    expect(items.some((i) => i.id === 'auto-arrange:page')).toBe(true);
  });
});
