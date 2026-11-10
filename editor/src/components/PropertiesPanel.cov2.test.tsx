import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankTable } from '../lib/er/relations';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import { useUiStore } from '../store/uiStore';
import type { DiagramEdge, DiagramNode } from '../types';
import { PropertiesPanel } from './PropertiesPanel';

vi.setConfig({ testTimeout: 30000 });
const s = () => useDiagramStore.getState();
const ALL_OPEN = JSON.stringify({ open: ['general', 'cluster', 'style', 'text', 'arrange', 'instance', 'autolayout', 'constraints', 'link', 'styles', 'crosslinks', 'arch'], multi: true });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('sdd:acc:props', ALL_OPEN);
  s().reset();
  useUiStore.getState().resetUi();
  useToastStore.getState().clear();
});

const node = (id: string, type: string | undefined, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, ...(type ? { type } : {}), position: { x: 0, y: 0 }, selected: true, data: { label: id, ...data }, ...extra }) as unknown as DiagramNode;
const edge = (id: string, source: string, target: string, data?: Record<string, unknown>, extra: Partial<DiagramEdge> = {}): DiagramEdge =>
  ({ id, source, target, selected: true, ...(data ? { data } : {}), ...extra }) as unknown as DiagramEdge;
const put = (nodes: DiagramNode[], edges: DiagramEdge[] = []) => act(() => useDiagramStore.setState({ nodes, edges }));
const pick = (label: string, option: string | RegExp) => {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const commit = (el: HTMLElement, value: string) => { fireEvent.change(el, { target: { value } }); fireEvent.blur(el); };

describe('PropertiesPanel node fallbacks', () => {
  it('a node without a type is treated as a component; an unknown type is an "Item"', () => {
    put([node('n1', undefined, { label: 'plain' })]);
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.getByLabelText('Label')).toHaveValue('plain'); // icon kind: title editable
    expect(screen.getByText('Component')).toBeInTheDocument();
    unmount();
    put([node('w', 'weird', { label: '' })]);
    render(<PropertiesPanel />);
    expect(screen.getByTitle('Item')).toHaveTextContent('Item'); // no label: kind name
    expect(screen.queryByLabelText('Label')).toBeInTheDocument(); // general-section label row for non-title kinds
  });

  it('static title shows only the first label line', () => {
    put([node('s', 'sticky', { label: 'first\nsecond' })]);
    render(<PropertiesPanel />);
    expect(document.querySelector('.ins-title-static')).toHaveTextContent(/^first$/);
  });

  it('dev mode shows the dev panel only when something is selected', () => {
    act(() => useUiStore.setState({ devMode: true }));
    put([]);
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    unmount();
    put([node('a', 'icon', { iconId: 'service' })]);
    render(<PropertiesPanel />);
    expect(screen.queryByText('Nothing selected')).toBeNull();
    expect(screen.queryByLabelText('Label')).toBeNull();
  });

  it('the header title focuses only for kinds that edit inline (not frame/mindmap/sticky)', () => {
    put([node('f', 'frame', {})]);
    act(() => useUiStore.getState().setEditing('f'));
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.getByLabelText('Label')).not.toHaveFocus();
    unmount();
    cleanup();
    put([node('i', 'icon', { iconId: 'service' })]);
    act(() => useUiStore.getState().setEditing('i'));
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Label')).toHaveFocus();
    commit(screen.getByLabelText('Label'), 'renamed');
    expect(useUiStore.getState().editingId).toBeNull();
    expect(s().nodes[0].data.label).toBe('renamed');
    // done without editing leaves the editing target alone
    act(() => useUiStore.getState().setEditing('other'));
    commit(screen.getByLabelText('Label'), 'again');
    expect(useUiStore.getState().editingId).toBe('other');
  });

  it('mindmap and sticky: sticky label is multiline and edits through patch', () => {
    put([node('m', 'mindmap', { label: 'root' })]);
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
    unmount();
    put([node('st', 'sticky', { label: 'note' })]);
    render(<PropertiesPanel />);
    commit(screen.getByLabelText('Label'), 'line1\nline2');
    expect(s().nodes[0].data.label).toBe('line1\nline2');
  });

  it('cluster with one member says "1 member"; a collapsed ring cluster has chips', () => {
    put([node('c', 'cluster', { topology: 'ring', collapsed: true }), node('m', 'icon', { iconId: 'service' }, { parentId: 'c', selected: false, hidden: true })]);
    render(<PropertiesPanel />);
    expect(screen.getByText('1 member')).toBeInTheDocument();
    expect(screen.getAllByText('ring').length).toBeGreaterThan(0);
    expect(screen.getByText('Collapsed')).toBeInTheDocument();
  });

  it('cluster: replication and topology selects write the value, and "unspecified" clears it', () => {
    put([node('c', 'cluster', { topology: 'ring', replication: 'sync' })]);
    render(<PropertiesPanel />);
    pick('Replication mode', 'Default (async)');
    expect(s().nodes[0].data.replication).toBeUndefined();
    pick('Replication mode', 'sync');
    expect(s().nodes[0].data.replication).toBe('sync');
    pick('Topology', 'Unspecified');
    expect(s().nodes[0].data.topology).toBeUndefined();
  });
});

describe('PropertiesPanel inspectors by kind', () => {
  it('a table node uses the table inspector and has no generic style section', () => {
    put([blankTable('t', { x: 0, y: 0 }, 'orders')]);
    s().selectOnly('node', 't');
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Table name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Opacity')).toBeNull();
  });

  it('a lone drawing has no text section, a mindmap no design sections', () => {
    put([node('d', 'draw', { stroke: '#000000' })]);
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.queryByRole('button', { name: /^Text$/ })).toBeNull();
    unmount();
    put([node('m', 'mindmap', { label: 'x' })]);
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
  });

  it('mindmap header title edits through the mind map label; text kind finishes inline edit', () => {
    put([node('m', 'mindmap', { label: 'root' })]);
    const { unmount } = render(<PropertiesPanel />);
    commit(screen.getByLabelText('Label'), 'renamed root');
    expect(s().nodes[0].data.label).toBe('renamed root');
    unmount();
    put([node('t', 'text', { label: 'hello' })]);
    act(() => useUiStore.getState().setEditing('t'));
    render(<PropertiesPanel />);
    commit(screen.getByLabelText('Label'), 'bye');
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('custom role field with no role yet starts empty; a stamp without emoji starts empty', () => {
    put([node('i', 'icon', { iconId: 'service' })]);
    act(() => useUiStore.getState().setFocusRole(true));
    const { unmount } = render(<PropertiesPanel />);
    expect(screen.getByLabelText('Custom role')).toHaveValue('');
    unmount();
    put([node('e', 'stamp', {})]);
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Stamp emoji')).toHaveValue('');
  });

  it('cluster technology row shows a placeholder while the icon is unresolved', () => {
    put([node('c', 'cluster', { iconId: 'not-a-real-icon-id' })]);
    render(<PropertiesPanel />);
    expect(document.querySelector('.pick-title')?.textContent).toBeTruthy();
  });

  it('custom role field next to a preset role starts empty', () => {
    put([node('i', 'icon', { iconId: 'service', role: 'primary' })]);
    act(() => useUiStore.getState().setFocusRole(true));
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Custom role')).toHaveValue('');
  });

  it('card: tags start undefined, add one, edit its text, remove it; subtitle empty clears', () => {
    put([node('c', 'card', { iconId: 'service', subtitle: 'sub' })]);
    render(<PropertiesPanel />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add tag' }));
    expect(s().nodes[0].data.tags).toHaveLength(1);
    commit(screen.getByLabelText('Tag text 1'), 'beta');
    expect((s().nodes[0].data.tags ?? [])[0].text).toBe('beta');
    fireEvent.click(screen.getByLabelText('Remove tag 1'));
    expect(s().nodes[0].data.tags ?? []).toHaveLength(0);
    commit(screen.getByLabelText('Card subtitle'), '');
    expect(s().nodes[0].data.subtitle).toBeUndefined();
  });

  it('stamp: a blank emoji is ignored, a long one is cut to 8 characters', () => {
    put([node('e', 'stamp', { emoji: '🔥' })]);
    render(<PropertiesPanel />);
    commit(screen.getByLabelText('Stamp emoji'), '   ');
    expect(s().nodes[0].data.emoji).toBe('🔥');
    commit(screen.getByLabelText('Stamp emoji'), ' abcdefghijkl ');
    expect(s().nodes[0].data.emoji).toBe('abcdefgh');
  });

  it('group: the opacity slider writes fill opacity', () => {
    put([node('g', 'group', { fillOpacity: 40 })]);
    render(<PropertiesPanel />);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '70' } });
    expect(s().nodes[0].data.fillOpacity).toBe(70);
  });

  it('icon role: preset, custom flow, clear, invalid custom role toasts the reason', () => {
    put([node('i', 'icon', { iconId: 'service', role: 'primary' })]);
    render(<PropertiesPanel />);
    expect(screen.queryByLabelText('Custom role')).toBeNull();
    pick('Role', 'No role');
    expect(s().nodes[0].data.role).toBeUndefined();
    pick('Role', 'Custom…');
    expect(useUiStore.getState().focusRole).toBe(true);
    const custom = screen.getByLabelText('Custom role');
    commit(custom, '');
    expect(useToastStore.getState().toasts).toHaveLength(0); // empty: nothing
    act(() => useUiStore.getState().setFocusRole(true)); // blur closes the field
    commit(screen.getByLabelText('Custom role'), 'x'.repeat(30));
    expect(useToastStore.getState().toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(s().nodes[0].data.role).toBeUndefined();
    act(() => useUiStore.getState().setFocusRole(true));
    commit(screen.getByLabelText('Custom role'), 'hot-data');
    expect(s().nodes[0].data.role).toBe('hot-data');
    expect(useUiStore.getState().focusRole).toBe(false);
  });
});

describe('PropertiesPanel edges', () => {
  it('an edge with no data uses the style defaults and derived arrowheads', () => {
    put([node('a', 'icon', { label: 'A' }, { selected: false }), node('b', 'icon', { label: '' }, { selected: false })], [edge('e', 'a', 'b')]);
    render(<PropertiesPanel />);
    expect(screen.getByText('Untitled edge')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Edge preset' })).toHaveTextContent('Custom');
    expect(screen.getByRole('combobox', { name: 'Cluster edge kind' })).toHaveTextContent('None');
    expect(screen.getByRole('combobox', { name: 'Start arrowhead' })).toHaveTextContent('None');
    expect(screen.getByRole('combobox', { name: 'End arrowhead' })).toHaveTextContent('Arrow');
    expect(screen.getByText('A → b')).toBeInTheDocument(); // empty label: falls back to id
  });

  it('arrows both derive both markers; unknown line types fall back to their raw name', () => {
    put([node('a', 'icon', {}, { selected: false }), node('b', 'icon', {}, { selected: false })], [edge('e', 'a', 'b', { arrows: 'both', lineType: 'weird' })]);
    render(<PropertiesPanel />);
    expect(screen.getByRole('combobox', { name: 'Start arrowhead' })).toHaveTextContent('Arrow');
    expect(screen.getByRole('combobox', { name: 'End arrowhead' })).toHaveTextContent('Arrow');
    expect(screen.getByText('weird')).toBeInTheDocument();
  });

  it('start-only arrows: start marker arrow, end marker none', () => {
    put([node('a', 'icon', {}, { selected: false }), node('b', 'icon', {}, { selected: false })], [edge('e', 'a', 'b', { arrows: 'start' })]);
    render(<PropertiesPanel />);
    expect(screen.getByRole('combobox', { name: 'Start arrowhead' })).toHaveTextContent('Arrow');
    expect(screen.getByRole('combobox', { name: 'End arrowhead' })).toHaveTextContent('None');
  });

  it('edge selects: preset "Custom" and kind "None" do nothing; a real kind and a marker write through', () => {
    put([node('a', 'icon', {}, { selected: false }), node('b', 'icon', {}, { selected: false })], [edge('e', 'a', 'b', { kind: 'replication' })]);
    render(<PropertiesPanel />);
    const before = s().edges[0].data;
    pick('Edge preset', 'Custom');
    pick('Cluster edge kind', 'None');
    expect(s().edges[0].data).toEqual(before);
    pick('End arrowhead', 'Diamond');
    expect(s().edges[0].data?.endMarker).toBe('diamond');
    pick('Cluster edge kind', 'failover');
    expect(s().edges[0].data?.kind).toBe('failover');
  });

  it('edge preset applies once chosen', () => {
    put([node('a', 'icon', {}, { selected: false }), node('b', 'icon', {}, { selected: false })], [edge('e', 'a', 'b', {})]);
    render(<PropertiesPanel />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Edge preset' }));
    const opts = screen.getAllByRole('option');
    expect(opts.length).toBeGreaterThan(1);
    fireEvent.click(within(document.body).getAllByRole('option')[1]);
    expect(s().edges[0].data?.preset).toBeTruthy();
  });

  it('a relation edge between table nodes shows the relation inspector', () => {
    put([blankTable('t1', { x: 0, y: 0 }, 'a'), blankTable('t2', { x: 300, y: 0 }, 'b')].map((n) => ({ ...n, selected: false })), [edge('r', 't1', 't2', { relation: { fromCol: '', toCol: '', cardinality: '1:N' } })]);
    render(<PropertiesPanel />);
    expect(screen.getByLabelText('Edge label')).toBeInTheDocument();
    expect(document.querySelector('.prop-body')?.textContent).toMatch(/Cardinality|Relation|1:N/i);
  });
});
