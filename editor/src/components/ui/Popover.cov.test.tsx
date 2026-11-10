import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';

const anchor = { x: 100, y: 50, width: 40, height: 20 };

describe('Popover', () => {
  it('renders nothing when closed or without anchor', () => {
    const { rerender } = render(<Popover open={false} anchor={anchor} onClose={() => {}} label="Pop">x</Popover>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Popover open anchor={null} onClose={() => {}} label="Pop">x</Popover>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('positions start-aligned under the anchor', () => {
    render(<Popover open anchor={anchor} onClose={() => {}} label="Pop">body</Popover>);
    const d = screen.getByRole('dialog', { name: 'Pop' });
    expect(d).toHaveTextContent('body');
    expect(d.style.left).toBe('100px');
    expect(d.style.top).toBe('76px');
    expect(d.style.transformOrigin).toBe('top left');
  });
  it('end-aligns from the right edge of the anchor', () => {
    render(<Popover open anchor={anchor} onClose={() => {}} label="Pop" align="end">b</Popover>);
    const d = screen.getByRole('dialog');
    expect(d.style.left).toBe('140px');
    expect(d.style.transformOrigin).toBe('top right');
  });
  it('clamps left to the viewport', () => {
    render(<Popover open anchor={{ ...anchor, x: 5000 }} onClose={() => {}} label="Pop">b</Popover>);
    expect(screen.getByRole('dialog').style.left).toBe(`${window.innerWidth - 240}px`);
  });
  it('closes on Escape and outside mousedown, not inside or other keys', () => {
    const onClose = vi.fn();
    render(<Popover open anchor={anchor} onClose={onClose} label="Pop"><button>in</button></Popover>);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'in' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('does not listen while closed', () => {
    const onClose = vi.fn();
    render(<Popover open={false} anchor={anchor} onClose={onClose} label="Pop">b</Popover>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
