import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiagramStore } from '../store/diagramStore';
import { createFrame } from '../lib/board/frames';

const fitBounds = vi.fn();
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => ({ fitBounds }) }));
import { useZoomToFrame } from './useZoomToFrame';

beforeEach(() => { fitBounds.mockClear(); useDiagramStore.getState().reset(); });

describe('useZoomToFrame', () => {
  it('zoomToRect uses defaults and overrides', () => {
    const { result } = renderHook(() => useZoomToFrame());
    const r = { x: 1, y: 2, width: 3, height: 4 };
    result.current.zoomToRect(r);
    expect(fitBounds).toHaveBeenLastCalledWith(r, { duration: 450, padding: 0.1 });
    result.current.zoomToRect(r, { duration: 5, padding: 0.5 });
    expect(fitBounds).toHaveBeenLastCalledWith(r, { duration: 5, padding: 0.5 });
  });
  it('zoomToFrame fits an existing frame, false when gone or not a frame', () => {
    useDiagramStore.getState().addNode(createFrame('f1', { x: 10, y: 20, width: 300, height: 200 }, 'F'));
    const { result } = renderHook(() => useZoomToFrame());
    expect(result.current.zoomToFrame('f1', { padding: 0.2 })).toBe(true);
    expect(fitBounds).toHaveBeenLastCalledWith({ x: 10, y: 20, width: 300, height: 200 }, { duration: 450, padding: 0.2 });
    fitBounds.mockClear();
    expect(result.current.zoomToFrame('nope')).toBe(false);
    expect(fitBounds).not.toHaveBeenCalled();
  });
});
