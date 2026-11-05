import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openComment, useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';

const setCenter = vi.fn();
vi.mock('@xyflow/react', async (orig) => ({
  ...(await orig<typeof import('@xyflow/react')>()),
  useReactFlow: () => ({ setCenter, getZoom: () => 0.5, screenToFlowPosition: (p: unknown) => p }),
  useStore: (sel: (s: { transform: number[] }) => unknown) => sel({ transform: [0, 0, 1] }),
  ViewportPortal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const { CommentPins } = await import('./CommentPins');

const root = (id: string, anchor: unknown) => ({
  id, fileId: 'f1', parentId: null, author: { id: 'u1', name: 'Ann' }, body: id, anchor, resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1,
});

beforeEach(() => {
  setCenter.mockClear();
  useCommentsStore.getState().reset();
  useDiagramStore.getState().reset();
});

describe('opening a comment from a link pans the canvas to its anchor', () => {
  it('a point anchor: centres on it, zoomed in to at least 0.8, once', () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [{ root: root('c1', { type: 'point', x: 120, y: 340 }) as never, replies: [] }] });
    const { rerender } = render(<CommentPins />);
    expect(setCenter).not.toHaveBeenCalled();
    openComment('f1', 'c1');
    rerender(<CommentPins />);
    expect(setCenter).toHaveBeenCalledTimes(1);
    expect(setCenter).toHaveBeenCalledWith(120, 340, expect.objectContaining({ zoom: 0.8 }));
    expect(useCommentsStore.getState().reveal).toBeNull();
    expect(useCommentsStore.getState().activeId).toBe('c1');
  });

  it('a thread whose node is not there yet waits, then pans when the node exists', () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [{ root: root('c2', { type: 'node', nodeId: 'n1', dx: 0, dy: 0 }) as never, replies: [] }] });
    render(<CommentPins />);
    openComment('f1', 'c2');
    expect(setCenter).not.toHaveBeenCalled();
    expect(useCommentsStore.getState().reveal).toBe('c2');
  });
});
