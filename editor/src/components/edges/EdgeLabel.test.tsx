import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EdgeLabelChip } from './EdgeLabelChip';
import { isTypingTarget, keyToCommand } from '../../lib/keymap';

const base = { x: 120, y: 80, color: '#0f7b6c', background: true, onCommit: () => undefined };

describe('edge label chip', () => {
  it('shows the text at the anchor with the edge colour; chip background on by default, transparent when off', () => {
    const { rerender } = render(<EdgeLabelChip {...base} text="remote_write" />);
    const chip = screen.getByTestId('edge-label');
    expect(chip).toHaveTextContent('remote_write');
    expect(chip.style.color).toBe('rgb(15, 123, 108)');
    expect(chip.style.transform).toContain('120px, 80px');
    expect(chip.className).toContain('with-bg');
    rerender(<EdgeLabelChip {...base} background={false} text="remote_write" />);
    expect(screen.getByTestId('edge-label').className).not.toContain('with-bg');
  });
  it('renders nothing for empty text; re-renders with fresh text (never stale after an edit)', () => {
    const { rerender } = render(<EdgeLabelChip {...base} text="Metrics" />);
    rerender(<EdgeLabelChip {...base} text="Traces" />);
    expect(screen.getByTestId('edge-label')).toHaveTextContent('Traces');
    rerender(<EdgeLabelChip {...base} text="" />);
    expect(screen.queryByTestId('edge-label')).toBeNull();
  });
  it('position follows the anchor when nodes move', () => {
    const { rerender } = render(<EdgeLabelChip {...base} text="x" />);
    rerender(<EdgeLabelChip {...base} x={300} y={40} text="x" />);
    expect(screen.getByTestId('edge-label').style.transform).toContain('300px, 40px');
  });
  it('double-click edits inline; Enter commits', () => {
    const onCommit = vi.fn();
    render(<EdgeLabelChip {...base} text="Metrics" onCommit={onCommit} />);
    fireEvent.doubleClick(screen.getByTestId('edge-label'));
    const input = screen.getByLabelText('Edge label') as HTMLInputElement;
    expect(input.value).toBe('Metrics');
    fireEvent.change(input, { target: { value: 'Metrics v2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Metrics v2');
    expect(screen.queryByLabelText('Edge label')).toBeNull();
  });
  it('blur commits; Escape cancels without committing', () => {
    const onCommit = vi.fn();
    render(<EdgeLabelChip {...base} text="Logs" onCommit={onCommit} />);
    fireEvent.doubleClick(screen.getByTestId('edge-label'));
    let input = screen.getByLabelText('Edge label');
    fireEvent.change(input, { target: { value: 'Logs2' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Logs2');
    onCommit.mockClear();
    fireEvent.doubleClick(screen.getByTestId('edge-label'));
    input = screen.getByLabelText('Edge label');
    fireEvent.change(input, { target: { value: 'discard me' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('edge-label')).toHaveTextContent('Logs');
  });
  it('unchanged text is not committed', () => {
    const onCommit = vi.fn();
    render(<EdgeLabelChip {...base} text="Same" onCommit={onCommit} />);
    fireEvent.doubleClick(screen.getByTestId('edge-label'));
    fireEvent.keyDown(screen.getByLabelText('Edge label'), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('can be put into editing programmatically (F2 / context menu)', () => {
    render(<EdgeLabelChip {...base} text="Alerts" editing />);
    expect(screen.getByLabelText('Edge label')).toBeInTheDocument();
  });
  it('typing Delete / Backspace in the editor never reaches the global shortcuts (the edge is not deleted)', () => {
    const globalKey = vi.fn();
    window.addEventListener('keydown', globalKey);
    render(<EdgeLabelChip {...base} text="Alerts" editing />);
    const input = screen.getByLabelText('Edge label');
    fireEvent.keyDown(input, { key: 'Backspace' });
    fireEvent.keyDown(input, { key: 'Delete' });
    expect(globalKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', globalKey);
    expect(isTypingTarget(input)).toBe(true);
    expect(keyToCommand({ key: 'Backspace', code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toEqual({ type: 'action', action: 'delete' });
  });
  it('long labels use the wrapping chip class (max 3 lines, ~180px) and keep the full text', () => {
    const long = 'Replicates every topic from the primary datacenter to the disaster recovery site asynchronously';
    render(<EdgeLabelChip {...base} text={long} />);
    const chip = screen.getByTestId('edge-label');
    expect(chip).toHaveTextContent(long);
    expect(chip.className).toContain('edge-label'); // CSS: max-width 180px, -webkit-line-clamp 3, text-align center
  });
  it('dragging the chip reports pointer positions (parent maps them to a position along the path)', () => {
    const onDragStart = vi.fn();
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();
    render(<EdgeLabelChip {...base} text="Traces" onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd} />);
    const chip = screen.getByTestId('edge-label');
    fireEvent.pointerDown(chip, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(chip, { pointerId: 1, clientX: 60, clientY: 40 });
    fireEvent.pointerUp(chip, { pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDrag).toHaveBeenCalledWith(60, 40);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
  it('locked edges cannot be edited or dragged', () => {
    const onDragStart = vi.fn();
    render(<EdgeLabelChip {...base} text="Locked" locked onDrag={vi.fn()} onDragStart={onDragStart} />);
    fireEvent.doubleClick(screen.getByTestId('edge-label'));
    expect(screen.queryByLabelText('Edge label')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('edge-label'));
    expect(onDragStart).not.toHaveBeenCalled();
  });
});
