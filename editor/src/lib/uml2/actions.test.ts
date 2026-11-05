import { beforeEach, describe, expect, it } from 'vitest';
import { executeAction } from '../actions';
import { getMenuItems, flattenMenu, type MenuContext } from '../menu';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { blankSequence, sequenceOf } from '../seq/node';
import { stateNode, compositeNode } from '../state/convert';
import { actorNode, componentNode, useCaseNode } from './nodes';
import { allMessages } from '../seq/types';
import { registerUmlSections } from '../../data/uml';

registerUmlSections();

const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  useUiStore.getState().resetUi();
});
const ctx = (): MenuContext => ({ nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 });
const ids = (target: Parameters<typeof getMenuItems>[0]) => flattenMenu(getMenuItems(target, ctx())).map((i) => i.id);

describe('adding UML diagram elements', () => {
  it('uml-add places the palette item at the cursor', () => {
    executeAction('uml-add:uml-sequence', { at: { x: 200, y: 100 } });
    expect(s().nodes[0].type).toBe('sequence');
    executeAction('uml-add:uml-state', { at: { x: 0, y: 0 } });
    executeAction('uml-add:uml-actor', { at: { x: 0, y: 0 } });
    executeAction('uml-add:uml-component', { at: { x: 0, y: 0 } });
    expect(s().nodes.map((n) => n.type).sort()).toEqual(['component', 'sequence', 'state', 'usecase']);
  });
});

describe('sequence actions', () => {
  beforeEach(() => s().addNode({ ...blankSequence('sq', { x: 0, y: 0 }), selected: true }));
  it('add participant / message / note / fragment / numbering', () => {
    executeAction('seq-add-participant', { nodeId: 'sq' });
    expect(sequenceOf(s().nodes[0]).participants).toHaveLength(3);
    executeAction('seq-add-message', { nodeId: 'sq' });
    expect(allMessages(sequenceOf(s().nodes[0]).items)).toHaveLength(3);
    executeAction('seq-add-note', { nodeId: 'sq' });
    expect(sequenceOf(s().nodes[0]).items.some((i) => i.type === 'note')).toBe(true);
    executeAction('seq-fragment:loop', { nodeId: 'sq' });
    expect(sequenceOf(s().nodes[0]).items.some((i) => i.type === 'fragment' && i.op === 'loop')).toBe(true);
    executeAction('seq-numbering', { nodeId: 'sq' });
    expect(sequenceOf(s().nodes[0]).autonumber).toBe(true);
    s().undo();
    expect(sequenceOf(s().nodes[0]).autonumber).toBe(false);
  });
  it('the node grows when content is added (auto spacing, no manual coordinates)', () => {
    const w = s().nodes[0].width!;
    executeAction('seq-add-participant', { nodeId: 'sq' });
    executeAction('seq-add-participant', { nodeId: 'sq' });
    expect(s().nodes[0].width!).toBeGreaterThan(w);
  });
  it('its context menu offers the editing commands', () => {
    const m = ids({ type: 'node', id: 'sq' });
    for (const id of ['seq-add-participant', 'seq-add-message', 'seq-add-note', 'seq-fragment:alt', 'seq-fragment:critical', 'seq-numbering', 'uml-export', 'uml-import']) expect(m).toContain(id);
  });
});

describe('state actions', () => {
  it('self transition and tidy', () => {
    s().addNodes([
      stateNode('i', { x: 400, y: 400 }, { label: '', stateKind: 'initial' }),
      stateNode('a', { x: 0, y: 0 }, { label: 'A' }),
      stateNode('b', { x: 0, y: 0 }, { label: 'B' }),
    ]);
    s().addUmlEdge('i', 'a', { kind: 'transition' });
    s().addUmlEdge('a', 'b', { kind: 'transition' });
    executeAction('state-self', { nodeId: 'b' });
    expect(s().edges.some((e) => e.source === 'b' && e.target === 'b')).toBe(true);
    executeAction('tidy-state');
    const y = (id: string) => s().nodes.find((n) => n.id === id)!.position.y;
    expect(y('i')).toBeLessThan(y('a'));
    expect(y('a')).toBeLessThan(y('b'));
  });
  it('tidy keeps children inside their composite and sizes it', () => {
    s().addNodes([compositeNode('c', { x: 0, y: 0 }, 'Comp', 100, 100), stateNode('x', { x: 5, y: 5 }, { label: 'X' }, 'c'), stateNode('y', { x: 5, y: 5 }, { label: 'Y' }, 'c')]);
    s().addUmlEdge('x', 'y', { kind: 'transition' });
    executeAction('tidy-state');
    const c = s().nodes.find((n) => n.id === 'c')!;
    const x = s().nodes.find((n) => n.id === 'x')!, y = s().nodes.find((n) => n.id === 'y')!;
    expect(c.width!).toBeGreaterThan(100);
    for (const k of [x, y]) { expect(k.position.x + k.width!).toBeLessThanOrEqual(c.width!); expect(k.position.y + k.height!).toBeLessThanOrEqual(c.height!); }
    expect(x.position.y).toBeLessThan(y.position.y);
  });
  it('state context menu', () => {
    s().addNode(stateNode('a', { x: 0, y: 0 }, { label: 'A' }));
    const m = ids({ type: 'node', id: 'a' });
    for (const id of ['rename', 'state-self', 'state-kind:choice', 'tidy-state']) expect(m).toContain(id);
  });
});

describe('use case and component connections', () => {
  it('uml-connect joins any two selected UML nodes with the chosen kind', () => {
    s().addNodes([{ ...useCaseNode('u1', { x: 0, y: 0 }), selected: true }, { ...useCaseNode('u2', { x: 300, y: 0 }), selected: true }]);
    executeAction('uml-connect:extend');
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0].data?.uml?.kind).toBe('extend');
    expect(s().edges[0].label).toBe('«extend»');
  });
  it('dragging actor -> use case draws an association, component -> interface an assembly connector', () => {
    s().addNodes([actorNode('a', { x: 0, y: 0 }), useCaseNode('u', { x: 300, y: 0 }), componentNode('c', { x: 0, y: 300 }), componentNode('p', { x: 300, y: 300 }, 'provided')]);
    s().connect({ source: 'a', target: 'u', sourceHandle: null, targetHandle: null });
    s().connect({ source: 'c', target: 'p', sourceHandle: null, targetHandle: null });
    expect(s().edges.map((e) => e.data?.uml?.kind)).toEqual(['association', 'assembly']);
  });
  it('menus for use case / component nodes and relations', () => {
    s().addNodes([actorNode('a', { x: 0, y: 0 }), componentNode('p', { x: 300, y: 300 }, 'provided')]);
    expect(ids({ type: 'node', id: 'a' })).toEqual(expect.arrayContaining(['rename', 'shape-kind:usecase']));
    expect(ids({ type: 'node', id: 'p' })).toEqual(expect.arrayContaining(['rename', 'shape-facing:left']));
    const e = s().addUmlEdge('a', 'p', { kind: 'include' })!;
    expect(ids({ type: 'edge', id: e })).toEqual(expect.arrayContaining(['uml-kind:include', 'uml-kind:extend', 'uml-kind:generalization']));
  });
});

describe('anchor toggle', () => {
  it('toggles the attribute-row anchoring', () => {
    expect(useUiStore.getState().umlAnchorRows).toBe(true);
    executeAction('uml-anchor-toggle');
    expect(useUiStore.getState().umlAnchorRows).toBe(false);
  });
});
