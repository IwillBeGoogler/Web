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
import { registerUmlSections } from '../data/uml';
import type { DiagramEdge, DiagramNode } from '../types';
registerUmlSections();
const s = () => useDiagramStore.getState();
const toasts = () => useToastStore.getState().toasts.map((t) => t.message);
const node = (id: string, type: string, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 50, data: { label: id, ...data }, ...extra }) as DiagramNode;
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

describe('actions no-op and toast branches', () => {
  it('er-select-related without a target does nothing', () => {
    put([node('a', 'table')]);
    executeAction('er-select-related');
    expect(s().nodes[0].selected).toBeFalsy();
  });
  it('rel-junction on a non many-to-many toasts', () => {
    executeAction('rel-junction');
    expect(toasts()).toContain('Only many-to-many relations can become a junction table');
  });
  it('rel-nm-show without target toasts', () => {
    executeAction('rel-nm-show');
    expect(toasts().some((m) => m.startsWith('Not a junction table'))).toBe(true);
  });
  it('rel-nm-expand without target toasts', () => {
    executeAction('rel-nm-expand');
    expect(toasts()).toContain('This relation has no junction table behind it');
  });
  it('uml-add with unknown item places nothing', () => {
    executeAction('uml-add:nope-xyz');
    expect(s().nodes).toHaveLength(0);
  });
  it('comm-renumber without messages toasts', () => {
    executeAction('comm-renumber');
    expect(toasts()).toContain('No numbered messages on this page');
  });
  it('seq-to-comm without a sequence frame toasts', () => {
    executeAction('seq-to-comm');
    expect(toasts()).toContain('Select a sequence frame to convert');
  });
  it('lane-orient without lanes does nothing', () => {
    put([node('a', 'activity', { variant: 'action' }, { selected: true })]);
    executeAction('lane-orient:h');
    expect(s().nodes[0].data.laneOrient).toBeUndefined();
  });
  it.each(['tidy-states', 'tidy-packages', 'tidy-timing', 'tidy-activity', 'tidy-uml'])('%s on empty page toasts a no-op message', (a) => {
    executeAction(a === 'tidy-states' ? 'tidy-state' : a);
    expect(toasts().some((m) => m.startsWith('No '))).toBe(true);
  });
  it('class-unlink / class-link-refs / class-add-* without node do nothing', () => {
    for (const a of ['class-unlink', 'class-link-refs', 'class-add-attribute', 'class-add-operation']) executeAction(a);
    expect(toasts()).toHaveLength(0);
  });
  it('class-link-refs with no matching refs toasts', () => {
    put([node('k1', 'class', { name: 'Foo' })]);
    executeAction('class-link-refs', { nodeId: 'k1' });
    expect(toasts()).toContain('No lifeline or object has this class name');
  });
});
