import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { blankClass } from '../../lib/uml/geometry';
import { CrossLinkBadge, CrossLinkInspector } from './CrossLinks';
import type { DiagramNode } from '../../types';

const s = () => useDiagramStore.getState();
const icon = (id: string, label: string) => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label, iconId: 'service' } }) as unknown as DiagramNode;
beforeEach(() => {
  s().reset();
  useToastStore.getState().clear();
  act(() => { s().addNode(icon('svc', 'Orders service')); s().addNode(blankClass('c1', { x: 300, y: 0 }, 'class', 'Order')); });
});
const cls = () => s().nodes.find((n) => n.id === 'c1')!;

describe('cross-link UI', () => {
  it('inspector picker stores the ref; badge shows the target; clearing removes it', () => {
    const { rerender } = render(<CrossLinkInspector node={cls()} />);
    fireEvent.change(screen.getByLabelText('Architecture node'), { target: { value: '0' } });
    expect(cls().data.archRef).toEqual({ nodeId: 'svc' });
    rerender(<CrossLinkBadge id="c1" data={cls().data} />);
    expect(screen.getByTestId('xlink-badge-c1').textContent).toContain('Orders service');
    rerender(<CrossLinkInspector node={cls()} />);
    fireEvent.click(screen.getByText('Clear link'));
    expect(cls().data.archRef).toBeUndefined();
  });
  it('architecture node inspector lists what links to it', () => {
    act(() => s().updateNodeData('c1', { archRef: { nodeId: 'svc' } }));
    render(<CrossLinkInspector node={s().nodes.find((n) => n.id === 'svc')!} />);
    expect(screen.getByTestId('xlink-backlinks').textContent).toContain('Order');
  });
  it('a dangling ref shows as broken and does not crash; click toasts', () => {
    act(() => s().updateNodeData('c1', { archRef: { nodeId: 'deleted' } }));
    render(<><CrossLinkBadge id="c1" data={cls().data} /><CrossLinkInspector node={cls()} /></>);
    const b = screen.getByTestId('xlink-badge-c1');
    expect(b.className).toContain('broken');
    expect(screen.getByRole('alert').textContent).toMatch(/Broken link/);
    fireEvent.click(b);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/Broken link/);
  });
  it('badge click selects the target on the same page', () => {
    act(() => s().updateNodeData('c1', { archRef: { nodeId: 'svc' } }));
    render(<CrossLinkBadge id="c1" data={cls().data} />);
    fireEvent.click(screen.getByTestId('xlink-badge-c1'));
    return new Promise<void>((r) => setTimeout(() => { expect(s().nodes.find((n) => n.selected)?.id).toBe('svc'); r(); }, 80));
  });
});
