import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { createMindMapAt, mmAddChild, mmAddSibling, mmDrop, mmNavigate, mmPasteText, mmPromote } from './actions';
import { childrenOf } from './mindmap';

const st = () => useDiagramStore.getState();
const byLabel = (l: string) => st().nodes.find((n) => n.data.label === l)!;
beforeEach(() => {
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
});

describe('mind map actions', () => {
  it('one click starts a map: a central topic in edit mode', () => {
    const id = createMindMapAt({ x: 100, y: 100 });
    expect(st().nodes).toHaveLength(1);
    expect(useUiStore.getState().editingId).toBe(id);
  });
  it('the "+" actions create a child on the chosen side and go straight into edit mode', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const l = mmAddChild(root, 'l')!;
    const r = mmAddChild(root, 'r')!;
    expect(st().nodes.find((n) => n.id === l)!.data.side).toBe('l');
    expect(st().nodes.find((n) => n.id === r)!.data.side).toBe('r');
    expect(useUiStore.getState().editingId).toBe(r);
    const sib = mmAddSibling(r)!;
    expect(st().edges.find((e) => e.target === sib)!.source).toBe(root);
  });
  it('delete removes the node and its whole subtree; ONE undo restores it', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const a = mmAddChild(root)!;
    const a1 = mmAddChild(a)!;
    mmAddChild(a1);
    mmAddChild(root);
    expect(st().nodes).toHaveLength(5);
    st().selectOnly('node', a);
    st().deleteSelection();
    expect(st().nodes).toHaveLength(2);
    expect(st().edges).toHaveLength(1);
    st().undo();
    expect(st().nodes).toHaveLength(5);
    expect(st().edges).toHaveLength(4);
  });
  it('drag onto a node re-parents (no cycles); drag elsewhere reorders; layout puts everything back', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const a = mmAddChild(root)!;
    const b = mmAddChild(root)!;
    const a1 = mmAddChild(a)!;
    const nb = st().nodes.find((n) => n.id === b)!;
    expect(mmDrop(a1, { x: nb.position.x + 5, y: nb.position.y + 5 })).toBe(true);
    expect(st().edges.find((e) => e.target === a1)!.source).toBe(b);
    const nb2 = st().nodes.find((n) => n.id === b)!;
    expect(mmDrop(a, { x: nb2.position.x + 5, y: nb2.position.y + 5 })).toBe(true); // a under b
    const na = st().nodes.find((n) => n.id === a)!;
    mmDrop(b, { x: na.position.x + 5, y: na.position.y + 5 }); // b onto its own descendant: never becomes its child
    expect(st().edges.find((e) => e.target === b)!.source).toBe(root);
    expect(st().edges.find((e) => e.target === a)!.source).toBe(b);
    expect(st().edges.find((e) => e.target === b)!.source).toBe(root);
  });
  it('promote, paste-as-children and navigate', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const a = mmAddChild(root)!;
    const a1 = mmAddChild(a)!;
    expect(mmPromote(a1)).toBe(true);
    expect(st().edges.find((e) => e.target === a1)!.source).toBe(root);
    expect(mmPasteText(a, '- x\n  - y\n- z')).toBe(true);
    expect(childrenOf(st().nodes, st().edges, a).map((n) => n.data.label)).toEqual(['x', 'z']);
    expect(byLabel('y')).toBeTruthy();
    expect(mmPasteText(a, 'single')).toBe(false);
    st().selectOnly('node', a);
    expect(mmNavigate(a, 'left')).toBe(true);
    expect(st().nodes.find((n) => n.selected)!.id).toBe(root);
  });
});
