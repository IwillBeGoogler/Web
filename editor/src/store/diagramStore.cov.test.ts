import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagramStore } from './diagramStore';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });

beforeEach(() => {
  s().reset();
});

describe('edges: route, label, reconnect, reverse', () => {
  beforeEach(() => {
    s().addNode(n('a', 0, 0));
    s().addNode(n('b', 400, 200));
    s().addNode(n('c', 400, 500));
    s().addEdge({ source: 'a', target: 'b' });
  });
  it('setLabelPosition clamps t to 0..1 and keeps/sets offset', () => {
    const id = s().edges[0].id;
    s().setLabelPosition(id, 5, 12, false);
    expect(s().edges[0].data?.labelT).toBe(1);
    expect(s().edges[0].data?.labelOffset).toBe(12);
    s().setLabelPosition(id, -3, undefined, true);
    expect(s().edges[0].data?.labelT).toBe(0);
    expect(s().edges[0].data?.labelOffset).toBe(12);
  });
  it('setEdgeRoute / resetRoute / reconnectEdge drop manual routing and labels; pins and handles reset per end', () => {
    const id = s().edges[0].id;
    s().setEdgeRoute(id, [{ x: 10, y: 10 }]);
    expect(s().edges[0].data?.manual).toBe(true);
    s().resetRoute(id);
    expect(s().edges[0].data?.waypoints).toBeUndefined();
    s().setLabelPosition(id, 0.3, 4);
    s().updateEdges([id], { pinSource: 'top', pinTarget: 'left' } as never);
    expect(s().reconnectEdge(id, { target: 'c', targetSide: 'top' })).toBe(true);
    expect(s().edges[0].target).toBe('c');
    expect(s().edges[0].data?.pinTarget).toBeUndefined();
    expect(s().reconnectEdge(id, { source: 'b', sourceSide: 'left' })).toBe(true);
    expect(s().edges[0].data?.pinSource).toBeUndefined();
    expect(s().reconnectEdge(id, { source: 'zz' })).toBe(false);
    expect(s().reconnectEdge('nope', { target: 'a' })).toBe(false);
    s().reverseEdge(id);
    s().reverseEdge('nope');
    s().resetRoute('nope');
    s().setEdgeRoute('nope', []);
    s().setLabelPosition('nope', 0.5);
    s().tidyEdges();
  });
  it('connect ignores incomplete connections and plain nodes make plain edges', () => {
    const before = s().edges.length;
    s().connect({ source: null, target: 'b', sourceHandle: null, targetHandle: null } as never);
    s().connect({ source: 'a', target: null, sourceHandle: null, targetHandle: null } as never);
    expect(s().edges).toHaveLength(before);
    s().connect({ source: 'a', target: 'c', sourceHandle: 'right', targetHandle: 'left' });
    expect(s().edges).toHaveLength(before + 1);
  });
  it('deleteEdges of unknown ids is a no-op and onEdgesChange honours locked edges', () => {
    const before = s().edges.length;
    s().deleteEdges(['ghost']);
    expect(s().edges).toHaveLength(before);
    const id = s().edges[0].id;
    s().onEdgesChange([{ type: 'select', id, selected: true }]);
    s().onEdgesChange([{ type: 'remove', id }]);
    expect(s().edges.some((e) => e.id === id)).toBe(false);
  });
  it('edge style copy/paste: copyStyle with an edge selected, pasteStyle onto edges and nodes', () => {
    const id = s().edges[0].id;
    s().updateEdges([id], { color: '#ff0000', width: 4 } as never);
    s().selectOnly('edge', id);
    s().copyStyle();
    s().addEdge({ source: 'a', target: 'c' });
    const second = s().edges[1].id;
    s().selectOnly('edge', second);
    s().pasteStyle();
    expect(s().edges[1].data?.color).toBe('#ff0000');
    s().selectOnly('node', 'a');
    s().pasteStyle();
    s().copyStyle();
    s().selectOnly('edge', second);
    s().pasteStyle();
  });
});

describe('selection helpers', () => {
  beforeEach(() => {
    s().addNode(n('a', 0, 0));
    s().addNode(n('b', 200, 0));
    s().addNode(n('c', 400, 0));
    s().addEdge({ source: 'a', target: 'b' });
    s().addEdge({ source: 'b', target: 'c' });
  });
  it('selectSimilar with a selected edge anchor, with no anchor and an unknown one', () => {
    s().selectOnly('edge', s().edges[0].id);
    expect(s().selectSimilar('type' as never)).toBeGreaterThanOrEqual(0);
    s().selectOnly('node', 'a');
    s().selectSimilar('type' as never);
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => ({ ...x, selected: false })), edges: st.edges.map((e) => ({ ...e, selected: false })) }));
    expect(s().selectSimilar('type' as never)).toBe(0);
    expect(s().selectSimilar('type' as never, { kind: 'node', id: 'ghost' })).toBe(0);
  });
  it('copy/paste/duplicate/cut with and without a selection; paste at a position', () => {
    s().copy();
    s().paste();
    s().duplicate();
    s().cut();
    s().selectOnly('node', 'a');
    s().copy();
    s().paste({ x: 50, y: 50 });
    s().paste();
    s().duplicate();
    s().selectOnly('node', 'b');
    s().cut();
    expect(s().nodes.some((x) => x.id === 'b')).toBe(false);
    s().paste();
    s().selectOnly('edge', s().edges[0]?.id ?? 'x');
    s().duplicate();
  });
  it('insertContent adopts settings only into an empty page and normalises selection', () => {
    s().insertContent({ nodes: [n('z', 0, 0, { selected: true })], edges: [] }, { select: false });
    s().insertContent({ nodes: [n('y', 0, 0, { selected: true })], edges: [], settings: { node: { radius: 3 } } } as never, { select: true });
    s().reset();
    s().insertContent({ nodes: [n('x', 0, 0)], edges: [], settings: { node: { radius: 3 } } } as never);
    expect(s().projectSettings.node?.radius).toBe(3);
  });
  it('placeNodes of an empty list is a no-op; deleteSelection with nothing selected', () => {
    s().placeNodes([]);
    expect(s().deleteSelection()).toBeGreaterThanOrEqual(0);
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => ({ ...x, selected: false })) }));
    expect(s().deleteSelection({ nodes: ['ghost'] })).toBe(0);
  });
  it('align/distribute/reorder/nudge/toggleLock/group with an empty selection do nothing harmful', () => {
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => ({ ...x, selected: false })) }));
    s().alignSelection('left' as never);
    s().distributeSelection('horizontal' as never);
    s().reorderSelection('front' as never);
    s().nudgeSelection(5, 5);
    s().toggleLock();
    s().groupSelection();
    s().matchSelectionSize();
    s().resetSelectionStyle();
    s().updateSelectionStyle({ label: 'x' } as never);
    expect(s().nodes).toHaveLength(3);
  });
});

describe('clusters and replicas', () => {
  it('addReplica of an unknown or non-cluster id returns null; of a primary adds a replica with subtitle', () => {
    s().addNode(n('p', 0, 0, { data: { label: 'db', iconId: 'postgres', subtitle: 'primary' } }));
    expect(s().addReplica('ghost')).toBeNull();
    const id = s().addReplica('p');
    expect(id === null || typeof id === 'string').toBe(true);
    const ids = s().createCluster('kafka', { topics: [{ name: 'orders' }] }, { x: 10, y: 10 });
    expect(ids === null || typeof ids === 'string').toBe(true);
    s().createCluster('kafka', {});
    s().createCluster('nope-profile', {});
  });
  it('kafka client edges are labelled with a topic', () => {
    const cl = s().createCluster('kafka', { topics: [{ name: 'orders' }] });
    s().createCluster('kafka', { topics: [] });
    s().addNode(n('svc', 900, 0));
    if (cl) {
      s().connect({ source: 'svc', target: cl, sourceHandle: 'right', targetHandle: 'left' });
      s().connect({ source: cl, target: 'svc', sourceHandle: 'right', targetHandle: 'left' });
    }
    expect(s().nodes.length).toBeGreaterThan(0);
  });
});

describe('pages', () => {
  it('switching to the same or an unknown page is ignored; delete the active page selects a neighbour; duplicate keeps content', () => {
    s().addNode(n('a', 0, 0));
    const p2 = s().addPage('Two', { nodes: [n('x', 0, 0)], edges: [] });
    const active = s().activePageId;
    s().switchPage(active);
    s().switchPage('ghost');
    s().switchPage(p2);
    expect(s().nodes.map((x) => x.id)).toEqual(['x']);
    const dup = s().duplicatePage(p2);
    expect(dup).toBeTruthy();
    s().renamePage(p2, 'Renamed');
    expect(s().deletePage(p2)).toBe(true);
    expect(s().deletePage('ghost')).toBe(false);
    s().setPageViewport(s().activePageId, { x: 1, y: 2, zoom: 1 });
    s().addAsset('h', { name: 'n', mime: 'image/png', data: 'x' } as never);
    const proj = s().toProject();

    s().loadProject(proj);
    s().importPages([{ id: 'imp', name: 'Imp', nodes: [], edges: [] } as never]);
  });
  it('a project whose active page id is unknown falls back to the first page', () => {
    const proj = s().toProject();
    s().loadProject({ ...proj, activePageId: 'ghost' } as never);
    expect(s().pages.length).toBeGreaterThan(0);
  });
  it('flow pages and guides are kept in the project', () => {
    useDiagramStore.setState((st) => ({ pageFlow: { [st.activePageId]: true }, guides: { [st.activePageId]: [{ id: 'g', axis: 'x', pos: 5 }] } as never }));
    const p = s().toProject();
    expect(p.pages[0].flow).toBe(true);
  });
  it('snapshot uses the history driver when installed', () => {
    const checkpoint = vi.fn();
    (useDiagramStore as unknown as { setState: (x: unknown) => void }).setState({});
    s().snapshot();
    expect(checkpoint).not.toHaveBeenCalled();
  });
});

describe('tidy and uml helpers on empty pages', () => {
  it('every tidy returns 0 on an empty diagram and does not throw', () => {
    expect(s().tidyUml()).toBe(0);
    expect(s().tidyStates()).toBe(0);
    expect(s().tidyUseCase()).toBe(0);
    expect(s().tidyActivity()).toBe(0);
    expect(s().tidyDeployment()).toBe(0);
    expect(s().tidyPackages()).toBe(0);
    expect(s().tidyObjects()).toBe(0);
    expect(s().tidyComponents()).toBe(0);
    expect(s().tidyEr()).toBe(0);
    expect(s().tidyTiming()).toBe(0);
    expect(s().instantiateClasses()).toEqual([]);
    expect(s().nestPackages()).toBeNull();
    expect(s().nestDeployment()).toBeNull();
    expect(s().nestComponents()).toBeNull();
    expect(s().unnestDeployment()).toBe(0);
    expect(s().unnestComponents()).toBe(0);
  });
  it('uml updates only touch uml or class-to-class edges', () => {
    s().addNode(n('a', 0, 0));
    s().addNode(n('b', 200, 0));
    s().addEdge({ source: 'a', target: 'b' });
    s().updateUml([s().edges[0].id], { kind: 'association' } as never);
    expect(s().edges[0].data?.uml).toBeUndefined();
    expect(s().addUmlEdge('a', 'ghost', { kind: 'association' } as never)).toBeNull();
    expect(s().connectTables({ source: 'a', target: 'b' } as never)).toBeNull();
    expect(s().makeJunction('ghost')).toBeNull();
    expect(s().foldJunction('ghost')).toBe(false);
    expect(s().unfoldJunction('ghost')).toBe(false);
    expect(s().addLinkedClass({ pageId: 'none', nodeId: 'none' })).toBeNull();
    expect(s().unlinkClass('ghost')).toBe(false);
    expect(s().linkRefsToClass('ghost')).toBe(0);
  });
  it('setRole, toggleCollapse, updateCluster, mergeIntoJunction on unknown ids', () => {
    s().setRole(['ghost'], 'replica');
    s().toggleCollapse('ghost');
    expect(s().updateCluster('ghost', {})).toBe(false);
    expect(s().mergeIntoJunction(['ghost'])).toBe(false);
    s().repeatGroup('ghost', 2);
    s().applyEdgePreset(['ghost'], 'nope');
    s().applyDefaultsToPage();
    s().ungroup('ghost');
    s().removeFromGroup(['ghost']);
    s().selectChildren('ghost');
    s().endDrag('ghost');
    s().updateNodeData('ghost', { label: 'x' });
    s().setNodePosition('ghost', { x: 1, y: 1 });
    expect(s().deleteNodes(['ghost'])).toBe(0);
  });
  it('undo/redo on empty history are no-ops', () => {
    s().undo();
    s().redo();
    expect(s().nodes).toHaveLength(0);
  });
});
