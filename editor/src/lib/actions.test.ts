import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAction, type ActionEnv } from './actions';
import { useDiagramStore } from '../store/diagramStore';
import { useDialogStore } from './dialogs';
import { useUiStore } from '../store/uiStore';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: 100, height: 50, data: { label: id, iconId: 'service' }, ...extra,
});
const env = (over: Partial<ActionEnv> = {}): ActionEnv => ({ ...over });
beforeEach(() => {
  s().reset();
  useUiStore.getState().resetUi();
});

describe('executeAction (store effects, all undoable)', () => {
  it('delete / copy / paste / cut / duplicate', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    executeAction('copy', env());
    executeAction('paste', env());
    expect(s().nodes).toHaveLength(2);
    executeAction('duplicate', env());
    expect(s().nodes).toHaveLength(3);
    executeAction('delete', env());
    expect(s().nodes).toHaveLength(2);
    s().undo();
    expect(s().nodes).toHaveLength(3);
  });
  it('cut', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    executeAction('cut', env());
    expect(s().nodes).toHaveLength(0);
    expect(s().clipboard).not.toBeNull();
  });
  it('lock / unlock', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    executeAction('lock', env());
    expect(s().nodes[0].data.locked).toBe(true);
    executeAction('unlock', env());
    expect(s().nodes[0].data.locked).toBeFalsy();
  });
  it('arrange z-order', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().addNode(n('b'));
    executeAction('bring-front', env());
    expect(s().nodes.map((x) => x.id)).toEqual(['b', 'a']);
    executeAction('send-back', env());
    expect(s().nodes.map((x) => x.id)).toEqual(['a', 'b']);
    executeAction('bring-forward', env());
    expect(s().nodes.map((x) => x.id)).toEqual(['b', 'a']);
    executeAction('send-backward', env());
    expect(s().nodes.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('align / distribute', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    s().addNode(n('b', 50, 100, { selected: true }));
    executeAction('align:left', env());
    expect(s().nodes[1].position.x).toBe(0);
  });
  it('group / ungroup / delete-group-with-children / delete-group-only', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    s().addNode(n('b', 300, 100, { selected: true }));
    executeAction('group', env());
    const g = s().nodes.find((x) => x.type === 'group')!;
    executeAction('select-children', env({ nodeId: g.id }));
    expect(s().nodes.filter((x) => x.selected).map((x) => x.id).sort()).toEqual(['a', 'b']);
    executeAction('delete-group-only', env({ nodeId: g.id }));
    expect(s().nodes.map((x) => x.id).sort()).toEqual(['a', 'b']);
    s().undo();
    executeAction('delete-group-with-children', env({ nodeId: g.id }));
    expect(s().nodes).toHaveLength(0);
  });
  it('style actions apply to selected nodes', () => {
    s().addNode(n('a', 0, 0, { type: 'shape', selected: true }));
    executeAction('fill:#fff3a3', env());
    executeAction('stroke:#0f7b6c', env());
    executeAction('strokeStyle:dashed', env());
    expect(s().nodes[0].data).toMatchObject({ fill: '#fff3a3', stroke: '#0f7b6c', strokeStyle: 'dashed' });
  });
  it('edge actions', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b', selected: true, sourceHandle: 'right', targetHandle: 'left' });
    const id = s().edges[0].id;
    executeAction('lineType:curved', env({ edgeId: id }));
    executeAction('arrows:both', env({ edgeId: id }));
    executeAction('strokeStyle:dotted', env({ edgeId: id }));
    executeAction('color:#d1344a', env({ edgeId: id }));
    expect(s().edges[0].data).toMatchObject({ lineType: 'curved', arrows: 'both', strokeStyle: 'dotted', color: '#d1344a' });
    executeAction('reverse-edge', env({ edgeId: id }));
    expect(s().edges[0].source).toBe('b');
  });
  it('edit-label and rename open inline editing in UI store', () => {
    s().addNode(n('a'));
    executeAction('edit-label', env({ nodeId: 'a' }));
    expect(useUiStore.getState().editingId).toBe('a');
    executeAction('change-icon', env({ nodeId: 'a' }));
    expect(useUiStore.getState().iconPickerFor).toBe('a');
  });
  it('pane: paste-here, add at cursor, select-all, toggles', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    executeAction('copy', env());
    executeAction('paste-here', env({ at: { x: 400, y: 400 } }));
    expect(s().nodes[1].position).toEqual({ x: 400, y: 400 });
    executeAction('add:rect', env({ at: { x: 600, y: 600 } }));
    const rect = s().nodes[s().nodes.length - 1];
    expect(rect.type).toBe('shape');
    expect(rect.position.x + (rect.width ?? 0) / 2).toBe(600);
    executeAction('add:group', env({ at: { x: 0, y: 0 } }));
    expect(s().nodes.some((x) => x.type === 'group')).toBe(true);
    executeAction('select-all', env());
    expect(s().nodes.every((x) => x.selected)).toBe(true);
    executeAction('toggle-grid', env());
    executeAction('toggle-snap', env());
    expect(useUiStore.getState()).toMatchObject({ showGrid: false, snap: false });
  });
  it('callbacks: zoom-fit, export', () => {
    const fitView = vi.fn();
    const exportImage = vi.fn();
    executeAction('zoom-fit', env({ fitView }));
    executeAction('export-png', env({ exportImage }));
    executeAction('export-svg', env({ exportImage }));
    expect(fitView).toHaveBeenCalled();
    expect(exportImage.mock.calls).toEqual([['png'], ['svg']]);
  });
  it('page tab actions: duplicate is direct; rename and delete open dialogs', async () => {
    const first = s().activePageId;
    executeAction('duplicate-page', env({ pageId: first }));
    expect(s().pages).toHaveLength(2);
    executeAction('rename-page', env({ pageId: first }));
    const prompt = useDialogStore.getState().stack[0];
    expect(prompt.kind).toBe('prompt');
    expect(prompt.opts.title).toBe('Rename page');
    useDialogStore.getState().close(prompt.id, 'Infra');
    await vi.waitFor(() => expect(s().pages[0].name).toBe('Infra'));
    useDialogStore.getState().clear();
    executeAction('delete-page', env({ pageId: first }));
    const ask = useDialogStore.getState().stack[0];
    expect(ask.kind).toBe('confirm'); // asks first, nothing deleted yet
    expect(s().pages).toHaveLength(2);
    useDialogStore.getState().close(ask.id, true);
    await vi.waitFor(() => expect(s().pages).toHaveLength(1));
  });
  it('project card actions delegate', () => {
    const project = { open: vi.fn(), rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn() };
    executeAction('project.open', env({ projectId: 'p', project }));
    executeAction('project.rename', env({ projectId: 'p', project }));
    executeAction('project.duplicate', env({ projectId: 'p', project }));
    executeAction('project.delete', env({ projectId: 'p', project }));
    expect(project.open).toHaveBeenCalledWith('p');
    expect(project.rename).toHaveBeenCalledWith('p');
    expect(project.duplicate).toHaveBeenCalledWith('p');
    expect(project.remove).toHaveBeenCalledWith('p');
  });
  it('unknown action is a no-op', () => {
    expect(() => executeAction('nope', env())).not.toThrow();
  });
});

describe('keyboard-only actions', () => {
  it('toggle-lock and ungroup-selection', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    s().addNode(n('b', 300, 100, { selected: true }));
    executeAction('group', {});
    const g = s().nodes.find((x) => x.type === 'group')!;
    s().selectOnly('node', g.id);
    executeAction('ungroup-selection', {});
    expect(s().nodes.some((x) => x.type === 'group')).toBe(false);
    s().selectOnly('node', 'a');
    executeAction('toggle-lock', {});
    expect(s().nodes.find((x) => x.id === 'a')!.data.locked).toBe(true);
  });
});

describe('cluster actions', () => {
  const clusterNode = (extra: Partial<DiagramNode> = {}): DiagramNode => ({ id: 'C', type: 'cluster', position: { x: 0, y: 0 }, width: 600, height: 400, data: { label: 'K', iconId: 'kafka' }, ...extra });
  it('role:<x> sets and clears the role on the selection (undoable)', () => {
    s().addNode(n('a', 0, 0, { selected: true }));
    executeAction('role:primary', env());
    expect(s().nodes[0].data.role).toBe('primary');
    executeAction('role:none', env());
    expect(s().nodes[0].data.role).toBeUndefined();
    s().undo();
    expect(s().nodes[0].data.role).toBe('primary');
  });
  it('wrap-cluster, toggle-collapse, add-replica, edit-cluster', () => {
    s().addNode(n('a', 100, 100, { selected: true }));
    s().addNode(n('b', 300, 100, { selected: true }));
    executeAction('wrap-cluster', env());
    const c = s().nodes.find((x) => x.type === 'cluster')!;
    executeAction('toggle-collapse', env({ nodeId: c.id }));
    expect(s().nodes.find((x) => x.id === c.id)!.data.collapsed).toBe(true);
    executeAction('toggle-collapse', env({ nodeId: c.id }));
    expect(s().nodes.find((x) => x.id === c.id)!.data.collapsed).toBeUndefined();
    const before = s().nodes.length;
    executeAction('add-replica', env({ nodeId: c.id }));
    expect(s().nodes).toHaveLength(before + 1);
    executeAction('edit-cluster', env({ nodeId: c.id }));
    expect(useUiStore.getState().wizard).toEqual({ clusterId: c.id });
  });
  it('edgeKind:<k> sets the cluster edge kind on the selected edge', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addEdge({ source: 'a', target: 'b', selected: true });
    executeAction('edgeKind:heartbeat', env({ edgeId: s().edges[0].id }));
    expect(s().edges[0].data?.kind).toBe('heartbeat');
    void clusterNode;
  });
});

describe('read-only sessions (viewer) cannot rename from the menus or ⌘K', () => {
  it('rename, rename-page and project.rename do nothing', async () => {
    const { useEditorSession } = await import('../sync/status');
    useEditorSession.getState().set({ source: 'server', role: 'viewer', shareToken: null, readOnly: true });
    s().addNode(n('a', 0, 0, { selected: true }));
    executeAction('rename', env({ nodeId: 'a' }));
    expect(useUiStore.getState().editingId).toBeNull();
    executeAction('rename-page', env());
    expect(useDialogStore.getState().stack).toHaveLength(0);
    const rename = vi.fn();
    executeAction('project.rename', env({ projectId: 'p', project: { rename, canRename: () => false } as never }));
    expect(rename).not.toHaveBeenCalled();
    useEditorSession.getState().reset();
    executeAction('project.rename', env({ projectId: 'p', project: { rename, canRename: () => true } as never }));
    expect(rename).toHaveBeenCalled();
  });
});
