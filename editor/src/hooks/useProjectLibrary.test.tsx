import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectLibrary } from './useProjectLibrary';
import { useDesignPass } from './useDesignPass';
import { useDiagramStore } from '../store/diagramStore';
import { useLibraryDoc } from '../lib/library/store';
import { executeAction } from '../lib/actions';
import { useUiStore } from '../store/uiStore';
import { addColorStyle } from '../lib/library/styles';
import type { DiagramNode } from '../types';

function Harness() {
  useProjectLibrary('prj_test', false);
  useDesignPass(true);
  return null;
}
const card = (id: string, label: string, x: number): DiagramNode => ({ id, type: 'card', position: { x, y: 0 }, width: 100, height: 60, data: { label, fill: '#ffffff' } }) as DiagramNode;
const st = () => useDiagramStore.getState();
const tick = async (ms = 300) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useLibraryDoc.getState().close();
});
afterEach(() => vi.useRealTimers());

describe('project components end to end (single file)', () => {
  it('create component -> insert -> edit main -> instance follows; overrides survive', async () => {
    render(<Harness />);
    act(() => { useDiagramStore.setState({ nodes: [card('a', 'API', 0), card('b', 'DB', 200)], edges: [] }); useDiagramStore.getState().selectAll(); });
    act(() => executeAction('create-component'));
    const lib = () => Object.values(useLibraryDoc.getState().doc.components);
    expect(lib()).toHaveLength(1);
    const def = lib()[0];
    act(() => executeAction(`insert-component:${def.id}`, { at: { x: 600, y: 400 } }));
    const instGroup = () => st().nodes.find((n) => n.data.instance && !n.data.componentMain)!;
    expect(instGroup()).toBeTruthy();
    expect(st().nodes.filter((n) => n.parentId === instGroup().id)).toHaveLength(2);

    // override the text of one instance child (goes through the normal inspector path)
    const child = st().nodes.find((n) => n.parentId === instGroup().id && n.data.label === 'API')!;
    act(() => st().updateNodeData(child.id, { label: 'Orders API', fill: '#ff0000' }));
    expect(instGroup().data.instance!.overrides[child.data.instKey as string]).toEqual({ label: 'Orders API', fill: '#ff0000' });

    // edit the main: DB -> Postgres, stroke changed
    act(() => st().updateNodeData(st().nodes.find((n) => n.parentId === def.mainNodeId && n.data.label === 'DB')!.id, { label: 'Postgres', stroke: '#00ff00' }));
    await tick();
    expect(useLibraryDoc.getState().doc.components[def.id].rev).toBe(2);
    await tick();
    const kids = st().nodes.filter((n) => n.parentId === instGroup().id);
    expect(kids.map((k) => k.data.label).sort()).toEqual(['Orders API', 'Postgres']);
    expect(kids.find((k) => k.data.label === 'Orders API')!.data.fill).toBe('#ff0000');
    expect(kids.find((k) => k.data.label === 'Postgres')!.data.stroke).toBe('#00ff00');
  });

  it('detach and reset overrides via the actions', async () => {
    render(<Harness />);
    act(() => { useDiagramStore.setState({ nodes: [card('a', 'API', 0)], edges: [] }); useDiagramStore.getState().selectAll(); });
    act(() => executeAction('create-component'));
    const def = Object.values(useLibraryDoc.getState().doc.components)[0];
    act(() => executeAction(`insert-component:${def.id}`));
    const g = st().nodes.find((n) => n.data.instance && !n.data.componentMain)!;
    const kid = st().nodes.find((n) => n.parentId === g.id)!;
    act(() => st().updateNodeData(kid.id, { label: 'Mine' }));
    act(() => executeAction('reset-overrides', { nodeId: g.id }));
    expect(st().nodes.find((n) => n.id === kid.id)!.data.label).toBe('API');
    act(() => executeAction('detach-instance', { nodeId: g.id }));
    expect(st().nodes.find((n) => n.id === g.id)!.data.instance).toBeUndefined();
    act(() => st().undo());
    expect(st().nodes.find((n) => n.id === g.id)!.data.instance).toBeTruthy();
  });

  it('a style edit updates every node that uses it (styles panel -> all users)', async () => {
    render(<Harness />);
    act(() => useLibraryDoc.getState().update((d) => addColorStyle(d, { id: 'brand', name: 'Brand', value: '#2f6fdb' })));
    act(() => { useDiagramStore.setState({ nodes: [card('a', 'A', 0), card('b', 'B', 200)], edges: [] }); useDiagramStore.getState().selectAll(); });
    act(() => executeAction('style-apply:fill:brand'));
    expect(st().nodes.map((n) => n.data.fill)).toEqual(['#2f6fdb', '#2f6fdb']);
    act(() => useLibraryDoc.getState().update((d) => addColorStyle(d, { id: 'brand', name: 'Brand', value: '#00aa00' })));
    expect(st().nodes.map((n) => n.data.fill)).toEqual(['#00aa00', '#00aa00']);
  });

  it('auto layout via the action wraps the selection and reflows when a child is added or removed', async () => {
    render(<Harness />);
    act(() => { useDiagramStore.setState({ nodes: [card('a', 'A', 0), card('b', 'B', 300)], edges: [] }); useDiagramStore.getState().selectAll(); });
    act(() => executeAction('auto-layout:row'));
    const g = () => st().nodes.find((n) => n.data.autoLayout)!;
    expect(g()).toBeTruthy();
    const xs = () => st().nodes.filter((n) => n.parentId === g().id).map((n) => n.position.x);
    expect(xs()).toEqual([16, 132]);
    act(() => st().deleteNodes(['a']));
    expect(xs()).toEqual([16]);
    expect(g().width).toBe(132);
  });
});
