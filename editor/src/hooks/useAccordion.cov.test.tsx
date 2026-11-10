import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAccordion } from './useAccordion';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('useAccordion', () => {
  const ids = ['a', 'b', 'c'];
  it('toggles, persists, multi, expand/collapse', () => {
    const { result } = renderHook(() => useAccordion('k', ids));
    expect(result.current.state).toEqual({ open: [], multi: false });
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    expect(result.current.state.open).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem('k')!).open).toEqual(['b']);
    act(() => result.current.setMulti(true));
    act(() => result.current.toggle('a'));
    expect(result.current.state.open).toEqual(['b', 'a']);
    act(() => result.current.collapseAll());
    expect(result.current.state.open).toEqual([]);
    act(() => result.current.expandAll());
    expect(result.current.state).toEqual({ open: ids, multi: true });
  });
  it('restores saved state', () => {
    localStorage.setItem('k2', JSON.stringify({ open: ['c'], multi: false }));
    const { result } = renderHook(() => useAccordion('k2', ids));
    expect(result.current.state.open).toEqual(['c']);
  });
  it('survives a throwing localStorage: fallback / default, save ignored', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
    const a = renderHook(() => useAccordion('k', ids));
    expect(a.result.current.state).toEqual({ open: [], multi: false });
    const fb = { open: ['b'], multi: true };
    const b = renderHook(() => useAccordion('k', ids, fb));
    expect(b.result.current.state).toBe(fb);
  });
});
