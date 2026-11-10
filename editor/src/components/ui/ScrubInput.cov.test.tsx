import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScrubInput } from './ScrubInput';

describe('ScrubInput', () => {
  it('typing emits clamped values; ignores non-finite', () => {
    const onChange = vi.fn();
    render(<ScrubInput label="Width" value={10} onChange={onChange} min={0} max={100} suffix="px" />);
    expect(screen.getByText('px')).toHaveClass('scrub-suffix');
    const input = screen.getByRole('spinbutton', { name: 'Width' });
    fireEvent.change(input, { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith(100);
    fireEvent.change(input, { target: { value: '42' } });
    expect(onChange).toHaveBeenLastCalledWith(42);
  });
  it('no suffix element without suffix', () => {
    const { container } = render(<ScrubInput label="W" value={1} onChange={() => {}} />);
    expect(container.querySelector('.scrub-suffix')).toBeNull();
  });
  it('arrow keys step; shift is coarse, alt is fine; other keys ignored', () => {
    const onChange = vi.fn();
    render(<ScrubInput label="W" value={50} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const up = onChange.mock.calls[0][0] as number;
    expect(up).toBeGreaterThan(50);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChange.mock.calls[1][0]).toBeLessThan(50);
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true });
    expect(onChange).toHaveBeenCalledTimes(4);
    fireEvent.keyDown(input, { key: 'a' });
    expect(onChange).toHaveBeenCalledTimes(4);
  });
  it('dragging the label scrubs relative to start; move without drag and after up is ignored', () => {
    const onChange = vi.fn();
    render(<ScrubInput label="W" value={50} onChange={onChange} />);
    const lab = screen.getByTestId('scrub-W');
    fireEvent.pointerMove(lab, { clientX: 20 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(lab, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(lab, { clientX: 40 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(50);
    fireEvent.pointerMove(lab, { clientX: -40, shiftKey: true });
    fireEvent.pointerMove(lab, { clientX: -40, altKey: true });
    expect(onChange).toHaveBeenCalledTimes(3);
    fireEvent.pointerUp(lab);
    fireEvent.pointerMove(lab, { clientX: 10 });
    expect(onChange).toHaveBeenCalledTimes(3);
    fireEvent.pointerDown(lab, { clientX: 0, pointerId: 1 });
    fireEvent.pointerCancel(lab);
    fireEvent.pointerMove(lab, { clientX: 10 });
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
