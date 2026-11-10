import { act, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabStore } from '../../collab/store';
import type { Collaborator } from '../../collab/presenceMath';
import { cursor, emitRemoteReaction, sendReaction } from '../../lib/board/live';
import { ReactionLayer } from './ReactionLayer';

const mount = () => render(<ReactFlowProvider><ReactionLayer /></ReactFlowProvider>);
const emojis = () => Array.from(document.querySelectorAll('.reaction')).map((e) => e.textContent);
let canvas: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  useCollabStore.setState({ people: [] });
  cursor.at = null;
  canvas = document.createElement('div');
  canvas.className = 'canvas';
  document.body.appendChild(canvas);
});
afterEach(() => { canvas.remove(); vi.useRealTimers(); });

describe('ReactionLayer', () => {
  it('renders nothing with no reactions', () => {
    const { container } = mount();
    expect(container.querySelector('.reaction-layer')).toBeNull();
  });
  it('my reaction floats near the bottom-centre of the canvas without a pointer, then expires', () => {
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 1000, height: 700 }) as DOMRect;
    const { container } = mount();
    act(() => sendReaction('🎉'));
    expect(emojis()).toEqual(['🎉']);
    expect(container.querySelector('.reaction-layer')!.getAttribute('aria-hidden')).toBe('true');
    const el = container.querySelector('.reaction') as HTMLElement;
    expect(el.style.left).toBe('500px');
    expect(el.style.top).toBe('580px');
    act(() => void vi.advanceTimersByTime(2600));
    expect(emojis()).toEqual([]);
  });
  it('without a canvas element it falls back to 800x600', () => {
    canvas.remove();
    mount();
    act(() => sendReaction('🙂'));
    const el = document.querySelector('.reaction') as HTMLElement;
    expect(el.style.left).toBe('400px');
    expect(el.style.top).toBe('480px');
  });
  it('my reaction starts at the pointer and pointermove records the cursor', () => {
    mount();
    act(() => void fireEvent.pointerMove(canvas, { clientX: 50, clientY: 70 }));
    expect(cursor.at).not.toBeNull();
    act(() => sendReaction('👍'));
    const el = document.querySelector('.reaction') as HTMLElement;
    expect(el.style.left).toBe('50px');
    expect(el.style.top).toBe('70px');
  });
  it('remote reaction with a position spawns; without one is dropped', () => {
    mount();
    act(() => emitRemoteReaction('🔥', { x: 10, y: 20 }));
    expect(emojis()).toEqual(['🔥']);
  });
  it('detects fresh reactions from collaborators once per seq', () => {
    mount();
    const p = { clientId: 5, user: { name: 'Bo', color: '#000' }, status: 'active', tabs: 1, state: { user: { name: 'Bo', color: '#000' }, reaction: { emoji: '❤️', seq: Date.now(), at: { x: 1, y: 2 } } } } as unknown as Collaborator;
    act(() => useCollabStore.setState({ people: [p] }));
    expect(emojis()).toEqual(['❤️']);
    act(() => useCollabStore.setState({ people: [{ ...p }] }));
    expect(emojis()).toEqual(['❤️']);
  });
  it('caps floating items at 31', () => {
    mount();
    act(() => { for (let i = 0; i < 40; i++) sendReaction('x'); });
    expect(emojis().length).toBe(31);
  });
});
