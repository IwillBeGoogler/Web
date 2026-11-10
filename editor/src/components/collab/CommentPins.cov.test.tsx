import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({ setCenter: vi.fn(), getZoom: vi.fn(() => 0.5), screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({ x: p.x * 2.4, y: p.y * 2.4 })) }));
vi.mock('@xyflow/react', async (orig) => ({
  ...(await orig<typeof import('@xyflow/react')>()),
  ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => rf,
  useStore: (sel: (s: { transform: number[] }) => unknown) => sel({ transform: [0, 0, 2] }),
}));
import { useSession } from '../../api/session';
import type { ApiComment, CommentThread } from '../../api/types';
import { useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { useUiStore } from '../../store/uiStore';
import { useEditorSession } from '../../sync/status';
import { CommentCapture, CommentPins, CommentToolIcon } from './CommentPins';

const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f1', parentId: null, author: { id: 'u_ann', name: 'Ann' }, body: `text ${id}`, anchor: { type: 'point', x: 10, y: 20 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1, ...extra,
});
const th = (id: string, extra: Partial<ApiComment> = {}, replies: ApiComment[] = []): CommentThread => ({ root: c(id, extra), replies });
const node = (id: string, x: number, y: number) => ({ id, type: 'service', position: { x, y }, width: 100, height: 50, data: { label: id } }) as never;

beforeEach(() => {
  rf.setCenter.mockClear();
  useCommentsStore.getState().reset();
  useDiagramStore.getState().reset();
  useUiStore.getState().setTool('select');
  useSession.setState({ user: { id: 'me', email: 'm@x.y', name: 'Me', isAdmin: false } });
  useEditorSession.setState({ role: 'editor', source: 'server', readOnly: false });
  useToastStore.getState().clear();
});

describe('CommentPins', () => {
  it('renders nothing without a file', () => {
    const { container } = render(<CommentPins />);
    expect(container.innerHTML).toBe('');
  });
  it('pins: position, counter-scale, classes, label, reply count; skips unanchored / orphaned', () => {
    useDiagramStore.setState({ nodes: [node('n1', 100, 200)] });
    useCommentsStore.setState({
      fileId: 'f1', activeId: 'b',
      threads: [
        th('a', { resolved: true, body: 'x'.repeat(80) }, [c('r1'), c('r2')]),
        th('b', { author: { id: 'me', name: 'Me' }, anchor: { type: 'node', nodeId: 'n1', dx: 5, dy: 6 } }),
        th('c', { anchor: null }),
        th('d', { anchor: { type: 'node', nodeId: 'gone', dx: 0, dy: 0 } }),
      ],
    });
    render(<CommentPins />);
    const pins = screen.getAllByTestId('comment-pin');
    expect(pins).toHaveLength(2);
    expect(pins[0].className).toBe('comment-pin resolved');
    expect(pins[0].getAttribute('aria-label')).toBe(`Comment by Ann (resolved): ${'x'.repeat(60)}`);
    expect((pins[0] as HTMLElement).style.transform).toBe('translate(10px, 20px) scale(0.5)');
    expect(pins[0].querySelector('.comment-pin-count')!.textContent).toBe('3');
    expect(pins[1].className).toBe('comment-pin active mine');
    expect((pins[1] as HTMLElement).style.transform).toContain('translate(105px, 206px)');
    expect(pins[1].querySelector('.comment-pin-count')).toBeNull();
  });
  it('reply counter caps at 99', () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [th('a', {}, Array.from({ length: 120 }, (_, i) => c(`r${i}`)))] });
    render(<CommentPins />);
    expect(document.querySelector('.comment-pin-count')!.textContent).toBe('99');
  });
  it('clicking a pin activates it and opens the panel', () => {
    const setPanel = vi.fn(async () => undefined);
    useCommentsStore.setState({ fileId: 'f1', threads: [th('a')], setPanel } as never);
    render(<CommentPins />);
    fireEvent.click(screen.getByTestId('comment-pin'));
    expect(useCommentsStore.getState().activeId).toBe('a');
    expect(setPanel).toHaveBeenCalledWith(true);
  });
  it('reveal centres on the pin once, clearing reveal; unknown reveal waits', () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [th('a')], reveal: 'zz' });
    render(<CommentPins />);
    expect(rf.setCenter).not.toHaveBeenCalled();
    act(() => useCommentsStore.setState({ reveal: 'a' }));
    expect(rf.setCenter).toHaveBeenCalledWith(10, 20, { zoom: 0.8, duration: 250 });
    expect(useCommentsStore.getState().reveal).toBeNull();
  });
  it('draft composer: submit adds and opens panel; failure toasts and rethrows; cancel clears draft', async () => {
    const add = vi.fn(async () => undefined);
    const setPanel = vi.fn(async () => undefined);
    useCommentsStore.setState({ fileId: 'f1', threads: [], members: [], draft: { anchor: { type: 'point', x: 7, y: 9 } }, add, setPanel } as never);
    render(<CommentPins />);
    expect((document.querySelector('.comment-draft') as HTMLElement).style.transform).toContain('translate(7px, 9px)');
    const ta = screen.getByLabelText('Add a comment…');
    fireEvent.change(ta, { target: { value: 'hello', selectionStart: 5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith({ body: 'hello', anchor: { type: 'point', x: 7, y: 9 } }));
    await waitFor(() => expect(setPanel).toHaveBeenCalledWith(true));
    add.mockRejectedValueOnce(new Error('nope')).mockRejectedValueOnce('weird');
    fireEvent.change(ta, { target: { value: 'again', selectionStart: 5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('nope'));
    fireEvent.change(ta, { target: { value: 'again', selectionStart: 5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Could not add the comment'));
    const card = document.querySelector('.comment-draft') as HTMLElement;
    fireEvent.pointerDown(card);
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useCommentsStore.getState().draft).toBeNull();
  });
  it('signed-out viewer: no pin is mine and the draft pin uses the fallback colour', () => {
    useSession.setState({ user: null });
    useCommentsStore.setState({ fileId: 'f1', threads: [th('a')], draft: { anchor: { type: 'point', x: 1, y: 1 } } });
    render(<CommentPins />);
    expect(screen.getByTestId('comment-pin').className).not.toContain('mine');
    expect(document.querySelector('.draft-pin')).not.toBeNull();
  });
  it('draft anchored on a missing node falls back to the origin', () => {
    useCommentsStore.setState({ fileId: 'f1', threads: [], draft: { anchor: { type: 'node', nodeId: 'gone', dx: 1, dy: 1 } } });
    render(<CommentPins />);
    expect((document.querySelector('.comment-draft') as HTMLElement).style.transform).toContain('translate(0px, 0px)');
  });
});

describe('CommentCapture', () => {
  const ready = () => { useCommentsStore.setState({ fileId: 'f1' }); useUiStore.getState().setTool('comment'); };
  it('inert unless comment tool, file and role allow', () => {
    const { container, rerender } = render(<CommentCapture />);
    expect(container.innerHTML).toBe('');
    ready();
    useEditorSession.setState({ role: 'viewer' });
    rerender(<CommentCapture />);
    expect(screen.queryByTestId('comment-capture')).toBeNull();
    act(() => useEditorSession.setState({ role: 'commenter' }));
    expect(screen.getByTestId('comment-capture').getAttribute('title')).toBe('Click to place a comment · Esc to cancel');
  });
  it('click on free canvas drafts a point anchor and returns to select', () => {
    ready();
    document.elementsFromPoint = vi.fn(() => []);
    render(<CommentCapture />);
    fireEvent.click(screen.getByTestId('comment-capture'), { clientX: 10, clientY: 5 });
    expect(useCommentsStore.getState().draft!.anchor).toEqual({ type: 'point', x: 24, y: 12 });
    expect(useUiStore.getState().tool).toBe('select');
  });
  it('click over a node anchors to it, clamped inside the node', () => {
    ready();
    useDiagramStore.setState({ nodes: [node('n1', 0, 0)] });
    const el = document.createElement('div');
    el.className = 'react-flow__node';
    el.setAttribute('data-id', 'n1');
    document.elementsFromPoint = vi.fn(() => [document.body, el]);
    render(<CommentCapture />);
    fireEvent.click(screen.getByTestId('comment-capture'), { clientX: 30, clientY: 40 }); // flow (72, 96) -> dx 72, dy clamped 50
    expect(useCommentsStore.getState().draft!.anchor).toEqual({ type: 'node', nodeId: 'n1', dx: 72, dy: 50 });
  });
  it('unknown node id on the element falls back to a point', () => {
    ready();
    const el = document.createElement('div');
    el.className = 'react-flow__node';
    el.setAttribute('data-id', 'ghost');
    document.elementsFromPoint = vi.fn(() => [el]);
    render(<CommentCapture />);
    fireEvent.click(screen.getByTestId('comment-capture'), { clientX: 1, clientY: 1 });
    expect(useCommentsStore.getState().draft!.anchor.type).toBe('point');
  });
  it('exports the tool icon', () => { expect(CommentToolIcon).toBeTruthy(); });
});
