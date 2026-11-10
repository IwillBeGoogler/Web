import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';

const s = () => useDiagramStore.getState();

import { ComponentNode } from './ComponentNode';

function mount(data: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const node = { id: 'c1', type: 'component', position: { x: 0, y: 0 }, data: { label: 'Auth', accent: '#abc', ...data } } as unknown as DiagramNode;
  act(() => { s().reset(); s().addNode(node); });
  const P = ComponentNode as unknown as (p: unknown) => JSX.Element;
  return render(<ReactFlowProvider><P id="c1" data={node.data} selected={false} {...props} /></ReactFlowProvider>);
}

describe('ComponentNode', () => {
  beforeEach(() => { useUiStore.getState().resetUi(); });

  it('plain component: default stereotype, name, no ports, 4 handles', () => {
    const { container } = mount({ compKind: 'component' });
    expect(screen.getByTestId('component-c1').className).toBe('cp');
    expect(container.querySelector('.cp-stereo')!.textContent).toBe('«component»');
    expect(container.querySelector('.cp-name')!.textContent).toBe('Auth');
    expect(container.querySelector('.cp-text')!.className).not.toContain('container');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(4);
  });

  it('node kind, custom stereotype, container, selected', () => {
    const { container } = mount({ compKind: 'node', stereotype: 'svc', container: true }, { selected: true, width: 200, height: 100 });
    expect(screen.getByTestId('component-c1').className).toContain('selected');
    expect(container.querySelector('.cp-stereo')!.textContent).toBe('«svc»');
    expect(container.querySelector('.cp-text')!.className).toContain('container');
    expect((container.querySelector('.cp-text') as HTMLElement).style.top).toBe('10px');
    expect(container.querySelector('polygon.cp-shape')).toBeTruthy();
  });

  it('artifact kind draws folded page', () => {
    const { container } = mount({ compKind: 'artifact' });
    expect(container.querySelector('.cp-stereo')!.textContent).toBe('«artifact»');
    expect(container.querySelector('path.cp-shape')).toBeTruthy();
  });

  it('ports: provided ball, required socket, labels per side, extra handles', () => {
    const ports = [
      { id: 'p1', name: 'A', side: 'left', kind: 'provided' },
      { id: 'p2', name: 'B', side: 'right', kind: 'required', offset: 0.3 },
      { id: 'p3', name: 'C', side: 'top', kind: 'required' },
      { id: 'p4', name: 'D', side: 'bottom', kind: 'provided' },
    ];
    const { container } = mount({ compKind: 'component', ports });
    expect(screen.getByTestId('component-c1').className).toContain('has-ports');
    expect(container.querySelectorAll('[data-kind="provided"]').length).toBe(2);
    expect(container.querySelectorAll('[data-kind="required"]').length).toBe(2);
    expect(Array.from(container.querySelectorAll('.cp-port-label')).map((e) => e.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(container.querySelectorAll('.port-handle').length).toBe(4);
  });

  it('provided / required interfaces ignore ports and render lollipop / socket', () => {
    const a = mount({ compKind: 'provided', ports: [{ id: 'p', name: 'x', side: 'left', kind: 'provided' }] });
    expect(a.container.querySelector('circle.cp-ball')).toBeTruthy();
    expect(a.container.querySelector('.cp-iface-label')!.textContent).toBe('Auth');
    expect(a.container.querySelector('.cp-port-label')).toBeNull();
    a.unmount();
    const b = mount({ compKind: 'required', facing: 'down' });
    expect(b.container.querySelector('path.cp-line')!.getAttribute('transform')).toContain('rotate(90');
    b.unmount();
    const c = mount({ compKind: 'required' });
    expect(c.container.querySelector('path.cp-line')!.getAttribute('transform')).toContain('rotate(0');
  });

  it('double click edits name; commit trims, empty ignored, locked blocks', () => {
    const { container, rerender } = mount({ compKind: 'component' });
    fireEvent.doubleClick(screen.getByTestId('component-c1'));
    expect(useUiStore.getState().editingId).toBe('c1');
    const P = ComponentNode as unknown as (p: unknown) => JSX.Element;
    const data = s().nodes[0].data;
    rerender(<ReactFlowProvider><P id="c1" data={data} selected={false} /></ReactFlowProvider>);
    const input = container.querySelector('input')!;
    fireEvent.change(input, { target: { value: '  New  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('New');
    expect(useUiStore.getState().editingId).toBeNull();
    // empty commit ignored
    act(() => useUiStore.getState().setEditing('c1'));
    rerender(<ReactFlowProvider><P id="c1" data={s().nodes[0].data} selected={false} /></ReactFlowProvider>);
    const i2 = container.querySelector('input')!;
    fireEvent.change(i2, { target: { value: '   ' } });
    fireEvent.keyDown(i2, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('New');
  });

  it('locked: double click does not edit; interface also edits', () => {
    mount({ compKind: 'component', locked: true });
    fireEvent.doubleClick(screen.getByTestId('component-c1'));
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('interface double click edits unless locked', () => {
    mount({ compKind: 'provided' });
    fireEvent.doubleClick(screen.getByTestId('component-c1'));
    expect(useUiStore.getState().editingId).toBe('c1');
  });
});
