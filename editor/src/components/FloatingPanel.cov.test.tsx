import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloatingPanel } from './FloatingPanel';

describe('FloatingPanel', () => {
  it('renders nothing when closed', () => {
    render(<FloatingPanel side="left" open={false} width={300}>hi</FloatingPanel>);
    expect(screen.queryByText('hi')).toBeNull();
  });
  it('renders children with side/class and no handle without onResize', () => {
    const { container } = render(<FloatingPanel side="right" open width={300} className="x">hi</FloatingPanel>);
    const p = container.querySelector('.panel')!;
    expect(p.className).toContain('panel-right');
    expect(p.className).toContain('x');
    expect(screen.queryByRole('separator')).toBeNull();
  });
  it('handle: keyboard and pointer resize', () => {
    const onResize = vi.fn();
    const { container } = render(<FloatingPanel side="left" open width={300.4} onResize={onResize}>hi</FloatingPanel>);
    expect(container.querySelector('.panel')!.className).not.toContain(' x');
    const h = screen.getByRole('separator');
    expect(h).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(h, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(300.4 - 16);
    fireEvent.keyDown(h, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(300.4 + 16);
    onResize.mockClear();
    fireEvent.keyDown(h, { key: 'a' });
    expect(onResize).not.toHaveBeenCalled();
    // move before down: no resize
    fireEvent.pointerMove(h, { clientX: 500 });
    expect(onResize).not.toHaveBeenCalled();
    (h as unknown as { setPointerCapture: () => void }).setPointerCapture = vi.fn();
    fireEvent.pointerDown(h, { clientX: 100, pointerId: 1 });
    expect(h.className).toContain('dragging');
    fireEvent.pointerMove(h, { clientX: 150 });
    expect(onResize).toHaveBeenCalledWith(300.4 + 50);
    fireEvent.pointerUp(h);
    expect(h.className).not.toContain('dragging');
  });
});
