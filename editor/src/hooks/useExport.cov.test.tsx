import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiagramStore } from '../store/diagramStore';

const exportPage = vi.fn(async () => undefined);
const getNodes = vi.fn(() => [{ id: 'n' }]);
vi.mock('../lib/exportImage', () => ({ exportPage: (...a: unknown[]) => (exportPage as (...x: unknown[]) => unknown)(...a) }));
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => ({ getNodes }) }));
import { useExport } from './useExport';

beforeEach(() => { exportPage.mockClear(); useDiagramStore.getState().reset(); });

describe('useExport', () => {
  it('passes kind, nodes, merged settings and a project-page title', () => {
    useDiagramStore.setState({ projectName: 'Proj' });
    const { result } = renderHook(() => useExport());
    void result.current('png', { scale: 7 } as never);
    const [kind, nodes, opts, , title] = exportPage.mock.calls[0] as unknown as [string, unknown, { scale: number }, string, string];
    expect(kind).toBe('png');
    expect(nodes).toEqual([{ id: 'n' }]);
    expect(opts.scale).toBe(7);
    const pageName = useDiagramStore.getState().pages.find((p) => p.id === useDiagramStore.getState().activePageId)?.name;
    expect(title).toBe(`Proj-${pageName}`);
  });
  it('title falls back to "page" when the active page is missing', () => {
    useDiagramStore.setState({ projectName: 'P', activePageId: 'ghost' });
    const { result } = renderHook(() => useExport());
    void result.current('svg');
    expect((exportPage.mock.calls[0] as unknown as unknown[])[4]).toBe('P-page');
  });
});
