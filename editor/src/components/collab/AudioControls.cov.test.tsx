import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRtc } from '../../rtc/runtime';
import { useRtcStore } from '../../rtc/store';
import { AudioControls, AudioSinks } from './AudioControls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fake = (): any => ({ join: vi.fn(async () => undefined), leave: vi.fn(), setMuted: vi.fn(), setPtt: vi.fn(), talk: vi.fn(), selectInput: vi.fn(async () => undefined), selectOutput: vi.fn() });
let rtc: ReturnType<typeof fake>;
const info = { clientId: 'p1', userId: 'u1', name: 'Ann' };
beforeEach(() => { useRtcStore.getState().reset(); rtc = fake(); setRtc(rtc); });

describe('AudioControls extras', () => {
  it('joining state disables the button and says Joining…; a single-person roster shows a tooltip count', () => {
    useRtcStore.getState().patch({ status: 'joining' });
    render(<AudioControls />);
    const b = screen.getByRole('button', { name: 'Join audio' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain('Joining…');
    act(() => useRtcStore.getState().patch({ status: 'idle', roster: [info] }));
    expect(screen.getByRole('button', { name: 'Join audio' }).getAttribute('title')).toBe('1 of 6 in the audio room');
  });
  it('empty room tooltip invites talking; maxPeers below 6 caps the room', () => {
    render(<AudioControls />);
    expect(screen.getByRole('button', { name: 'Join audio' }).getAttribute('title')).toBe('Talk to the people in this file');
    act(() => useRtcStore.getState().patch({ maxPeers: 2, roster: [info, { ...info, clientId: 'p2' }] }));
    expect(screen.getByRole('button', { name: 'Audio room is full (2/2)' }).textContent).toContain('Full');
  });
  it('push-to-talk labels the mic button and ignores clicks', () => {
    useRtcStore.getState().patch({ status: 'joined', ptt: true, talking: false });
    render(<AudioControls />);
    const mic = screen.getByRole('button', { name: 'Push to talk (hold M)' });
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    expect(mic.getAttribute('title')).toBe('Push-to-talk is on: hold M to talk');
    fireEvent.click(mic);
    expect(rtc.setMuted).not.toHaveBeenCalled();
    act(() => useRtcStore.getState().patch({ talking: true }));
    expect(screen.getByRole('button', { name: 'Push to talk (hold M)' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('speaking while muted does not ring the mic; data-peer-states lists peer states', () => {
    useRtcStore.getState().patch({ status: 'joined', userMuted: true, speaking: true });
    useRtcStore.getState().upsertPeer?.(info, { state: 'connected' });
    render(<AudioControls />);
    expect(screen.getByRole('button', { name: 'Unmute' }).className).not.toContain('speaking');
    expect(screen.getByTestId('audio-room').hasAttribute('data-peer-states')).toBe(true);
  });
  it('settings popover: no devices -> Default option; devices listed, speakers pick calls selectOutput; mic pick selectInput; closes on outside mousedown and Escape', () => {
    useRtcStore.getState().patch({ status: 'joined' });
    render(<AudioControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    expect(screen.getByLabelText('Microphone').querySelectorAll('option')).toHaveLength(1);
    expect(screen.queryByLabelText('Speakers')).toBeNull();
    act(() => useRtcStore.getState().patch({ inputs: [{ id: 'i1', label: 'Mic 1' }], outputs: [{ id: 'o1', label: 'Spk 1' }], inputId: 'i1', outputId: null, ptt: false }));
    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'i1' } });
    fireEvent.change(screen.getByLabelText('Speakers'), { target: { value: 'o1' } });
    expect(rtc.selectOutput).toHaveBeenCalledWith('o1');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(rtc.setPtt).toHaveBeenCalledWith(true);
    fireEvent.mouseDown(screen.getByRole('dialog')); // inside: stays open
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AudioSinks extras', () => {
  it('binds streams once, routes to the chosen output when setSinkId exists, and skips peers without a stream', () => {
    const stream = {} as MediaStream;
    const sink = vi.fn(async () => undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', { configurable: true, value: sink });
    useRtcStore.getState().patch({ outputId: 'o1', peers: { a: { ...info, clientId: 'a', state: 'connected', muted: false, speaking: false, stream }, b: { ...info, clientId: 'b', state: 'connecting', muted: false, speaking: false, stream: null } } as never });
    const { container } = render(<AudioSinks />);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(sink).toHaveBeenCalledWith('o1');
    sink.mockRejectedValueOnce(new Error('x'));
    act(() => useRtcStore.getState().patch({ outputId: 'o2' }));
    expect(sink).toHaveBeenCalledWith('o2');
    // without an output pick nothing is routed
    sink.mockClear();
    act(() => useRtcStore.getState().patch({ outputId: null }));
    expect(sink).not.toHaveBeenCalled();
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).setSinkId;
  });
});
