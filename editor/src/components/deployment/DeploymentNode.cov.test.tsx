import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';

const s = () => useDiagramStore.getState();

import { DeploymentNode } from './DeploymentNode';

function mount(data: Record<string, unknown>, props: Record<string, unknown> = {}) {
  const node = { id: 'd1', type: 'deployment', position: { x: 0, y: 0 }, data: { label: 'Srv', accent: '#abc', ...data } } as unknown as DiagramNode;
  act(() => { s().reset(); s().addNode(node); });
  const P = DeploymentNode as unknown as (p: unknown) => JSX.Element;
  const ui = (d: unknown) => <ReactFlowProvider><P id="d1" data={d} selected={false} {...props} /></ReactFlowProvider>;
  const r = render(ui(node.data));
  return { ...r, again: () => r.rerender(ui(s().nodes[0].data)) };
}

describe('DeploymentNode', () => {
  beforeEach(() => { useUiStore.getState().resetUi(); });

  it.each([
    ['device', '«device»'],
    ['executionEnvironment', '«execution environment»'],
    ['artifact', '«artifact»'],
    ['component', '«component»'],
  ])('%s kind shows default stereotype', (k, st) => {
    const { container } = mount({ depKind: k });
    expect(container.querySelector('.dp-stereo')!.textContent).toBe(st);
    expect(container.querySelector('.dp-name')!.textContent).toBe('Srv');
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(4);
  });

  it('box kinds: 3D sides, device line, exec env rounded, container class', () => {
    const dev = mount({ depKind: 'device', container: true }, { selected: true, width: 200, height: 120 });
    expect(dev.container.querySelectorAll('polygon.dp-side').length).toBe(2);
    expect(dev.container.querySelector('path.dp-line')).toBeTruthy();
    expect(dev.container.querySelector('.dp-text')!.className).toContain('box');
    expect(dev.container.querySelector('.dp-text')!.className).toContain('container');
    expect(screen.getByTestId('deployment-d1').className).toContain('selected');
    dev.unmount();
    const ee = mount({ depKind: 'executionEnvironment' });
    expect(ee.container.querySelector('rect.dp-shape')!.getAttribute('rx')).toBe('10');
    expect(ee.container.querySelector('path.dp-line')).toBeNull();
    ee.unmount();
    const n = mount({ depKind: 'node' });
    expect(n.container.querySelector('rect.dp-shape')!.getAttribute('rx')).toBe('2');
  });

  it('custom stereotype, no stereotype for unknown kind, icon', () => {
    const a = mount({ depKind: 'node', stereotype: 'vm', iconId: 'server' });
    expect(a.container.querySelector('.dp-stereo')!.textContent).toBe('«vm»');
    expect(a.container.querySelector('.dp-icon')).toBeTruthy();
    a.unmount();
    const b = mount({ depKind: 'node' });
    expect(b.container.querySelector('.dp-stereo')).toBeNull();
    expect(b.container.querySelector('.dp-icon')).toBeNull();
  });

  it('double click edits and commits; locked blocks', () => {
    const m = mount({ depKind: 'node' });
    fireEvent.doubleClick(screen.getByTestId('deployment-d1'));
    expect(useUiStore.getState().editingId).toBe('d1');
    m.again();
    const input = m.container.querySelector('input')!;
    fireEvent.change(input, { target: { value: ' DB ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('DB');
    act(() => useUiStore.getState().setEditing('d1'));
    m.again();
    const i2 = m.container.querySelector('input')!;
    fireEvent.change(i2, { target: { value: ' ' } });
    fireEvent.keyDown(i2, { key: 'Enter' });
    expect((s().nodes[0].data as { label: string }).label).toBe('DB');
    m.unmount();
    mount({ depKind: 'node', locked: true });
    act(() => useUiStore.getState().setEditing(null));
    fireEvent.doubleClick(screen.getByTestId('deployment-d1'));
    expect(useUiStore.getState().editingId).toBeNull();
  });
});
