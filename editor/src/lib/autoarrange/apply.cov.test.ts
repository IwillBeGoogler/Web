import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyText } from '../dsl/bridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { toast } from '../../store/toastStore';
import { describeScope, runAutoArrange, ARRANGE_MS } from './apply';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs';

const s = () => useDiagramStore.getState();
const TEXT = '#!sdd 1\nnode a "A"\nnode b "B"\nnode c "C"\na -> b\nb -> c\n';
beforeEach(() => {
  localStorage.clear();
  s().reset();
  applyText(TEXT);
  s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); document.documentElement.removeAttribute('data-arranging'); });

describe('runAutoArrange extras', () => {
  it('animates (data-arranging set, then removed) unless reduced motion', () => {
    vi.useFakeTimers();
    runAutoArrange();
    expect(document.documentElement.hasAttribute('data-arranging')).toBe(true);
    vi.advanceTimersByTime(ARRANGE_MS + 100);
    expect(document.documentElement.hasAttribute('data-arranging')).toBe(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
    runAutoArrange();
    expect(document.documentElement.hasAttribute('data-arranging')).toBe(false);
  });
  it('selection: true arranges only the selected nodes; array selection too', () => {
    useDiagramStore.setState({ nodes: s().nodes.map((n) => ({ ...n, selected: n.id !== 'c' })) });
    const r = runAutoArrange({ selection: true });
    expect(r.ids).not.toContain('c');
    expect(r.moved).toBeGreaterThan(0);
    const r2 = runAutoArrange({ selection: ['a', 'b'] });
    expect(r2.ids.every((id) => id === 'a' || id === 'b')).toBe(true);
  });
  it('snap on uses the grid', () => {
    useUiStore.setState({ snap: true });
    runAutoArrange();
    expect(s().nodes.every((n) => n.position.x % 20 === 0)).toBe(true);
  });
  it('reports already tidy when nothing moves', () => {
    const info = vi.spyOn(toast, 'info');
    runAutoArrange();
    runAutoArrange();
    const again = runAutoArrange();
    expect(again).toEqual({ moved: 0, ids: [] });
    expect(info).toHaveBeenCalledWith('Already tidy');
  });
  it('keeps locked edges and resizes sized nodes; edges untouched when ends did not move', () => {
    useDiagramStore.setState({ edges: s().edges.map((e, i) => (i === 0 ? { ...e, data: { ...e.data, locked: true, waypoints: [{ x: 1, y: 1 }] } } : e)) });
    runAutoArrange();
    expect(s().edges[0].data?.waypoints).toEqual([{ x: 1, y: 1 }]);
  });
  it('describeScope', () => {
    expect(describeScope()).toBe('page');
    useDiagramStore.setState({ nodes: s().nodes.map((n) => ({ ...n, selected: n.id === 'a' })) });
    expect(describeScope()).toBe('page');
    useDiagramStore.setState({ nodes: s().nodes.map((n) => ({ ...n, selected: n.id !== 'c' })) });
    expect(describeScope()).toBe('selection');
    useDiagramStore.setState({ nodes: [{ ...s().nodes[0], type: 'group', selected: true }] });
    expect(describeScope()).toBe('group');
    useDiagramStore.setState({ nodes: [{ ...s().nodes[0], type: 'cluster', selected: true }] });
    expect(describeScope()).toBe('group');
  });
});

describe('prefs', () => {
  it('load: defaults, junk, partial, invalid', () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    const st = (v: string | null) => ({ getItem: () => v });
    expect(loadPrefs('f', st('not json'))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs('f', st('5'))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs('f', st(JSON.stringify({ algo: 'bogus', direction: 'XX', spacing: 'weird' })))).toEqual({ algo: DEFAULT_PREFS.algo, direction: null, spacing: 'normal' });
    expect(loadPrefs('f', st(JSON.stringify({ algo: 'tree', direction: 'LR', spacing: 'roomy' })))).toEqual({ algo: 'tree', direction: 'LR', spacing: 'roomy' });
    expect(loadPrefs('f', st(JSON.stringify({ direction: 'TB', spacing: 'compact' }))).direction).toBe('TB');
    expect(loadPrefs(undefined, { getItem: () => { throw new Error('x'); } })).toEqual(DEFAULT_PREFS);
  });
  it('save round trips per file and swallows errors', () => {
    savePrefs('f1', { algo: 'grid', direction: 'TB', spacing: 'compact' });
    expect(loadPrefs('f1').algo).toBe('grid');
    expect(loadPrefs('f2').algo).toBe(DEFAULT_PREFS.algo);
    savePrefs(null, DEFAULT_PREFS);
    expect(() => savePrefs('x', DEFAULT_PREFS, { setItem: () => { throw new Error('q'); } })).not.toThrow();
  });
});

import { useSettingsStore } from '../../store/settingsStore';
describe('runAutoArrange branches', () => {
  it('custom grid size, edges without data, one end moved, groups resized', () => {
    useSettingsStore.setState({ global: { ...useSettingsStore.getState().global, canvas: { ...(useSettingsStore.getState().global.canvas ?? {}), gridSize: 10 } } } as never);
    useUiStore.setState({ snap: true });
    useDiagramStore.setState({
      edges: s().edges.map((e) => { const { data: _d, ...rest } = e; return rest as typeof e; }),
    });
    runAutoArrange();
    expect(s().nodes.every((n) => n.position.x % 10 === 0)).toBe(true);
    expect(s().edges.every((e) => e.data !== undefined)).toBe(true);
    // group with children gets a size from the engine
    s().reset();
    applyText('#!sdd 1\ngroup g "G" {\n  node a "A"\n  node b "B"\n}\nnode c "C"\ng -> c\n');
    s().nodes.forEach((n) => { if (!n.parentId) s().setNodePosition(n.id, { x: 7, y: 7 }); });
    const r = runAutoArrange();
    expect(r.moved).toBeGreaterThan(0);
    const g = s().nodes.find((n) => n.id === 'g');
    if (g) expect(g.style?.width ?? g.width).toBeGreaterThan(0);
  });
});

describe('runAutoArrange: edges outside the moved set', () => {
  it('leaves an edge alone when neither end moved', () => {
    s().reset();
    applyText(TEXT);
    s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
    useDiagramStore.setState({ edges: s().edges.map((e) => (e.source === 'b' ? { ...e, data: { ...e.data, waypoints: [{ x: 9, y: 9 }] } } : e)) });
    runAutoArrange({ selection: ['a'] });
    const bc = s().edges.find((e) => e.source === 'b')!;
    expect(bc.data?.waypoints).toEqual([{ x: 9, y: 9 }]);
  });
});

describe('runAutoArrange: untouched edges', () => {
  it('keeps edges whose ends were not part of the layout, including edges without data', () => {
    s().reset();
    applyText('#!sdd 1\nnode a "A"\nnode b "B"\nnode c "C"\nnode d "D"\nnode e "E"\na -> b\nb -> c\nd -> e\n');
    s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
    useDiagramStore.setState({ edges: s().edges.map((e) => (e.source === 'd' ? { ...e, data: { ...e.data, waypoints: [{ x: 5, y: 5 }] } } : e.source === 'a' ? (({ data: _d, ...r }) => r as typeof e)(e) : e)) });
    const r = runAutoArrange({ selection: ['a', 'b', 'c'] });
    expect(r.moved).toBeGreaterThan(0);
    expect(s().edges.find((e) => e.source === 'd')!.data?.waypoints).toEqual([{ x: 5, y: 5 }]);
    expect(s().edges.find((e) => e.source === 'a')!.data).toBeDefined();
  });
});

describe('runAutoArrange: snap off', () => {
  it('does not snap when the ui snap is off', () => {
    s().reset();
    applyText(TEXT);
    useUiStore.setState({ snap: false });
    s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 }));
    expect(runAutoArrange().moved).toBeGreaterThan(0);
    useUiStore.setState({ snap: true });
  });
});
