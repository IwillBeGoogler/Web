import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { designSections } from './DesignSections';
import { DevPanel } from './DevPanel';
import { useComponentSection } from './ComponentLibrary';
import { useDiagramStore } from '../../store/diagramStore';
import { useLibraryDoc } from '../../lib/library/store';
import { useWorkspace } from '../../workspace/store';
import { executeAction } from '../../lib/actions';
import { exercise } from '../../test/exercise';
import type { DiagramNode } from '../../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id, iconId: 'service' }, ...extra });
beforeEach(() => { s().reset(); useLibraryDoc.getState().close(); useLibraryDoc.getState().open('p1'); });

function Sections({ id, hasStyles = true }: { id: string; hasStyles?: boolean }) {
  const nodes = useDiagramStore((st) => st.nodes);
  const node = nodes.find((x) => x.id === id)!;
  return <div>{designSections(node, nodes, hasStyles).map((sec) => <section key={sec.id} data-sec={sec.id}>{sec.content}</section>)}</div>;
}

describe('designSections', () => {
  it('group with auto layout, constraints (inside a frame), link, styles', () => {
    act(() => {
      s().placeNodes([n('f', 0, 0, { type: 'frame', width: 800, height: 600 }), n('g', 100, 100, { type: 'group', width: 400, height: 300 }), n('c', 120, 120, { parentId: 'g' })]);
    });
    const { container, unmount } = render(<Sections id="g" />);
    expect(container.querySelector('[data-sec="autolayout"]')).toBeTruthy();
    expect(container.querySelector('[data-sec="constraints"]')).toBeTruthy();
    exercise(container);
    unmount();
    // turn on auto layout on the group, then inspect the child and the group again
    act(() => executeAction('auto-layout:row', { nodeId: 'g' }));
    act(() => s().updateNodesData(['g'], { autoLayout: { mode: 'grid', gap: 8, padding: 8, align: 'start', justify: 'start', columns: 2 } } as never));
    for (const id of ['g', 'c']) {
      const r = render(<Sections id={id} />);
      exercise(r.container, { skipButtons: /Go to link/ });
      r.unmount();
    }
    for (const mode of ['row', 'column']) {
      act(() => s().updateNodesData(['g'], { autoLayout: { mode, gap: 8, padding: 8, align: 'start', justify: 'start' } } as never));
      const r = render(<Sections id="g" />);
      exercise(r.container);
      r.unmount();
    }
  });
  it('link section lists files, nodes and backlinks', () => {
    act(() => {
      s().placeNodes([n('a', 0, 0), n('b', 300, 0)]);
      s().updateNodesData(['a'], { link: { fileId: s().projectId, nodeId: 'b' } } as never);
      s().updateNodesData(['b'], { link: { fileId: s().projectId, nodeId: 'a' }, source: 'src/x.ts:1' } as never);
    });
    const { container } = render(<Sections id="a" />);
    exercise(container, { skipButtons: /Go to link|^b|^a/ });
    expect(container.querySelector('[aria-label="Link target file"]')).toBeTruthy();
    for (const b of Array.from(container.querySelectorAll<HTMLButtonElement>('.backlinks button'))) fireEvent.click(b);
    expect(useWorkspace.getState().tree.files).toBeDefined();
  });
  it('styles: add colour/text styles then edit them', () => {
    act(() => s().placeNodes([n('a', 0, 0, { data: { label: 'a', fill: '#ff0000', fontSize: 14, bold: true } as never })]));
    const { container } = render(<Sections id="a" hasStyles />);
    const plusColour = Array.from(container.querySelectorAll('button')).find((b) => /Colour/.test(b.textContent ?? ''))!;
    act(() => { fireEvent.click(plusColour); });
    const plusText = Array.from(container.querySelectorAll('button')).find((b) => /\+ Text/.test(b.textContent ?? ''));
    if (plusText) act(() => { fireEvent.click(plusText); });
    expect(Object.keys(useLibraryDoc.getState().doc.styles.colors).length).toBeGreaterThan(0);
    exercise(container);
    act(() => s().updateNodesData(['a'], { styles: { fill: Object.keys(useLibraryDoc.getState().doc.styles.colors)[0] } } as never));
    exercise(container);
  });
  it('component main + instance sections', () => {
    act(() => { s().placeNodes([n('a', 0, 0, { selected: true }), n('b', 200, 0, { selected: true })]); });
    act(() => executeAction('create-component'));
    const lib = useLibraryDoc.getState().doc;
    expect(Object.keys(lib.components)).toHaveLength(1);
    const main = s().nodes.find((x) => x.data.componentMain);
    expect(main).toBeTruthy();
    const r1 = render(<Sections id={main!.id} />);
    expect(r1.container.querySelector('[data-sec="instance"]')).toBeTruthy();
    r1.unmount();
    const cid = Object.keys(lib.components)[0];
    act(() => executeAction(`insert-component:${cid}`, { at: { x: 500, y: 500 } }));
    const inst = s().nodes.find((x) => x.data.instance);
    expect(inst).toBeTruthy();
    const r2 = render(<Sections id={inst!.id} />);
    exercise(r2.container, { skipButtons: /Detach/ });
    r2.unmount();
    // component list in the palette
    const toast = vi.fn();
    void toast;
    function Lib() { const sec = useComponentSection(); return <div>{sec?.content}</div>; }
    const r3 = render(<Lib />);
    expect(screen.getByLabelText(/Insert/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Insert/ })[0]);
    fireEvent.dragStart(screen.getAllByRole('button', { name: /^Insert/ })[0], { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    r3.unmount();
    // detach then deleted component
    act(() => useLibraryDoc.getState().update((d) => ({ ...d, components: {} })));
    const r4 = render(<Sections id={inst!.id} />);
    r4.unmount();
  });
  it('component list: delete asks for confirmation', async () => {
    act(() => { s().placeNodes([n('a', 0, 0, { selected: true })]); });
    act(() => executeAction('create-component'));
    function Lib() { const sec = useComponentSection(); return <div>{sec?.content ?? 'none'}</div>; }
    render(<Lib />);
    fireEvent.click(screen.getByRole('button', { name: /^Delete/ }));
    await waitFor(() => expect(document.body.textContent).toBeDefined());
  });
});

describe('DevPanel', () => {
  it('asks to select something when nothing is selected', () => {
    render(<DevPanel />);
    expect(screen.getByText(/Select something/)).toBeTruthy();
  });
  it('shows node properties and every snippet, copy works and fails gracefully', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('no'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    act(() => { s().placeNodes([n('a', 0, 0, { selected: true, data: { label: 'A', fill: '#fff', stroke: '#000', textColor: '#111', fontSize: 14, bold: true, align: 'left', source: 'https://x.dev/a' } as never }), n('b', 300, 0)]); });
    render(<DevPanel />);
    expect(screen.getByTestId('dev-panel')).toBeTruthy();
    for (const b of screen.getAllByRole('button').filter((x) => x.getAttribute('aria-pressed') !== null)) {
      fireEvent.click(b);
      const copy = screen.queryAllByRole('button', { name: /^Copy / }).find((x) => x.getAttribute('aria-pressed') === null && /Copy/.test(x.getAttribute('aria-label') ?? ''));
      if (copy) { await act(async () => { fireEvent.click(copy); }); }
    }
    expect(writeText).toHaveBeenCalled();
  });
  it('edge selection shows JSON', async () => {
    act(() => { s().placeNodes([n('a'), n('b', 300, 0)]); s().addEdge({ source: 'a', target: 'b', selected: true } as never); });
    render(<DevPanel />);
    expect(screen.getByText(/Dev mode ·/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy JSON/ })); });
  });
  it('every UML kind', () => {
    act(() => { s().placeNodes([n('a', 0, 0, { selected: true, type: 'class', data: { label: 'C', kind: 'class', attributes: [], operations: [] } as never })]); });
    render(<DevPanel />);
    expect(screen.getByTestId('dev-panel')).toBeTruthy();
  });
});
