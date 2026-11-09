import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAction, type ActionEnv } from './actions';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { createNodesFromPaletteItem } from '../data/palette';
import { SECTIONS } from '../data/catalog';
import { registerUmlSection } from '../data/uml';
import { registerErdSection } from '../data/erd';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const run = (a: string, e: ActionEnv = {}) => executeAction(a, e);
const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, type: 'icon', position: { x, y }, width: 100, height: 50, data: { label: id, iconId: 'service' }, ...extra,
});
registerUmlSection();
registerErdSection();
beforeEach(() => { s().reset(); useUiStore.getState().resetUi(); });

const ACTIONS = [
  'rename', 'edit-label', 'change-icon', 'cut', 'copy', 'paste', 'paste-here', 'duplicate', 'copy-style', 'paste-style', 'delete', 'toggle-flow', 'select-all', 'select-children',
  'lock', 'ungroup-selection', 'bring-front', 'bring-forward', 'send-backward', 'send-back', 'align:left', 'distribute:h', 'group', 'ungroup', 'remove-from-group',
  'delete-group-only', 'delete-group-with-children', 'wrap-cluster', 'toggle-collapse', 'add-replica', 'edit-cluster', 'role:primary', 'role-custom', 'edgeKind:heartbeat', 'edgeKind:none',
  'reset-route', 'match-size', 'reset-style', 'select-similar:type', 'preset:x', 'labelSide:left', 'repeat:2', 'merge-junction', 'tidy-edges', 'auto-arrange', 'auto-arrange:page', 'auto-arrange:inside',
  'tidy-er', 'er-add-table', 'er-select-related', 'er-sql-panel', 'er-collapse-all', 'er-expand-all', 'er-import', 'er-export', 'er-copy-sql', 'table-collapse', 'table-add-column', 'table-accent:#fff',
  'rel-card:one-to-many', 'rel-optional', 'rel-identifying', 'rel-junction', 'rel-nm-show', 'rel-nm-expand', 'uml-connect:association', 'uml-connect:note', 'uml-connect:transition',
  'seq-add-participant', 'seq-add-message', 'seq-add-note', 'seq-fragment:alt', 'seq-numbering', 'state-self', 'state-kind:state', 'state-kind:choice', 'tidy-state', 'tidy-packages', 'pkg-nest',
  'comm-add-message', 'comm-renumber', 'seq-to-comm', 'comm-to-seq', 'timing-add-lifeline', 'timing-add-lifeline:binary', 'timing-add-change', 'timing-add-message', 'timing-add-constraint', 'tidy-timing', 'tidy-objects',
  'instantiate-class', 'obj-add-slot', 'tidy-deployment', 'dep-nest', 'dep-unnest', 'dep-kind:node', 'tidy-activity', 'act-kind:action', 'act-kind:start', 'lane-orient:h', 'lane-orient:v', 'tidy-usecase', 'tidy-component',
  'comp-nest', 'comp-unnest', 'comp-port:required', 'comp-port:provided', 'uc-extension-point', 'shape-kind:provided', 'shape-kind:x', 'shape-facing:left', 'shape-accent:#fff', 'uml-anchor-toggle', 'uml-kind:inheritance',
  'uml-directed', 'uml-add-class', 'uml-add-class:interface', 'class-unlink', 'class-link-refs', 'class-add-attribute', 'class-add-operation', 'class-kind:interface', 'class-toggle:attributes', 'class-accent:#fff',
  'tidy-uml', 'uml-import', 'uml-export', 'marker-start:arrow', 'marker-end:arrow', 'reverse-edge', 'fill:#fff', 'stroke:#000', 'strokeStyle:dashed', 'color:#f00', 'lineType:curved', 'arrows:both',
  'add:rect', 'add:group', 'add:nope', 'zoom-fit', 'export-png', 'export-svg', 'toggle-grid', 'toggle-snap', 'duplicate-page', 'project.open', 'project.duplicate', 'project.export', 'project.delete', 'unknown-thing',
];

function populate(): DiagramNode[] {
  let k = 0;
  const all: DiagramNode[] = [];
  for (const item of SECTIONS.filter((x) => x.id === 'uml' || x.id === 'erd').flatMap((x) => x.subs.flatMap((b) => b.items))) {
    try { all.push(...createNodesFromPaletteItem(item, { x: (k++ % 10) * 220, y: Math.floor(k / 10) * 160 }, (p) => `${p}${k}_${all.length}`)); } catch { /* skip */ }
  }
  return all;
}

describe('executeAction smoke over every action name and palette nodes', () => {
  it('never throws: empty page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const a of ACTIONS) expect(() => run(a, {})).not.toThrow();
    for (const a of ACTIONS) expect(() => run(a, { nodeId: 'ghost', edgeId: 'ghost', pageId: 'ghost', at: { x: 5, y: 5 } })).not.toThrow();
  });
  it('never throws: populated page, all selected, targeted at each node', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const nodes = populate();
    expect(nodes.length).toBeGreaterThan(5);
    s().placeNodes(nodes);
    const ids = s().nodes.map((x) => x.id);
    for (let i = 0; i + 1 < ids.length; i += 2) s().addUmlEdge?.(ids[i], ids[i + 1], { kind: 'association' });
    for (const a of ACTIONS) {
      s().selectAll();
      expect(() => run(a, { at: { x: 10, y: 10 }, fitView: vi.fn(), exportImage: vi.fn() })).not.toThrow();
    }
    for (const id of s().nodes.map((x) => x.id).slice(0, 10)) {
      for (const a of ACTIONS) {
        if (/^(delete|cut|paste|duplicate|group|ungroup|wrap|dep-nest|comp-nest|pkg-nest|delete-group)/.test(a)) continue;
        expect(() => run(a, { nodeId: id, at: { x: 1, y: 1 } })).not.toThrow();
      }
    }
  }, 180000);
  it('edge-targeted actions on selected edges', () => {
    s().addNode(n('a'));
    s().addNode(n('b'));
    s().addNode(n('c'));
    s().addEdge({ source: 'a', target: 'b', selected: true, sourceHandle: 'right', targetHandle: 'left' });
    s().addEdge({ source: 'a', target: 'c', selected: true, sourceHandle: 'right', targetHandle: 'left' });
    for (const a of ['merge-junction', 'reset-route', 'uml-kind:inheritance', 'uml-directed', 'rel-optional', 'rel-identifying', 'rel-card:one-to-many', 'rel-junction', 'rel-nm-expand', 'marker-start:arrow', 'marker-end:arrow', 'labelSide:left', 'preset:x', 'strokeStyle:dashed', 'uml-connect:association'])
      expect(() => run(a, {})).not.toThrow();
    const id = s().edges[0].id;
    for (const a of ['reset-route', 'edgeKind:heartbeat', 'uml-directed', 'rel-junction', 'rel-nm-expand']) run(a, { edgeId: id });
  });
  it('mindmap paste uses clipboard text', async () => {
    const readText = vi.fn().mockResolvedValue('a\n  b');
    Object.defineProperty(navigator, 'clipboard', { value: { readText, writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    s().addNode(n('m', 0, 0, { type: 'mindmap', selected: true, data: { label: 'root' } as never }));
    run('paste');
    await vi.waitFor(() => expect(readText).toHaveBeenCalled());
    readText.mockRejectedValue(new Error('x'));
    run('paste');
    await Promise.resolve();
  });
  it('er actions with a table', () => {
    run('er-add-table', { at: { x: 100, y: 100 } });
    const t = s().nodes.find((x) => x.type === 'table')!;
    expect(t).toBeTruthy();
    s().selectOnly('node', t.id);
    run('table-add-column', { nodeId: t.id });
    run('table-collapse', { nodeId: t.id });
    run('er-copy-sql', { nodeId: t.id });
    run('er-select-related', { nodeId: t.id });
    run('er-collapse-all');
    run('table-accent:#abc', { nodeId: t.id });
    run('tidy-er');
    expect(s().nodes.find((x) => x.id === t.id)!.data.accent).toBe('#abc');
  });
});
