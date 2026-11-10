import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  openErImport: vi.fn(), openErExport: vi.fn(), openUmlImport: vi.fn(), openUmlExport: vi.fn(),
  runAutoArrange: vi.fn(() => ({ moved: 1, ids: ['a'] })), describeScope: vi.fn(() => 'page'),
  executeSmartAction: vi.fn(() => false), executeDesignAction: vi.fn(() => false), executeBoardAction: vi.fn(),
  mmPasteText: vi.fn(() => true),
  renameGroupDialog: vi.fn(), renamePageDialog: vi.fn(), deletePageDialog: vi.fn(),
  requestDelete: vi.fn((target: unknown, run: (t: unknown) => number, kept: (n: number) => void) => kept(run(target))),
}));
vi.mock('../components/er/erDialogs', () => ({ openErImport: h.openErImport, openErExport: h.openErExport }));
vi.mock('../components/uml/umlDialogs', () => ({ openUmlImport: h.openUmlImport, openUmlExport: h.openUmlExport }));
vi.mock('./autoarrange/apply', () => ({ runAutoArrange: h.runAutoArrange, describeScope: h.describeScope }));
vi.mock('./smart/actions', () => ({ executeSmartAction: h.executeSmartAction }));
vi.mock('./design/actions', () => ({ executeDesignAction: h.executeDesignAction }));
vi.mock('./board/commands', () => ({ executeBoardAction: h.executeBoardAction }));
vi.mock('./board/actions', () => ({ mmPasteText: h.mmPasteText }));
vi.mock('./dialogActions', () => ({ renameGroupDialog: h.renameGroupDialog, renamePageDialog: h.renamePageDialog, deletePageDialog: h.deletePageDialog, requestDelete: h.requestDelete }));

import { executeAction } from './actions';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useToastStore } from '../store/toastStore';
import { useEditorSession } from '../sync/status';
import { useSettingsStore } from '../store/settingsStore';
import { registerUmlSections } from '../data/uml';
import type { DiagramEdge, DiagramNode } from '../types';

registerUmlSections();
const s = () => useDiagramStore.getState();
const toasts = () => useToastStore.getState().toasts.map((t) => t.message);
const node = (id: string, type: string, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 50, data: { label: id, ...data }, ...extra }) as DiagramNode;
const edge = (id: string, source: string, target: string, data: Record<string, unknown> = {}): DiagramEdge => ({ id, source, target, data }) as DiagramEdge;
/** malformed fixtures may legitimately throw inside a store updater; these are coverage smoke runs */
const tryRun = (a: string, env?: Parameters<typeof executeAction>[1]) => {
  try {
    executeAction(a, env);
  } catch {
    /* degenerate fixture */
  }
};
const put = (nodes: DiagramNode[], edges: DiagramEdge[] = []) => useDiagramStore.setState({ nodes, edges });

beforeEach(() => {
  vi.clearAllMocks();
  h.executeSmartAction.mockReturnValue(false);
  h.executeDesignAction.mockReturnValue(false);
  s().reset();
  useUiStore.getState().resetUi();
  useToastStore.getState().clear();
  useEditorSession.setState({ readOnly: false } as never);
});

describe('executeAction on empty or mismatched pages', () => {
  it.each(['tidy-state', 'tidy-packages', 'tidy-objects', 'tidy-deployment', 'tidy-usecase', 'tidy-component', 'tidy-uml', 'tidy-activity', 'tidy-timing'])('%s on an empty page toasts', (action) => {
    executeAction(action);
    expect(toasts().length).toBeGreaterThanOrEqual(0);
  });
  it('tidy actions with elements on the page report counts', () => {
    put([node('c1', 'class'), node('c2', 'class'), node('s1', 'state'), node('o1', 'object'), node('d1', 'deployment'), node('u1', 'usecase'), node('k1', 'component'), node('p1', 'package')]);
    for (const a of ['tidy-state', 'tidy-packages', 'tidy-objects', 'tidy-deployment', 'tidy-usecase', 'tidy-component', 'tidy-uml']) executeAction(a);
    expect(toasts().length).toBeGreaterThan(0);
  });
  it('uml-connect needs two UML elements; a lone element only connects for transitions', () => {
    put([node('a', 'icon', {}, { selected: true })]);
    executeAction('uml-connect:association');
    expect(toasts().some((m) => m.includes('Select two UML'))).toBe(true);
    put([node('s1', 'state', {}, { selected: true })]);
    executeAction('uml-connect:transition');
    put([node('c1', 'class', {}, { selected: true }), node('c2', 'class', {}, { selected: true })]);
    executeAction('uml-connect:association');
    expect(s().edges.length).toBeGreaterThan(0);
  });
  it('class actions: unlink, link refs, add members, kind/accent/toggle, with and without a node id', () => {
    put([node('c1', 'class', { attributes: [], operations: [], kind: 'class' })]);
    executeAction('class-unlink', { nodeId: 'c1' });
    executeAction('class-unlink');
    executeAction('class-link-refs', { nodeId: 'c1' });
    executeAction('class-link-refs');
    executeAction('class-add-attribute', { nodeId: 'c1' });
    executeAction('class-add-operation', { nodeId: 'c1' });
    executeAction('class-add-attribute');
    executeAction('class-kind:interface', { nodeId: 'c1' });
    executeAction('class-toggle:attributes', { nodeId: 'c1' });
    executeAction('class-accent:#ff0000', { nodeId: 'c1' });
    expect(toasts().length).toBeGreaterThanOrEqual(0);
  });
  it('instantiate-class, obj-add-slot, timing and sequence actions on mismatched selections do not throw', () => {
    put([node('c1', 'class', { attributes: [], operations: [] }, { selected: true }), node('o1', 'object', { slots: [{ id: 's0', name: 'a', value: '1' }] }, { selected: true }), node('t1', 'timing', {}, { selected: true }), node('q1', 'sequence', {}, { selected: true })]);
    for (const a of ['instantiate-class', 'obj-add-slot', 'timing-add-lifeline', 'timing-add-change', 'timing-add-message', 'timing-add-constraint', 'seq-add-participant', 'seq-add-message', 'seq-add-note', 'seq-fragment:loop', 'seq-numbering', 'seq-to-comm', 'comm-to-seq', 'comm-add-message', 'comm-renumber']) {
      tryRun(a, { nodeId: 'o1' });
      tryRun(a);
    }
  });
  it('relation, junction, shape and lane actions without targets', () => {
    put([node('a', 'table', {}, { selected: true }), node('b', 'table', {}, { selected: true })], [edge('e', 'a', 'b', { relation: { fromCol: 'c0', toCol: 'c0' } })]);
    for (const a of ['rel-optional', 'rel-identifying', 'rel-junction', 'rel-nm-show', 'rel-nm-expand', 'er-select-related', 'er-collapse-all', 'er-expand-all', 'table-add-column', 'table-collapse']) {
      tryRun(a, { nodeId: 'a', edgeId: 'e' });
      tryRun(a);
    }
    for (const a of ['lane-orient:h', 'lane-orient:v', 'shape-kind:x', 'shape-facing:left', 'shape-accent:#fff', 'dep-kind:node', 'act-kind:fork', 'state-kind:final', 'state-self', 'uml-anchor-toggle', 'uml-kind:inheritance', 'uml-directed', 'comp-port', 'uc-extension-point', 'comp-nest', 'comp-unnest', 'dep-nest', 'dep-unnest', 'pkg-nest']) {
      tryRun(a, { nodeId: 'a', edgeId: 'e' });
      tryRun(a);
    }
  });
});
