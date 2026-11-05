import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToastStore } from './toastStore';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clear();
});
afterEach(() => vi.useRealTimers());

describe('toast store', () => {
  it('pushes, auto-dismisses and stacks (max 4)', () => {
    toast.success('Saved');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    for (let i = 0; i < 6; i++) toast.info(`m${i}`);
    expect(useToastStore.getState().toasts).toHaveLength(4);
    expect(useToastStore.getState().toasts[3].message).toBe('m5');
  });
  it('errors stay longer and can be dismissed manually', () => {
    const id = useToastStore.getState().push('error', 'Boom', 6000);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
