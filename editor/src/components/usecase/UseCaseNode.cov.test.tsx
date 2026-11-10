import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';

const s = () => useDiagramStore.getState();

import { UseCaseNode } from './UseCaseNode';

function mount(data: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const node = { id: 'u1', type: 'usecase', position: { x: 0, y: 0 }, data: { label: 'Login', accent: '#abc', ucKind: 'usecase', ...data } } as unknown as DiagramNode;
  act(() => { s().reset(); s().addNode(node); });
  const P = UseCaseNode as unknown as (p: unknown) => JSX.Element;
  const ui = (d: unknown) => <ReactFlowProvider><P id="u1" data={d} selected={false} {...props} /></ReactFlowProvider>;
  const r = render(ui(node.data));
  return { ...r, again: () => r.rerender(ui(s().nodes[0].data)) };
}

describe('UseCaseNode', () => {
  beforeEach(() => { useUiStore.getState().resetUi(); });

  it('use case: ellipse, no extension points', () => {
    const { container } = mount({}, { selected: true, width: 200, height: 80 });
    expect(container.querySelector('ellipse.uc-ellipse')).toBeTruthy();
    expect(container.querySelector('.uc-chord')).toBeNull();
    expect(container.querySelector('.uc-eps')).toBeNull();
    expect(container.querySelector('.uc-label')!.className).toContain('ellipse');
    expect(screen.getByTestId('usecase-u1').className).toContain('selected');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(4);
  });

  it('use case with extension points: chord, compartment, label offset', () => {
    const { container } = mount({ extensionPoints: ['a', 'b'] });
    expect(container.querySelector('.uc-chord')).toBeTruthy();
    expect(screen.getByTestId('usecase-eps-u1').textContent).toContain('b');
    expect(container.querySelectorAll('.uc-eps > div').length).toBe(3);
    expect((container.querySelector('.uc-label') as HTMLElement).style.bottom).not.toBe('');
  });

  it('actor: stick figure, ignores extension points', () => {
    const { container } = mount({ ucKind: 'actor', extensionPoints: ['a'] });
    expect(container.querySelector('.uc-fig')).toBeTruthy();
    expect(container.querySelector('ellipse')).toBeNull();
    expect(container.querySelector('.uc-eps')).toBeNull();
    expect(container.querySelector('.uc-label')!.className).toContain('actor');
  });

  it('edit via double click; labels differ by kind; empty ignored; locked blocks', () => {
    const m = mount({ ucKind: 'actor' });
    fireEvent.doubleClick(screen.getByTestId('usecase-u1'));
    m.again();
    expect(screen.getByLabelText('Actor name')).toBeTruthy();
    const input = m.container.querySelector('input')!;
    fireEvent.change(input, { target: { value: ' Bob ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('Bob');
    m.unmount();
    const u = mount({});
    act(() => useUiStore.getState().setEditing('u1'));
    u.again();
    expect(screen.getByLabelText('Use case name')).toBeTruthy();
    const i2 = u.container.querySelector('input')!;
    fireEvent.change(i2, { target: { value: ' ' } });
    fireEvent.keyDown(i2, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('Login');
    u.unmount();
    mount({ locked: true });
    act(() => useUiStore.getState().setEditing(null));
    fireEvent.doubleClick(screen.getByTestId('usecase-u1'));
    expect(useUiStore.getState().editingId).toBeNull();
  });
});
