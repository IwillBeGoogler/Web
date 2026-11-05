import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { blankClass, classOf } from '../../lib/uml/geometry';
import type { ClassNodeData } from '../../lib/uml/types';
import { umlEdge } from '../../lib/uml/edges';

const s = () => useDiagramStore.getState();
function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('UML');
  return render(<App initialProjectId={p.projectId} />);
}
const put = (id: string, fn: (d: ClassNodeData) => ClassNodeData, kind: ClassNodeData['kind'] = 'class', label = 'Account') => {
  const n = blankClass(id, { x: 0, y: 0 }, kind, label);
  act(() => { s().addNode(n); s().updateClass(id, fn); });
};

describe('store: UML actions', () => {
  beforeEach(() => s().reset());
  it('updateClass resizes the node (rows are 22px) and is one undo step', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    const h0 = s().nodes[0].height!;
    const past = s().past.length;
    s().updateClass('a', (d) => ({ ...d, attributes: [...d.attributes, { id: 'a9', visibility: '-', name: 'x', type: 'int' }] }));
    expect(s().nodes[0].height).toBe(h0 + 22);
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().nodes[0].height).toBe(h0);
  });
  it('updateUml re-derives markers and dash', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(blankClass('b', { x: 300, y: 0 }));
    s().addEdge({ source: 'a', target: 'b' } as never);
    act(() => useDiagramStore.setState((st) => ({ edges: [umlEdge('e', 'a', 'b', { kind: 'association' })].concat(st.edges.slice(1)) })));
    s().updateUml(['e'], { kind: 'dependency' });
    expect(s().edges.find((e) => e.id === 'e')!.data).toMatchObject({ endMarker: 'open', strokeStyle: 'dashed', uml: { kind: 'dependency' } });
  });
});

describe('ClassNode rendering', () => {
  it('draws visibility symbols, static underline, abstract italics, generics and the stereotype', async () => {
    open();
    put('c1', (d) => ({
      ...d,
      generics: 'T',
      attributes: [
        { id: 'a0', visibility: '-', name: 'id', type: 'number' },
        { id: 'a1', visibility: '#', name: 'cache', type: 'Map<string, T>', static: true },
        { id: 'a2', visibility: '~', name: 'pkg', type: 'int' },
      ],
      operations: [
        { id: 'o0', visibility: '+', name: 'save', params: [{ name: 'item', type: 'T' }], type: 'void' },
        { id: 'o1', visibility: '+', name: 'validate', params: [], abstract: true },
        { id: 'o2', visibility: '+', name: 'create', params: [], type: 'Account', static: true },
      ],
    }));
    await waitFor(() => expect(screen.getByTestId('class-c1')).toBeTruthy());
    const c = screen.getByTestId('class-c1');
    expect(c.querySelector('.uml-title')!.textContent).toBe('Account<T>');
    const vis = [...c.querySelectorAll('.uml-vis')].map((x) => x.textContent);
    expect(vis).toEqual(['-', '#', '~', '+', '+', '+']);
    expect(c.querySelector('[data-row="a1"] .uml-text')!.classList.contains('static')).toBe(true);
    expect(c.querySelector('[data-row="a0"] .uml-text')!.classList.contains('static')).toBe(false);
    expect(c.querySelector('[data-row="o1"] .uml-text')!.classList.contains('abstract')).toBe(true);
    expect(c.querySelector('[data-row="o2"] .uml-text')!.classList.contains('static')).toBe(true);
    expect(c.querySelector('[data-row="o0"] .uml-text')!.textContent).toBe('save(item: T): void');
    expect(c.querySelector('[data-row="a1"] .uml-text')!.textContent).toBe('cache: Map<string, T>');
    expect(c.querySelector('.uml-stereo')).toBeNull();
  });
  it('interface and abstract class get stereotypes; abstract names are italic; enums list literals', async () => {
    open();
    put('i1', (d) => d, 'interface', 'Repo');
    put('x1', (d) => d, 'abstract', 'Shape');
    put('e1', (d) => d, 'enum', 'Color');
    await waitFor(() => expect(screen.getByTestId('class-e1')).toBeTruthy());
    expect(screen.getByTestId('class-i1').querySelector('.uml-stereo')!.textContent).toBe('«interface»');
    expect(screen.getByTestId('class-x1').querySelector('.uml-stereo')!.textContent).toBe('«abstract»');
    expect(screen.getByTestId('class-x1').querySelector('.uml-title')!.classList.contains('abstract')).toBe(true);
    expect(screen.getByTestId('class-e1').querySelector('.uml-stereo')!.textContent).toBe('«enum»');
    expect(screen.getByTestId('class-e1').querySelectorAll('.uml-vis').length).toBe(0);
    expect(screen.getByTestId('class-e1').querySelectorAll('.uml-row').length).toBe(2);
    expect(screen.getByTestId('class-e1').querySelectorAll('[data-compartment]').length).toBe(1);
  });
  it('edits a member inline, adds and removes members, collapses a compartment', async () => {
    open();
    put('c1', (d) => d);
    await waitFor(() => expect(screen.getByTestId('class-c1')).toBeTruthy());
    const c = screen.getByTestId('class-c1');
    fireEvent.doubleClick(c.querySelector('[data-row="o0"] .uml-text')!);
    const input = c.querySelector('input.uml-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'static # make(a: A): Thing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const op = classOf(s().nodes.find((n) => n.id === 'c1')!).operations[0];
    expect(op).toMatchObject({ id: 'o0', visibility: '#', name: 'make', static: true, type: 'Thing' });
    // Enter also started a new operation and opened it for editing
    expect(classOf(s().nodes.find((n) => n.id === 'c1')!).operations).toHaveLength(2);
    await waitFor(() => expect(c.querySelector('[data-row="o1"] input.uml-input')).toBeTruthy());
    fireEvent.click(c.querySelector('button[aria-label="Add attribute"]')!);
    expect(classOf(s().nodes.find((n) => n.id === 'c1')!).attributes).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText('Delete member attribute')[0]);
    expect(classOf(s().nodes.find((n) => n.id === 'c1')!).attributes).toHaveLength(1);
    fireEvent.click(c.querySelector('button[aria-label="Collapse attributes"]')!);
    expect(classOf(s().nodes.find((n) => n.id === 'c1')!).collapsedAttributes).toBe(true);
    await waitFor(() => expect(screen.getByTestId('class-c1').querySelectorAll('.uml-row').length).toBe(2)); // both operations; the attributes are a summary
    expect(screen.getByTestId('class-c1').textContent).toContain('1 attribute');
  });
});

import { executeAction } from '../../lib/actions';
import { getMenuItems, flattenMenu } from '../../lib/menu';
import { getItem, createNodeFromPaletteItem } from '../../data/palette';

describe('UML relations through actions and menus', () => {
  beforeEach(() => s().reset());
  const sel = (ids: string[]) => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })) }));
  it('uml-connect:<kind> joins the two selected classes (first selected = source) in one undo step', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(blankClass('b', { x: 400, y: 0 }));
    sel(['a', 'b']);
    const past = s().past.length;
    executeAction('uml-connect:inheritance');
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0]).toMatchObject({ source: 'a', target: 'b', data: { uml: { kind: 'inheritance' }, endMarker: 'hollowTriangle' } });
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().edges).toHaveLength(0);
  });
  it('uml-connect on a selected edge changes its kind', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(blankClass('b', { x: 400, y: 0 }));
    sel(['a', 'b']);
    executeAction('uml-connect:association');
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: false })), edges: st.edges.map((e) => ({ ...e, selected: true })) }));
    executeAction('uml-connect:composition');
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0].data).toMatchObject({ uml: { kind: 'composition' }, endMarker: 'filledDiamond' });
  });
  it('the edge context menu offers every relation kind, directed and the multiplicity editor', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(blankClass('b', { x: 400, y: 0 }));
    sel(['a', 'b']);
    executeAction('uml-connect:association');
    const e = s().edges[0];
    const ids = flattenMenu(getMenuItems({ type: 'edge', id: e.id }, { nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 })).map((i) => i.id);
    for (const k of ['inheritance', 'realization', 'composition', 'aggregation', 'association', 'dependency']) expect(ids).toContain(`uml-kind:${k}`);
    expect(ids).toContain('uml-directed');
  });
  it('the class context menu has add attribute / operation and the kind switch', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    const ids = flattenMenu(getMenuItems({ type: 'node', id: 'a' }, { nodes: s().nodes, edges: s().edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 })).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['class-add-attribute', 'class-add-operation', 'class-kind:interface', 'tidy-uml']));
    executeAction('class-add-operation', { nodeId: 'a' });
    expect(classOf(s().nodes[0]).operations).toHaveLength(2);
    executeAction('class-kind:interface', { nodeId: 'a' });
    expect(classOf(s().nodes[0]).kind).toBe('interface');
  });
  it('tidy-uml arranges classes: parents above children', () => {
    s().addNode(blankClass('p', { x: 0, y: 500 }));
    s().addNode(blankClass('c', { x: 0, y: 0 }));
    s().addEdge({ source: 'c', target: 'p' } as never);
    useDiagramStore.setState((st) => ({ edges: [umlEdge('e', 'c', 'p', { kind: 'inheritance' })].concat(st.edges.slice(1)) }));
    executeAction('tidy-uml');
    const y = (id: string) => s().nodes.find((n) => n.id === id)!.position.y;
    expect(y('p')).toBeLessThan(y('c'));
  });
  it('package and note palette items', () => {
    const pk = createNodeFromPaletteItem(getItem('uml-package')!, { x: 0, y: 0 }, 'p');
    const nt = createNodeFromPaletteItem(getItem('uml-note')!, { x: 0, y: 0 }, 'n');
    expect(pk.data.variant).toBe('package');
    expect(nt.data.umlNote).toBe(true);
  });
});

describe('Package and note nodes', () => {
  it('a package group draws a tab header; a UML note has a folded corner', async () => {
    open();
    act(() => {
      s().addNode(createNodeFromPaletteItem(getItem('uml-package')!, { x: 0, y: 0 }, 'pk'));
      s().addNode(createNodeFromPaletteItem(getItem('uml-note')!, { x: 500, y: 0 }, 'nt'));
    });
    await waitFor(() => expect(document.querySelector('.node-group.variant-package .pkg-tab')).toBeTruthy());
    expect(document.querySelector('.node-group.variant-package .pkg-tab')!.textContent).toBe('package');
    expect(document.querySelector('.node-sticky.uml-note')).toBeTruthy();
  });
  it('a note attached to a class by a dashed note link', () => {
    s().reset();
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(createNodeFromPaletteItem(getItem('uml-note')!, { x: 300, y: 0 }, 'nt'));
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: n.id === 'nt' || n.id === 'a' })) }));
    executeAction('uml-connect:note');
    expect(s().edges[0]).toMatchObject({ data: { uml: { kind: 'note' }, strokeStyle: 'dashed', endMarker: 'none' } });
  });
});

describe('connecting classes by dragging', () => {
  beforeEach(() => s().reset());
  it('connect() between two classes draws a UML association, class + note a note link', () => {
    s().addNode(blankClass('a', { x: 0, y: 0 }));
    s().addNode(blankClass('b', { x: 400, y: 0 }));
    s().addNode(createNodeFromPaletteItem(getItem('uml-note')!, { x: 0, y: 300 }, 'nt'));
    s().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    s().connect({ source: 'nt', target: 'a', sourceHandle: null, targetHandle: null });
    expect(s().edges.map((e) => e.data?.uml?.kind)).toEqual(['association', 'note']);
  });
});
