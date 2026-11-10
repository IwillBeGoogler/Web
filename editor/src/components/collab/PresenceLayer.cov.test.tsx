import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({
  setViewport: vi.fn(async () => true),
  screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({ x: p.x + 1, y: p.y + 1 })),
  vp: { transform: [0, 0, 2] as number[], width: 800, height: 600 },
}));
vi.mock('@xyflow/react', async (orig) => ({
  ...(await orig<typeof import('@xyflow/react')>()),
  ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ setViewport: rf.setViewport, screenToFlowPosition: rf.screenToFlowPosition }),
  useStore: (sel: (s: typeof rf.vp) => unknown) => sel(rf.vp),
}));
import { useCollabStore } from '../../collab/store';
import type { Collaborator, RemoteState } from '../../collab/presenceMath';
import { useDiagramStore } from '../../store/diagramStore';
import { FollowBanner, MinimapPeers, PresenceLayer, PresencePublisher } from './PresenceLayer';

const person = (clientId: number, name: string, extra: Partial<RemoteState> = {}): Collaborator => {
  const state: RemoteState = { user: { name, color: '#123456' }, ...extra };
  return { clientId, user: state.user, status: 'active', state, tabs: 1 } as Collaborator;
};
const node = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, type: 'service', position: { x, y }, width: 100, height: 50, data: {}, ...extra }) as never;
const setPeople = (people: Collaborator[]) => act(() => void useCollabStore.setState({ people }));

let rafCbs: FrameRequestCallback[] = [];
beforeEach(() => {
  rf.vp.transform = [0, 0, 2];
  rf.vp.width = 800;
  rf.vp.height = 600;
  rf.setViewport.mockClear();
  useCollabStore.setState({ people: [], session: null, follow: { following: null } });
  useDiagramStore.getState().reset();
  rafCbs = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCbs.push(cb); return rafCbs.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('PresenceLayer', () => {
  it('renders nothing alone', () => {
    const { container } = render(<PresenceLayer />);
    expect(container.innerHTML).toBe('');
  });
  it('draws cursors (speaking / laser classes) and selection outlines with names; skips missing nodes', () => {
    useDiagramStore.setState({ nodes: [node('a', 10, 20)] });
    render(<PresenceLayer />);
    setPeople([
      person(1, 'Ann', { cursor: { x: 5, y: 6 }, audio: { in: true, muted: false, speaking: true }, selection: { nodes: ['a', 'gone'], edges: [] } }),
      person(2, 'Bob', { cursor: { x: 1, y: 2 }, laser: true }),
      person(3, 'Cy'),
    ]);
    const ann = screen.getByTestId('remote-cursor-Ann');
    expect(ann.className).toBe('remote-cursor speaking');
    expect(ann.style.transform).toBe('translate(5px, 6px) scale(0.5)');
    expect(screen.getByTestId('remote-cursor-Bob').className).toBe('remote-cursor laser');
    expect(screen.queryByTestId('remote-cursor-Cy')).toBeNull();
    const sel = screen.getAllByTestId('remote-selection');
    expect(sel).toHaveLength(1);
    expect(sel[0].style.left).toBe('10px');
    expect(sel[0].style.width).toBe('100px');
    expect(sel[0].textContent).toBe('Ann');
  });
  it('animation loop smooths cursors, hides those without a target, and cleans up', () => {
    const { unmount } = render(<PresenceLayer />);
    setPeople([person(1, 'Ann', { cursor: { x: 0, y: 0 } })]);
    const el = screen.getByTestId('remote-cursor-Ann');
    act(() => { rafCbs.shift()!(performance.now() + 16); });
    expect(el.style.opacity).toBe('1');
    // target moves: the loop eases towards it
    setPeople([person(1, 'Ann', { cursor: { x: 100, y: 0 } })]);
    act(() => { rafCbs.shift()!(performance.now() + 1000); });
    expect(el.style.transform).toMatch(/^translate\(/);
    // cursor disappears
    setPeople([person(1, 'Ann', { cursor: null }), person(2, 'Bob', { cursor: { x: 1, y: 1 } })]);
    act(() => { rafCbs.shift()!(performance.now() + 2000); });
    expect(el.isConnected).toBe(false);
    // person leaves: smoothing state dropped
    setPeople([person(2, 'Bob', { cursor: { x: 1, y: 1 } })]);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('PresencePublisher', () => {
  const session = () => ({ setCursor: vi.fn(), touch: vi.fn(), setViewport: vi.fn() });
  let canvas: HTMLElement;
  beforeEach(() => { canvas = document.createElement('div'); canvas.className = 'canvas'; document.body.appendChild(canvas); });
  afterEach(() => canvas.remove());

  it('publishes cursor (rAF-coalesced), leave, and activity', () => {
    const s = session();
    useCollabStore.setState({ session: s as never });
    const { unmount } = render(<PresencePublisher />);
    fireEvent.pointerMove(canvas, { clientX: 3, clientY: 4 });
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 6 });
    expect(rafCbs).toHaveLength(1);
    act(() => { rafCbs.shift()!(0); });
    expect(s.setCursor).toHaveBeenCalledTimes(1);
    expect(s.setCursor).toHaveBeenCalledWith({ x: 6, y: 7 });
    fireEvent.pointerLeave(canvas);
    expect(s.setCursor).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.pointerDown(window);
    expect(s.touch).toHaveBeenCalledTimes(2);
    fireEvent.pointerMove(canvas, { clientX: 1, clientY: 1 }); // pending raf at unmount
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
  it('publishes the viewport rectangle only when it changed; skips without size', () => {
    const s = session();
    useCollabStore.setState({ session: s as never });
    const { rerender } = render(<PresencePublisher />);
    expect(s.setViewport).toHaveBeenCalledWith({ x: -0, y: -0, w: 400, h: 300 });
    rerender(<PresencePublisher />);
    expect(s.setViewport).toHaveBeenCalledTimes(1);
    rf.vp.transform = [-200, -100, 2];
    rerender(<PresencePublisher />);
    expect(s.setViewport).toHaveBeenLastCalledWith({ x: 100, y: 50, w: 400, h: 300 });
    rf.vp.width = 0;
    rf.vp.transform = [0, 0, 1];
    rerender(<PresencePublisher />);
    expect(s.setViewport).toHaveBeenCalledTimes(2);
  });
  it('a new session object with the same rectangle does not republish it', () => {
    const s1 = session(), s2 = session();
    useCollabStore.setState({ session: s1 as never });
    render(<PresencePublisher />);
    act(() => useCollabStore.setState({ session: s2 as never }));
    expect(s1.setViewport).toHaveBeenCalledTimes(1);
    expect(s2.setViewport).not.toHaveBeenCalled();
  });
  it('follow: unchanged viewport of a re-announced person does not re-move the view', () => {
    const vp = { x: 0, y: 0, w: 400, h: 300 };
    useCollabStore.setState({ people: [person(7, 'Ann', { viewport: vp })], follow: { following: 7 } });
    render(<PresencePublisher />);
    act(() => useCollabStore.setState({ people: [person(7, 'Ann', { viewport: { ...vp }, cursor: { x: 1, y: 1 } })] }));
    expect(rf.setViewport).toHaveBeenCalledTimes(1);
    act(() => useCollabStore.setState({ people: [person(7, 'Ann', { viewport: { x: 5, y: 5, w: 400, h: 300 } })] }));
    expect(rf.setViewport).toHaveBeenCalledTimes(2);
  });
  it('does nothing without a session', () => {
    render(<PresencePublisher />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(rf.setViewport).not.toHaveBeenCalled();
  });
  it('follow: moves the view to the followed viewport once, resets on stop, Escape ends following', () => {
    const vp = { x: 0, y: 0, w: 400, h: 300 };
    useCollabStore.setState({ people: [person(7, 'Ann', { viewport: vp })], follow: { following: 7 } });
    const { rerender } = render(<PresencePublisher />);
    expect(rf.setViewport).toHaveBeenCalledTimes(1);
    expect(rf.setViewport.mock.calls[0][1]).toEqual({ duration: 120 });
    rerender(<PresencePublisher />);
    expect(rf.setViewport).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'x' });
    expect(useCollabStore.getState().follow.following).toBe(7);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useCollabStore.getState().follow.following).toBeNull();
    // following again the same viewport works after the reset
    act(() => useCollabStore.setState({ follow: { following: 7 } }));
    expect(rf.setViewport).toHaveBeenCalledTimes(2);
  });
  it('follow: target without viewport or unknown / no size does nothing', () => {
    useCollabStore.setState({ people: [person(7, 'Ann')], follow: { following: 7 } });
    const { rerender } = render(<PresencePublisher />);
    expect(rf.setViewport).not.toHaveBeenCalled();
    useCollabStore.setState({ follow: { following: 99 } });
    rerender(<PresencePublisher />);
    rf.vp.width = 0;
    useCollabStore.setState({ people: [person(7, 'Ann', { viewport: { x: 0, y: 0, w: 1, h: 1 } })], follow: { following: 7 } });
    rerender(<PresencePublisher />);
    expect(rf.setViewport).not.toHaveBeenCalled();
  });
});

describe('FollowBanner', () => {
  it('shows the followed person and Stop ends it', () => {
    useCollabStore.setState({ people: [person(7, 'Ann')], follow: { following: 7 } });
    render(<FollowBanner />);
    expect(screen.getByTestId('follow-banner').textContent).toContain('Following Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(useCollabStore.getState().follow.following).toBeNull();
  });
  it('hidden when not following or person gone', () => {
    const { container } = render(<FollowBanner />);
    expect(container.innerHTML).toBe('');
    act(() => useCollabStore.setState({ follow: { following: 5 } }));
    expect(container.innerHTML).toBe('');
  });
});

describe('MinimapPeers', () => {
  const props = { width: 200, height: 100, left: 4, bottom: 8 };
  it('hidden without viewports or without a measured canvas', () => {
    const { container, rerender } = render(<MinimapPeers {...props} />);
    expect(container.innerHTML).toBe('');
    useCollabStore.setState({ people: [person(1, 'A', { viewport: { x: 0, y: 0, w: 10, h: 10 } })] });
    rf.vp.width = 0;
    rerender(<MinimapPeers {...props} />);
    expect(container.innerHTML).toBe('');
  });
  it('draws a rect per peer viewport in the minimap viewBox; with nodes the bounds grow', () => {
    useCollabStore.setState({ people: [person(1, 'A', { viewport: { x: 1, y: 2, w: 30, h: 40 } }), person(2, 'B')] });
    const { rerender } = render(<MinimapPeers {...props} />);
    const svg = screen.getByTestId('minimap-peers');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    expect(svg.style.left).toBe('4px');
    const viewBoxView = svg.getAttribute('viewBox');
    act(() => useDiagramStore.setState({ nodes: [node('a', 2000, 1500, { measured: { width: 100, height: 50 } }), node('h', 0, 0, { hidden: true }), node('u', 9, 9, { width: undefined })] }));
    rerender(<MinimapPeers {...props} />);
    expect(screen.getByTestId('minimap-peers').getAttribute('viewBox')).not.toBe(viewBoxView);
    const [, , w] = screen.getByTestId('minimap-peers').getAttribute('viewBox')!.split(' ').map(Number);
    expect(w).toBeGreaterThan(2000);
  });
});
