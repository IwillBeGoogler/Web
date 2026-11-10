import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn(), fitView: vi.fn() }));
vi.mock('@xyflow/react', async (orig) => ({
  ...(await orig<typeof import('@xyflow/react')>()),
  useReactFlow: () => rf,
  useStore: (sel: (s: { transform: number[] }) => unknown) => sel({ transform: [0, 0, 1.5] }),
}));

import { ZoomBar } from './ZoomBar';
import { ZoomControls } from './ZoomControls';
import { useUiStore } from '../store/uiStore';

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.getState().resetUi();
});

describe('ZoomBar', () => {
  it('shows zoom percent and drives the viewport', () => {
    render(<ZoomBar />);
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('150%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(rf.zoomOut).toHaveBeenCalledWith({ duration: 120 });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(rf.zoomIn).toHaveBeenCalledWith({ duration: 120 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(rf.zoomTo).toHaveBeenCalledWith(1, { duration: 120 });
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }));
    expect(rf.fitView).toHaveBeenCalledWith(expect.objectContaining({ maxZoom: 1, duration: 200 }));
  });
  it('toggles grid, snap and minimap in the ui store', () => {
    render(<ZoomBar />);
    for (const name of ['Grid', 'Snap', 'Map']) {
      const btn = screen.getByRole('button', { name });
      const before = btn.getAttribute('aria-pressed');
      fireEvent.click(btn);
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).not.toBe(before);
    }
  });
});

describe('ZoomControls', () => {
  it('drives viewport and toggles', () => {
    render(<ZoomControls />);
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('150%');
    fireEvent.click(screen.getByRole('button', { name: /Zoom out/ }));
    expect(rf.zoomOut).toHaveBeenCalledWith({ duration: 160 });
    fireEvent.click(screen.getByRole('button', { name: /Zoom in/ }));
    expect(rf.zoomIn).toHaveBeenCalledWith({ duration: 160 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(rf.zoomTo).toHaveBeenCalledWith(1, { duration: 160 });
    fireEvent.click(screen.getByRole('button', { name: /Fit view/ }));
    expect(rf.fitView).toHaveBeenCalledWith(expect.objectContaining({ duration: 240 }));
    const grid = useUiStore.getState().showGrid;
    fireEvent.click(screen.getByRole('button', { name: /Toggle grid/ }));
    expect(useUiStore.getState().showGrid).toBe(!grid);
    const snap = useUiStore.getState().snap;
    fireEvent.click(screen.getByRole('button', { name: /Toggle snap/ }));
    expect(useUiStore.getState().snap).toBe(!snap);
  });
});
