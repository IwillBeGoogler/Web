import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({ setViewport: vi.fn(async () => true), screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({ x: p.x / 2, y: p.y / 2 })) }));
const L = vi.hoisted(() => ({ followLink: vi.fn(), linkAtPoint: vi.fn((): unknown => null) }));
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => rf }));
vi.mock('../../lib/design/actions', () => L);
import { useCollabStore } from '../../collab/store';
import { useBoardStore } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { Presentation } from './Presentation';

const frame = (id: string, label: string, order: number) => ({ id, type: 'frame', position: { x: order * 1000, y: 0 }, width: 400, height: 300, data: { label, order } }) as never;
const present = (p: Partial<{ index: number; laser: boolean; spotlight: boolean }> = {}) => act(() => useBoardStore.getState().set({ presenting: { index: 0, laser: false, spotlight: false, ...p } }));
const surface = () => screen.getByTestId('present-surface');
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = window) => fireEvent.keyDown(target, { key: k, ...init });
const idx = () => useBoardStore.getState().presenting?.index;
let session: { setPresence: ReturnType<typeof vi.fn>; setCursor: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.useFakeTimers();
  Object.values(rf).forEach((f) => f.mockClear());
  Object.values(L).forEach((f) => f.mockClear());
  L.linkAtPoint.mockReturnValue(null);
  session = { setPresence: vi.fn(), setCursor: vi.fn() };
  useCollabStore.setState({ session: null });
  useBoardStore.getState().reset();
  useDiagramStore.getState().reset();
  useUiStore.setState({ commandOpen: false });
  useDiagramStore.setState({ nodes: [frame('a', 'Intro', 1), frame('b', 'Middle', 2), frame('c', '', 3)] });
});
afterEach(() => { vi.useRealTimers(); document.querySelector('.app')?.remove(); });

describe('Presentation', () => {
  it('renders nothing unless presenting', () => {
    const { container } = render(<Presentation />);
    expect(container.innerHTML).toBe('');
    expect(rf.setViewport).not.toHaveBeenCalled();
  });
  it('shows counter + frame name, fits the frame (with 48px padding), marks the app, and tells the room', () => {
    const app = document.createElement('div');
    app.className = 'app';
    document.body.appendChild(app);
    useCollabStore.setState({ session: session as never });
    render(<Presentation />);
    present();
    expect(screen.getByRole('toolbar', { name: 'Presentation' }).querySelector('.present-count')!.textContent).toBe('1 / 3 · Intro');
    expect(app.classList.contains('presenting')).toBe(true);
    expect(rf.setViewport).toHaveBeenCalledTimes(1);
    expect(rf.setViewport.mock.calls[0][1]).toEqual({ duration: 450 });
    const pres = session.setPresence.mock.calls.find((c) => c[0].presenting)![0].presenting;
    expect(pres).toMatchObject({ frameId: 'a', index: 0, rect: { x: 952, y: -48, w: 496, h: 396 } });
    expect(screen.getByRole('button', { name: 'Previous frame' })).toBeDisabled();
    act(() => useBoardStore.getState().set({ presenting: null }));
    expect(app.classList.contains('presenting')).toBe(false);
  });
  it('requests fullscreen, exits it on cleanup, and leaving fullscreen ends the show', () => {
    const request = vi.fn(async () => undefined);
    const exit = vi.fn(async () => undefined);
    (document.documentElement as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
    render(<Presentation />);
    present();
    expect(request).toHaveBeenCalled();
    // fullscreen element present on cleanup -> exitFullscreen
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement });
    act(() => useBoardStore.getState().set({ presenting: null }));
    expect(exit).toHaveBeenCalled();
    // re-present: already fullscreen -> no request; leaving fullscreen stops
    request.mockClear();
    present();
    expect(request).not.toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    act(() => void document.dispatchEvent(new Event('fullscreenchange')));
    expect(useBoardStore.getState().presenting).toBeNull();
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
  });
  it('fullscreenchange while still fullscreen keeps the show running', () => {
    render(<Presentation />);
    present();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement });
    act(() => void document.dispatchEvent(new Event('fullscreenchange')));
    expect(useBoardStore.getState().presenting).not.toBeNull();
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
  });
  it('ends the show when no frames are left', () => {
    useDiagramStore.setState({ nodes: [] });
    render(<Presentation />);
    present();
    expect(useBoardStore.getState().presenting).toBeNull();
  });
  it('clamps an out-of-range index to the last frame', () => {
    render(<Presentation />);
    present({ index: 99 });
    expect(screen.getByRole('toolbar').querySelector('.present-count')!.textContent).toBe('3 / 3');
    expect(screen.getByRole('button', { name: 'Next frame' })).toBeDisabled();
  });
  it('uses the canvas area for the fit when it has a size', () => {
    const canvas = document.createElement('div');
    canvas.className = 'canvas';
    canvas.getBoundingClientRect = () => ({ width: 500, height: 400 }) as DOMRect;
    document.body.appendChild(canvas);
    render(<Presentation />);
    present();
    const t = (rf.setViewport.mock.calls[0] as unknown[])[0] as { zoom: number };
    expect(t.zoom).toBeCloseTo(Math.min(500 / 496, 400 / 396), 2);
    canvas.remove();
  });
  describe('keyboard', () => {
    beforeEach(() => { render(<Presentation />); present(); });
    it('arrows / space / PageDown step, Home / End jump, Backspace goes back', () => {
      key('ArrowRight'); expect(idx()).toBe(1);
      key(' '); expect(idx()).toBe(2);
      key('ArrowRight'); expect(idx()).toBe(2);
      key('Home'); expect(idx()).toBe(0);
      key('End'); expect(idx()).toBe(2);
      key('Backspace'); expect(idx()).toBe(1);
    });
    it('P toggles the laser, S the spotlight (mutually exclusive)', () => {
      key('p');
      expect(useBoardStore.getState().presenting).toMatchObject({ laser: true, spotlight: false });
      key('s');
      expect(useBoardStore.getState().presenting).toMatchObject({ laser: false, spotlight: true });
      key('p');
      expect(useBoardStore.getState().presenting).toMatchObject({ laser: true, spotlight: false });
    });
    it('Escape exits; unknown keys do nothing', () => {
      key('q');
      expect(useBoardStore.getState().presenting).not.toBeNull();
      key('Escape');
      expect(useBoardStore.getState().presenting).toBeNull();
    });
    it('keys are ignored with modifiers, in text fields and with the command palette open; Esc still works unless the palette is open', () => {
      key('ArrowRight', { metaKey: true }); key('ArrowRight', { ctrlKey: true }); key('ArrowRight', { altKey: true });
      expect(idx()).toBe(0);
      const input = document.createElement('input');
      document.body.appendChild(input);
      key('ArrowRight', {}, input);
      expect(idx()).toBe(0);
      input.remove();
      act(() => useUiStore.setState({ commandOpen: true }));
      key('ArrowRight');
      key('Escape');
      expect(useBoardStore.getState().presenting).not.toBeNull();
      act(() => useUiStore.setState({ commandOpen: false }));
      key('Escape', { metaKey: true });
      expect(useBoardStore.getState().presenting).toBeNull();
    });
    it('a key after the show ended is swallowed without effect', () => {
      act(() => useBoardStore.getState().set({ presenting: null }));
      key('ArrowRight');
      expect(useBoardStore.getState().presenting).toBeNull();
    });
  });
  describe('pointer', () => {
    it('click steps forward, right click steps back, toolbar clicks do not bubble', () => {
      render(<Presentation />);
      present();
      fireEvent.click(surface());
      expect(idx()).toBe(1);
      fireEvent.contextMenu(surface());
      expect(idx()).toBe(0);
      fireEvent.click(screen.getByRole('toolbar'));
      fireEvent.contextMenu(screen.getByRole('toolbar'));
      expect(idx()).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
      expect(idx()).toBe(1);
      fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
      expect(idx()).toBe(0);
    });
    it('clicking a link follows it; links into another file end the show first', () => {
      useDiagramStore.setState({ projectId: 'p1' } as never);
      render(<Presentation />);
      present();
      L.linkAtPoint.mockReturnValue({ fileId: 'p1' });
      fireEvent.click(surface());
      expect(L.followLink).toHaveBeenCalledWith({ fileId: 'p1' });
      expect(useBoardStore.getState().presenting).not.toBeNull();
      expect(idx()).toBe(0);
      L.linkAtPoint.mockReturnValue({ fileId: 'other' });
      fireEvent.click(surface());
      expect(useBoardStore.getState().presenting).toBeNull();
    });
    it('toolbar toggles laser / spotlight and exits', () => {
      render(<Presentation />);
      present();
      fireEvent.click(screen.getByRole('button', { name: 'Laser pointer' }));
      expect(screen.getByRole('button', { name: 'Laser pointer' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: 'Spotlight' }));
      expect(useBoardStore.getState().presenting).toMatchObject({ laser: false, spotlight: true });
      fireEvent.click(screen.getByRole('button', { name: 'Spotlight' }));
      expect(useBoardStore.getState().presenting).toMatchObject({ spotlight: false });
      fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
      expect(useBoardStore.getState().presenting).toBeNull();
    });
    it('toolbar fades after 2.5 s of no movement and wakes on move; the spotlight follows the pointer', () => {
      render(<Presentation />);
      present({ spotlight: true });
      expect(document.querySelector('.present-spotlight')).toBeNull();
      fireEvent.pointerMove(surface(), { clientX: 30, clientY: 40 });
      const sp = document.querySelector('.present-spotlight') as HTMLElement;
      expect(sp.style.getPropertyValue('--sx')).toBe('30px');
      act(() => void vi.advanceTimersByTime(2600));
      expect(screen.getByRole('toolbar').className).toContain('idle');
      fireEvent.pointerMove(surface(), { clientX: 31, clientY: 41 });
      expect(screen.getByRole('toolbar').className).not.toContain('idle');
    });
    it('laser draws a trail that fades out; pointer moves publish my cursor in a live session', () => {
      useCollabStore.setState({ session: session as never });
      render(<Presentation />);
      present({ laser: true });
      expect(session.setPresence).toHaveBeenCalledWith({ laser: true });
      for (let i = 0; i < 20; i++) fireEvent.pointerMove(surface(), { clientX: i, clientY: i });
      expect(document.querySelectorAll('.laser-dot:not(.head)').length).toBe(15);
      expect(document.querySelector('.laser-dot.head')).not.toBeNull();
      expect(session.setCursor).toHaveBeenLastCalledWith({ x: 9.5, y: 9.5 });
      act(() => void vi.advanceTimersByTime(1500));
      expect(document.querySelectorAll('.laser-dot:not(.head)').length).toBe(0);
      // turning the laser off clears everything and clears presence
      present({ laser: false });
      expect(document.querySelector('.laser-dot')).toBeNull();
      expect(session.setPresence).toHaveBeenLastCalledWith({ laser: undefined });
    });
  });
});
