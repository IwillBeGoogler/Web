import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInlineEdit, useRowReorder } from './rowHooks';

const ptr = (y: number) => ({ clientY: y, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as React.PointerEvent;
const move = (y: number) => act(() => { fireEvent(window, Object.assign(new Event('pointermove'), { clientY: y })); });
const up = () => act(() => { fireEvent(window, new Event('pointerup')); });

describe('useRowReorder', () => {
  it('drags down, marks classes, and fires onMove once on release', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useRowReorder({ count: 4, rowH: 20, zoom: 1, onMove }));
    const e = ptr(100);
    act(() => result.current.start(e, 'a', 0));
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(result.current.drag).toEqual({ id: 'a', from: 0, to: 0 });
    move(145);
    expect(result.current.drag?.to).toBe(2);
    expect(result.current.rowClass('a', 0)).toBe(' dragging');
    expect(result.current.rowClass('b', 2)).toBe(' drop-below');
    expect(result.current.rowClass('c', 3)).toBe('');
    up();
    expect(onMove).toHaveBeenCalledWith('a', 2);
    expect(result.current.drag).toBeNull();
    expect(result.current.rowClass('a', 0)).toBe('');
  });
  it('drops above when dragging up', () => {
    const { result } = renderHook(() => useRowReorder({ count: 4, rowH: 20, zoom: 1, onMove: vi.fn() }));
    act(() => result.current.start(ptr(100), 'c', 2));
    move(60);
    expect(result.current.rowClass('x', 0)).toBe(' drop-above');
    up();
  });
  it('does not call onMove when released on the origin', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useRowReorder({ count: 3, rowH: 20, zoom: 1, onMove }));
    act(() => result.current.start(ptr(10), 'a', 1));
    up();
    expect(onMove).not.toHaveBeenCalled();
  });
  it('ignores start when disabled', () => {
    const { result } = renderHook(() => useRowReorder({ count: 3, rowH: 20, zoom: 1, disabled: true, onMove: vi.fn() }));
    const e = ptr(0);
    act(() => result.current.start(e, 'a', 0));
    expect(result.current.drag).toBeNull();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe('useInlineEdit', () => {
  it('opens, matches and closes a cell', () => {
    const { result } = renderHook(() => useInlineEdit<'name' | 'type'>());
    expect(result.current.is('r', 'name')).toBe(false);
    act(() => result.current.open('r', 'name'));
    expect(result.current.is('r', 'name')).toBe(true);
    expect(result.current.is('r', 'type')).toBe(false);
    expect(result.current.is('q', 'name')).toBe(false);
    act(() => result.current.close());
    expect(result.current.cur).toBeNull();
  });
  it('is usable inside a component', () => {
    function C() { const e = useInlineEdit(); return <button onDoubleClick={() => e.open('a', 'f')}>{String(e.is('a', 'f'))}</button>; }
    const { getByRole } = render(<C />);
    fireEvent.doubleClick(getByRole('button'));
    expect(getByRole('button').textContent).toBe('true');
  });
});
