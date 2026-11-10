import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClassNode } from './ClassNode';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useDriftStore, type NodeMarks } from '../../lib/uml/driftStore';
import { blankClass, classOf } from '../../lib/uml/geometry';
import type { ClassKind, ClassMember, ClassNodeData } from '../../lib/uml/types';
import type { DiagramNode } from '../../types';

const s = () => useDiagramStore.getState();
const cls = (id = 'c') => classOf(s().nodes.find((n) => n.id === id)!) as ClassNodeData;
const mem = (id: string, name: string, extra: Partial<ClassMember> = {}): ClassMember => ({ id, visibility: '+', name, ...extra });

let sel = false;
function Host({ id = 'c' }: { id?: string }) {
  const node = useDiagramStore((st) => st.nodes.find((n) => n.id === id)) as DiagramNode;
  return <ClassNode {...({ id, data: node.data, selected: sel } as unknown as NodeProps<DiagramNode>)} />;
}
function put(fn: (d: ClassNodeData) => ClassNodeData = (d) => d, kind: ClassKind = 'class', id = 'c', locked = false) {
  act(() => {
    s().addNode(blankClass(id, { x: 0, y: 0 }, kind, 'Account'));
    s().updateClass(id, fn);
    if (locked) useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, locked: true } } : n)) }));
  });
  return render(<ReactFlowProvider><Host id={id} /></ReactFlowProvider>);
}
const withMembers = (d: ClassNodeData): ClassNodeData => ({ ...d, attributes: [mem('a1', 'id', { type: 'int', static: true }), mem('a2', 'name', { visibility: '' })], operations: [mem('o1', 'save', { abstract: true }), mem('o2', 'load')] });
const marks = (m: Partial<NodeMarks>): NodeMarks => ({ members: new Map(), byMemberId: new Map(), ghosts: [], count: 0, ...m });
const setMarks = (m: NodeMarks) => act(() => useDriftStore.setState({ drift: {} as never, marksFor: () => m }));

beforeEach(() => {
  sel = false;
  s().reset();
  useUiStore.getState().resetUi();
  useDriftStore.getState().clear();
});

describe('ClassNode', () => {
  it('renders header, members, flags and per-kind title classes', () => {
    put(withMembers);
    expect(screen.getByTestId('class-c')).toBeInTheDocument();
    expect(screen.getAllByTitle('Account')[0]).toHaveClass('uml-title');
    expect(screen.getByText('id: int')).toHaveClass('static');
    expect(screen.getByText(/save/)).toHaveClass('abstract');
    expect(screen.getAllByLabelText('none')).toHaveLength(1);
    expect(screen.queryByTestId('shared-c')).toBeNull();
  });
  it('selected class gets the selected class', () => {
    sel = true;
    put();
    expect(screen.getByTestId('class-c').className).toContain('selected');
  });
  it('abstract and interface titles, stereotype lines', () => {
    put(undefined, 'abstract');
    expect(document.querySelector('.uml-title')).toHaveClass('abstract');
  });
  it('interface title', () => {
    put(undefined, 'interface');
    expect(document.querySelector('.uml-title')).toHaveClass('interface');
    expect(document.querySelector('.uml-title')).not.toHaveClass('abstract');
  });
  it('enum shows bare literal names and no visibility column', () => {
    put((d) => ({ ...d, attributes: [mem('a1', 'RED'), mem('a2', 'GREEN')] }), 'enum');
    expect(screen.getByText('RED')).toBeInTheDocument();
    expect(document.querySelector('.uml-vis')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse attributes' })[0]);
    expect(screen.getByRole('button', { name: 'Expand attributes' })).toHaveTextContent('2 literals');
  });
  it('collapse and expand compartments with singular and plural summaries', () => {
    put((d) => ({ ...withMembers(d), operations: [mem('o1', 'save')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse operations' }));
    const sum = screen.getByRole('button', { name: 'Expand operations' });
    expect(sum).toHaveTextContent('1 operation');
    expect(cls().collapsedOperations).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add operation' })).toBeNull();
    fireEvent.click(sum);
    expect(cls().collapsedOperations).toBeFalsy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse attributes' }));
    expect(screen.getByRole('button', { name: 'Expand attributes' })).toHaveTextContent('2 attributes');
  });
  it('renames the class from the header; empty names are ignored', () => {
    put();
    fireEvent.doubleClick(screen.getAllByTitle('Account')[0]);
    expect(useUiStore.getState().editingId).toBe('c');
    const input = screen.getByLabelText('Class name');
    fireEvent.change(input, { target: { value: 'Ledger<T>' } });
    fireEvent.blur(input);
    expect(cls().label).toBe('Ledger');
    expect(cls().generics).toBe('T');
    expect(useUiStore.getState().editingId).toBeNull();
    fireEvent.doubleClick(screen.getAllByTitle('Ledger<T>')[0]);
    const again = screen.getByLabelText('Class name');
    fireEvent.change(again, { target: { value: '   ' } });
    fireEvent.blur(again);
    expect(cls().label).toBe('Ledger');
  });
  it('locked class: no grips, delete, add, header edit or member edit', () => {
    put(withMembers, 'class', 'c', true);
    expect(document.querySelector('.uml-grip')).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete member/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add/ })).toBeNull();
    fireEvent.doubleClick(screen.getAllByTitle('Account')[0]);
    expect(useUiStore.getState().editingId).toBeNull();
    fireEvent.doubleClick(screen.getByText('id: int'));
    expect(screen.queryByLabelText('Edit attribute')).toBeNull();
  });
  it('edits a member inline, ignores blank text', () => {
    put(withMembers);
    fireEvent.doubleClick(screen.getByText('id: int'));
    const input = screen.getByLabelText('Edit attribute');
    fireEvent.change(input, { target: { value: '- count: long' } });
    fireEvent.blur(input);
    expect(cls().attributes[0]).toMatchObject({ name: 'count', type: 'long', visibility: '-' });
    fireEvent.doubleClick(screen.getByText('count: long'));
    const i2 = screen.getByLabelText('Edit attribute');
    fireEvent.change(i2, { target: { value: '  ' } });
    fireEvent.blur(i2);
    expect(cls().attributes[0].name).toBe('count');
    fireEvent.doubleClick(screen.getByText(/save/));
    fireEvent.keyDown(screen.getByLabelText('Edit operation'), { key: 'Escape' });
    expect(screen.queryByLabelText('Edit operation')).toBeNull();
  });
  it('Add button creates a member; Enter chains to another; Shift+Enter and Escape do not', () => {
    put();
    const a0 = cls().attributes.length, o0 = cls().operations.length;
    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }));
    let input = screen.getByLabelText('Edit attribute');
    fireEvent.change(input, { target: { value: 'x: int' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(cls().attributes).toHaveLength(a0 + 1);
    expect(screen.queryByLabelText('Edit attribute')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add operation' }));
    input = screen.getByLabelText('Edit operation');
    fireEvent.change(input, { target: { value: 'run()' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(cls().operations.length).toBe(o0 + 2);
    expect(screen.getByLabelText('Edit operation')).toBeInTheDocument();
  });
  it('delete member', () => {
    put(withMembers);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete member attribute' })[0]);
    expect(cls().attributes.map((m) => m.id)).toEqual(['a2']);
  });
  it('context-menu memberEdit opens the new member inline once', () => {
    put(withMembers);
    act(() => useUiStore.getState().setMemberEdit({ nodeId: 'c', memberId: 'a1' }));
    expect(screen.getByLabelText('Edit attribute')).toBeInTheDocument();
    expect(useUiStore.getState().memberEdit).toBeNull();
  });
  it('drag-to-reorder moves a member and shows drop classes', () => {
    put(withMembers);
    const grip = document.querySelectorAll('.uml-grip')[0];
    fireEvent.pointerDown(grip, { clientY: 0 });
    act(() => { window.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: 22 })); });
    expect(document.querySelector('.uml-row.dragging')).not.toBeNull();
    expect(document.querySelector('.uml-row.drop-below')).not.toBeNull();
    act(() => { window.dispatchEvent(new Event('pointerup')); });
    expect(cls().attributes.map((m) => m.id)).toEqual(['a2', 'a1']);
    // reorder operations upward, then a no-move release
    const grips = document.querySelectorAll('.uml-grip');
    fireEvent.pointerDown(grips[3], { clientY: 0 });
    act(() => { window.dispatchEvent(Object.assign(new Event('pointermove'), { clientY: -22 })); });
    expect(document.querySelector('.uml-row.drop-above')).not.toBeNull();
    act(() => { window.dispatchEvent(new Event('pointerup')); });
    expect(cls().operations.map((m) => m.id)).toEqual(['o2', 'o1']);
    fireEvent.pointerDown(document.querySelectorAll('.uml-grip')[0], { clientY: 0 });
    act(() => { window.dispatchEvent(new Event('pointerup')); });
    expect(cls().attributes.map((m) => m.id)).toEqual(['a2', 'a1']);
  });
  it('shared badge appears only with two linked copies', () => {
    put((d) => ({ ...d, modelId: 'm1' }));
    expect(screen.queryByTestId('shared-c')).toBeNull();
    act(() => { s().addNode(blankClass('d', { x: 400, y: 0 }, 'class', 'Account')); s().updateClass('d', (d) => ({ ...d, modelId: 'm1' })); });
    expect(screen.getByTestId('shared-c')).toHaveTextContent('2');
  });
  it('drift marks: changed row, ghosts, count chip', () => {
    put(withMembers);
    setMarks(marks({ classStatus: 'changed', count: 3, byMemberId: new Map([['a1', 'changed']]), ghosts: [{ comp: 'attributes', text: '+ extra: int' }] }));
    expect(document.querySelectorAll('.uml-row.drift-changed')).toHaveLength(1);
    expect(screen.getByTestId('drift-chip-c')).toHaveTextContent('3 in code');
    expect(within(screen.getByTestId('drift-ghosts-c')).getByText('+ + extra: int')).toBeInTheDocument();
    expect(screen.getByTestId('class-c')).not.toHaveClass('drift-class-removed');
  });
  it('drift marks: removed class and unspecified status', () => {
    put(withMembers);
    setMarks(marks({ classStatus: 'removed', count: 1 }));
    expect(screen.getByTestId('drift-chip-c')).toHaveTextContent('removed in code');
    expect(screen.getByTestId('class-c').className).toContain('drift-class-removed');
    setMarks(marks({ count: 2 }));
    expect(screen.getByTestId('drift-chip-c')).toHaveClass('changed');
    setMarks(marks({ count: 0 }));
    expect(screen.queryByTestId('drift-chip-c')).toBeNull();
    expect(screen.queryByTestId('drift-ghosts-c')).toBeNull();
  });
});
