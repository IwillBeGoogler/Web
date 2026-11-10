import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const rf = {
  screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
  setCenter: vi.fn(),
  getZoom: vi.fn(() => 1) as undefined | (() => number),
};
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => rf }));
import { useClickAdd } from './useClickAdd';
import { resetClickAnchor } from '../lib/clickAdd';
import type { DiagramNode } from '../types';

const node = (id: string): DiagramNode => ({ id, type: 'service', position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id } }) as DiagramNode;

beforeEach(() => resetClickAnchor());
afterEach(() => { document.body.innerHTML = ''; });

describe('useClickAdd', () => {
  it('places nodes using the pane rect when .react-flow exists', () => {
    const pane = document.createElement('div');
    pane.className = 'react-flow';
    pane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(pane);
    const { result } = renderHook(() => useClickAdd());
    const out = result.current([node('a')]) as unknown as { nodes?: DiagramNode[] };
    expect(out).toBeTruthy();
    expect(rf.screenToFlowPosition).toHaveBeenCalled();
  });
  it('works without a pane element and without getZoom', () => {
    const prev = rf.getZoom;
    rf.getZoom = undefined;
    const { result } = renderHook(() => useClickAdd());
    expect(() => result.current([node('b')])).not.toThrow();
    rf.getZoom = prev;
  });
});
