import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMotion, usePrefersReducedMotion } from './useReducedMotion';

const orig = window.matchMedia;
afterEach(() => { window.matchMedia = orig; });

function fakeMq(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mq = {
    matches,
    addEventListener: vi.fn((_: string, f: () => void) => listeners.push(f)),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = (() => mq) as never;
  return { mq, fire: (m: boolean) => { mq.matches = m; listeners.forEach((l) => l()); } };
}

describe('usePrefersReducedMotion', () => {
  it('false by default', () => {
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
  it('follows the media query and changes', () => {
    const m = fakeMq(true);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    act(() => m.fire(false));
    expect(result.current).toBe(false);
    unmount();
    expect(m.mq.removeEventListener).toHaveBeenCalled();
  });
  it('tolerates a missing matchMedia', () => {
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
  it('tolerates a query list without add/removeEventListener', () => {
    window.matchMedia = (() => ({ matches: true })) as never;
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
    expect(() => unmount()).not.toThrow();
  });
  it('useMotion disables motion when reduced', () => {
    fakeMq(true);
    expect(renderHook(() => useMotion()).result.current.enabled).toBe(false);
    fakeMq(false);
    expect(renderHook(() => useMotion()).result.current.enabled).toBe(true);
  });
});
