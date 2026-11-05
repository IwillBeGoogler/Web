import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { seedProject, openPalette } from '../test/workspace';
import { scrubValue } from '../lib/scrub';
import { ScrubInput } from './ui/ScrubInput';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
});
const open = () => {
  const r = render(<App initialProjectId={seedProject('Polish').projectId} />);
  openPalette();
  return r;
};

describe('breadcrumb + logo', () => {
  it('shows "Projects / name ▾" with the original logo mark; Projects goes back', async () => {
    open();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByText('Projects')).toBeTruthy();
    expect(within(nav).getByTestId('logo-mark')).toBeTruthy();
    expect((within(nav).getByLabelText('Project name') as HTMLInputElement).value).toBe('Polish');
    await act(async () => void fireEvent.click(within(nav).getByLabelText('Project menu')));
    expect(screen.getByRole('menuitem', { name: 'Rename project' })).toBeTruthy();
    await act(async () => void fireEvent.click(within(nav).getByLabelText('Back to projects')));
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});

describe('pill dock', () => {
  it('has grouped tools and a sliding active pill', () => {
    open();
    const dock = screen.getByRole('toolbar', { name: 'Tools' });
    expect(dock.querySelectorAll('.dock-sep').length).toBe(4);
    expect(dock.querySelector('.dock-pill')).toBeTruthy();
    fireEvent.click(within(dock).getByLabelText('Rectangle'));
    expect(within(dock).getByLabelText('Rectangle').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('empty state', () => {
  it('shows on an empty page; a template fills it; "Blank canvas" dismisses', async () => {
    open();
    expect(screen.getByTestId('empty-canvas')).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByText('Blank canvas')));
    expect(screen.queryByTestId('empty-canvas')).toBeNull();
  });
  it('Start from template inserts it and the overlay disappears', async () => {
    open();
    await act(async () => void fireEvent.click(screen.getByText('Start from template')));
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: 'Monitoring stack' })));
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(10);
    expect(screen.queryByTestId('empty-canvas')).toBeNull();
  });
});

describe('scrub inputs', () => {
  it('scrubValue: steps per 4px, shift x10, alt x0.1, clamped', () => {
    expect(scrubValue(10, 8)).toBe(12);
    expect(scrubValue(10, 8, { shift: true })).toBe(30);
    expect(scrubValue(1, 8, { step: 1, alt: true })).toBe(1.2);
    expect(scrubValue(10, -400, { min: 8 })).toBe(8);
    expect(scrubValue(70, 400, { max: 72 })).toBe(72);
    expect(scrubValue(1.5, 8, { step: 0.5 })).toBe(2.5);
  });
  it('dragging the label changes the value; typing and arrows work', () => {
    const seen: number[] = [];
    function Host() {
      const [v, setV] = useState(12);
      return <ScrubInput label="Font size" value={v} min={8} max={72} onChange={(n) => { seen.push(n); setV(n); }} />;
    }
    render(<Host />);
    const label = screen.getByTestId('scrub-Font size');
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 124, pointerId: 1 });
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('18');
    fireEvent.pointerMove(label, { clientX: 500, pointerId: 1 });
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('72');
    fireEvent.pointerUp(label, { pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 0, pointerId: 1 });
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('72'); // released: no more scrubbing
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '20' } });
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('20');
    fireEvent.keyDown(screen.getByLabelText('Font size'), { key: 'ArrowUp' });
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('21');
  });
  it('the inspector uses it for font size', async () => {
    open();
    act(() => {
      useDiagramStore.getState().addNode({ id: 't', type: 'text', position: { x: 0, y: 0 }, data: { label: 'Hi' } });
      useDiagramStore.getState().selectOnly('node', 't');
    });
    await act(async () => void fireEvent.click(Array.from(document.querySelectorAll<HTMLElement>('.props .acc-header')).filter((b) => /^Text/.test(b.textContent ?? '')).pop()!));
    expect(screen.getByTestId('scrub-Font size')).toBeTruthy();
  });
});

describe('palette tag chips', () => {
  it('offers no preset tag chips under the search box', () => {
    open();
    expect(screen.queryByRole('button', { name: 'Filter by aws' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filter by database' })).toBeNull();
  });
  it('typing a tag in the box lists every item with it; #tag works', async () => {
    open();
    const box = screen.getByLabelText('Search components');
    await act(async () => void fireEvent.change(box, { target: { value: '#monitoring' } }));
    expect(screen.getAllByTestId('palette-prometheus').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('palette-postgresql')).toBeNull();
  });
});

describe('bulk style editor', () => {
  const shape = (id: string, x: number, data = {}) => ({ id, type: 'shape' as const, position: { x, y: 0 }, width: 100, height: 60, data: { label: id, shape: 'rect' as const, ...data } });
  it('shows Mixed where values differ, applies to every selected item in one undo step', async () => {
    open();
    act(() => {
      useDiagramStore.getState().loadDiagram({
        nodes: [{ ...shape('a', 0, { fill: '#ff0000', radius: 4 }), selected: true }, { ...shape('b', 300, { fill: '#00ff00', radius: 4 }), selected: true }, { id: 'j', type: 'junction', position: { x: 600, y: 0 }, width: 10, height: 10, data: { label: '' }, selected: true }],
        edges: [],
      });
    });
    const bulk = within(screen.getByTestId('bulk-style'));
    expect(bulk.getByLabelText('Fill: mixed')).toBeTruthy(); // differing fills
    expect(bulk.queryByLabelText('Icon size')).toBeNull(); // not applicable to shapes
    const past = useDiagramStore.getState().past.length;
    fireEvent.change(bulk.getByLabelText('Radius'), { target: { value: '12' } });
    expect(useDiagramStore.getState().nodes.filter((n) => n.data.radius === 12)).toHaveLength(2);
    expect(useDiagramStore.getState().nodes.find((n) => n.id === 'j')!.data.radius).toBeUndefined();
    expect(useDiagramStore.getState().past.length).toBe(past + 1);
    act(() => useDiagramStore.getState().undo());
    expect(useDiagramStore.getState().nodes.every((n) => n.data.radius !== 12)).toBe(true);
  });
  it('edges: preset applies to all, mixed colour shown', async () => {
    open();
    act(() => {
      useDiagramStore.getState().loadDiagram({
        nodes: [shape('a', 0), shape('b', 300)],
        edges: [{ id: 'e1', source: 'a', target: 'b', data: { color: '#d9480f' } }, { id: 'e2', source: 'a', target: 'b', data: { color: '#1971c2' } }],
      });
      useDiagramStore.setState((st) => ({ edges: st.edges.map((e) => ({ ...e, selected: true })) }));
    });
    const bulk = within(screen.getByTestId('bulk-style'));
    expect(bulk.getByLabelText('Edge colour: mixed')).toBeTruthy();
    fireEvent.click(bulk.getByLabelText('Bulk edge preset'));
    fireEvent.click(screen.getAllByRole('option').find((o) => /trace/i.test(o.textContent ?? ''))!);
    expect(useDiagramStore.getState().edges.every((e) => e.data?.color === '#0c8599')).toBe(true);
    fireEvent.click(bulk.getByRole('button', { name: 'Dashed' }));
    expect(useDiagramStore.getState().edges.every((e) => e.data?.strokeStyle === 'dashed')).toBe(true);
  });
});
