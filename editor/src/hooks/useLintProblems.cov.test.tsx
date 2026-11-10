import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLintProblems } from './useLintProblems';
import { useDiagramStore } from '../store/diagramStore';

beforeEach(() => useDiagramStore.getState().reset());

describe('useLintProblems', () => {
  it('stays empty when disabled', async () => {
    const { result } = renderHook(() => useLintProblems(false, 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(result.current).toEqual([]);
  });
  it('loads lint lazily and returns an array of problems after the debounce', async () => {
    const { result } = renderHook(() => useLintProblems(true, 1));
    expect(result.current).toEqual([]);
    await waitFor(() => expect(Array.isArray(result.current)).toBe(true));
  });
  it('unmount before the debounce cancels the work', async () => {
    const { result, unmount } = renderHook(() => useLintProblems(true, 20));
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toEqual([]);
  });
  it('drops a result that resolves after unmount (alive=false)', async () => {
    const { unmount } = renderHook(() => useLintProblems(true, 0));
    await new Promise((r) => setTimeout(r, 0)); // timer fired, import pending
    unmount();
    await new Promise((r) => setTimeout(r, 30));
  });
});
