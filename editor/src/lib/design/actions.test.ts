import { beforeEach, describe, expect, it } from 'vitest';
import { followLink, linkBack, executeDesignAction } from './actions';
import { useUiStore } from '../../store/uiStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useWorkspace } from '../../workspace/store';
import type { DiagramNode } from '../../types';

const file = (id: string) => ({ id, folderId: null, name: id, kind: 'sdd' as const, position: 0, createdAt: 0, updatedAt: 0, pageCount: 1 });
beforeEach(() => {
  useUiStore.getState().resetUi();
  useDiagramStore.getState().reset();
  useDiagramStore.setState({ projectId: 'arch' });
  useWorkspace.setState({ projectId: 'prj1', tree: { folders: [], files: [file('arch'), file('erd')] } });
  window.history.replaceState({}, '', '/p/prj1/f/arch');
});

describe('link navigation', () => {
  it('follows a link to another file (with a node hash) and remembers where we came from', () => {
    useDiagramStore.setState({ nodes: [{ id: 'svc', type: 'icon', position: { x: 0, y: 0 }, selected: true, data: { label: 'Orders' } } as DiagramNode] });
    followLink({ fileId: 'erd', nodeId: 'orders' });
    expect(window.location.pathname + window.location.hash).toBe('/p/prj1/f/erd#node=orders');
    expect(useUiStore.getState().linkTrail).toEqual([{ fileId: 'arch', nodeId: 'svc' }]);
  });
  it('the breadcrumb back returns to the origin and clears the trail', () => {
    useDiagramStore.setState({ nodes: [{ id: 'svc', type: 'icon', position: { x: 0, y: 0 }, selected: true, data: { label: 'Orders' } } as DiagramNode] });
    followLink({ fileId: 'erd' });
    useDiagramStore.setState({ projectId: 'erd' }); // the editor now shows the other file
    linkBack();
    expect(window.location.pathname).toBe('/p/prj1/f/arch');
    expect(useUiStore.getState().linkTrail).toEqual([]);
  });
  it('a link to a file that no longer exists does not navigate', () => {
    followLink({ fileId: 'gone' });
    expect(window.location.pathname).toBe('/p/prj1/f/arch');
  });
  it('link-follow acts on the selected node; unknown actions are not ours', () => {
    useDiagramStore.setState({ nodes: [{ id: 'svc', type: 'icon', position: { x: 0, y: 0 }, selected: true, data: { label: 'Orders', link: { fileId: 'erd' } } } as DiagramNode] });
    expect(executeDesignAction('link-follow')).toBe(true);
    expect(window.location.pathname).toBe('/p/prj1/f/erd');
    expect(executeDesignAction('something-else')).toBe(false);
  });
});

describe('toggles', () => {
  it('layers, rulers, dev mode and plugins flip their flag (all off by default)', () => {
    const ui = () => useUiStore.getState();
    expect([ui().layersOpen, ui().rulers, ui().devMode, ui().pluginsOpen]).toEqual([false, false, false, false]);
    for (const a of ['layers-toggle', 'rulers-toggle', 'dev-toggle', 'plugins-open']) executeDesignAction(a);
    expect([ui().layersOpen, ui().rulers, ui().devMode, ui().pluginsOpen]).toEqual([true, true, true, true]);
  });
  it('toggle-hidden hides the selection in one undo step', () => {
    useDiagramStore.setState({ nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, selected: true, data: { label: 'a' } } as DiagramNode] });
    executeDesignAction('toggle-hidden');
    expect(useDiagramStore.getState().nodes[0].data.hidden).toBe(true);
    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().nodes[0].data.hidden).toBeFalsy();
  });
});
