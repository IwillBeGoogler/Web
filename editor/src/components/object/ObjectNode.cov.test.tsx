import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';

const s = () => useDiagramStore.getState();

import { ObjectNode } from './ObjectNode';

function mount(data: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const node = { id: 'o1', type: 'object', position: { x: 0, y: 0 }, data: { label: 'a', accent: '#abc', slots: [], ...data } } as unknown as DiagramNode;
  act(() => { s().reset(); s().addNode(node); });
  const P = ObjectNode as unknown as (p: unknown) => JSX.Element;
  const ui = (d: unknown) => <ReactFlowProvider><P id="o1" data={d} selected={false} {...props} /></ReactFlowProvider>;
  const r = render(ui(node.data));
  return { ...r, again: () => r.rerender(ui(s().nodes[0].data)) };
}

describe('ObjectNode', () => {
  beforeEach(() => { useUiStore.getState().resetUi(); });

  it('title is name : Class, slots with and without value', () => {
    const { container } = mount({ label: 'bob', className: 'Person', slots: [{ id: 's1', name: 'age', value: '3' }, { id: 's2', name: 'nick', value: '' }] }, { selected: true });
    expect(container.querySelector('.ob-head')!.textContent).toBe('bob : Person');
    const slots = container.querySelectorAll('.ob-slot');
    expect(slots[0].textContent).toBe('age = 3');
    expect(slots[1].textContent).toBe('nick');
    expect(container.querySelectorAll('.ob-eq').length).toBe(1);
    expect(screen.getByTestId('object-o1').className).toContain('selected');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(4);
  });

  it('no slots section when slots empty or missing; no class suffix', () => {
    const a = mount({ label: 'x' });
    expect(a.container.querySelector('.ob-head')!.textContent).toBe('x');
    expect(a.container.querySelector('.ob-slots')).toBeNull();
    a.unmount();
    const b = mount({ label: 'y', slots: undefined });
    expect(b.container.querySelector('.ob-slots')).toBeNull();
  });

  it('double click edits title; commit trims; empty ignored; locked blocks', () => {
    const m = mount({ label: 'bob' });
    fireEvent.doubleClick(screen.getByTestId('object-o1'));
    expect(useUiStore.getState().editingId).toBe('o1');
    m.again();
    const input = m.container.querySelector('input')!;
    fireEvent.change(input, { target: { value: ' amy ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('amy');
    act(() => useUiStore.getState().setEditing('o1'));
    m.again();
    const i2 = m.container.querySelector('input')!;
    fireEvent.change(i2, { target: { value: '  ' } });
    fireEvent.keyDown(i2, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('amy');
    m.unmount();
    mount({ label: 'z', locked: true });
    act(() => useUiStore.getState().setEditing(null));
    fireEvent.doubleClick(screen.getByTestId('object-o1'));
    expect(useUiStore.getState().editingId).toBeNull();
  });
});
