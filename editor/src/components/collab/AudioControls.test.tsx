import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setRtc } from '../../rtc/runtime';
import { useRtcStore } from '../../rtc/store';
import { AudioControls, AudioSinks, PTT_KEY } from './AudioControls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fake = (): any => ({ join: vi.fn(async () => undefined), leave: vi.fn(), setMuted: vi.fn(), setPtt: vi.fn(), talk: vi.fn(), selectInput: vi.fn(async () => undefined), selectOutput: vi.fn() });
let rtc: ReturnType<typeof fake>;
beforeEach(() => {
  useRtcStore.getState().reset();
  rtc = fake();
  setRtc(rtc);
});

describe('AudioControls', () => {
  it('renders nothing when audio rooms are not available', () => {
    setRtc(null);
    const { container } = render(<AudioControls />);
    expect(container).toBeEmptyDOMElement();
  });

  it('"Join audio" joins; the number of people already in the room is shown', () => {
    useRtcStore.getState().patch({ roster: [{ clientId: 'a', userId: 'u', name: 'Ann' }, { clientId: 'b', userId: 'v', name: 'Bo' }] });
    render(<AudioControls />);
    expect(screen.getByTestId('audio-roster-count')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Join audio' }));
    expect(rtc.join).toHaveBeenCalled();
  });

  it('shows the participant count on the Join button', () => {
    useRtcStore.getState().patch({ roster: [{ clientId: 'a', userId: 'u', name: 'Ann' }, { clientId: 'b', userId: 'v', name: 'Bo' }, { clientId: 'c', userId: 'w', name: 'Cy' }] });
    render(<AudioControls />);
    expect(screen.getByRole('button', { name: 'Join audio' })).toHaveTextContent('Join audio · 3/6');
  });

  it('a full room: Join is disabled and shows 6/6', () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({ clientId: `c${i}`, userId: `u${i}`, name: `P${i}` }));
    useRtcStore.getState().patch({ roster });
    render(<AudioControls />);
    const b = screen.getByRole('button', { name: 'Audio room is full (6/6)' });
    expect(b).toBeDisabled();
    expect(b).toHaveTextContent('6/6');
    fireEvent.click(b);
    expect(rtc.join).not.toHaveBeenCalled();
  });

  it('a blocked microphone shows the reason with a way to dismiss it', () => {
    useRtcStore.getState().patch({ status: 'error', error: 'Microphone access was blocked.' });
    render(<AudioControls />);
    expect(screen.getByRole('alert')).toHaveTextContent('blocked');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useRtcStore.getState().status).toBe('idle');
  });

  it('joined: mute toggles, leave leaves, the speaking state rings the mic', () => {
    useRtcStore.getState().patch({ status: 'joined' });
    render(<AudioControls />);
    const mic = screen.getByRole('button', { name: 'Mute' });
    fireEvent.click(mic);
    expect(rtc.setMuted).toHaveBeenCalledWith(true);
    act(() => useRtcStore.getState().patch({ userMuted: true }));
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveClass('muted');
    act(() => useRtcStore.getState().patch({ userMuted: false, speaking: true }));
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveClass('speaking');
    fireEvent.click(screen.getByRole('button', { name: 'Leave audio' }));
    expect(rtc.leave).toHaveBeenCalled();
  });

  it('settings: push-to-talk switch and the device pickers', () => {
    useRtcStore.getState().patch({ status: 'joined', inputs: [{ id: 'm1', label: 'Built-in' }, { id: 'm2', label: 'USB' }], outputs: [{ id: 's1', label: 'Speakers' }], inputId: 'm1' });
    render(<AudioControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Audio settings' }));
    fireEvent.click(screen.getByLabelText(/Push to talk/));
    expect(rtc.setPtt).toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'm2' } });
    expect(rtc.selectInput).toHaveBeenCalledWith('m2');
    fireEvent.change(screen.getByLabelText('Speakers'), { target: { value: 's1' } });
    expect(rtc.selectOutput).toHaveBeenCalledWith('s1');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Audio settings' })).toBeNull();
  });

  it(`push-to-talk: holding "${PTT_KEY}" talks, releasing stops; typing in a field, modifiers and Space never talk`, () => {
    useRtcStore.getState().patch({ status: 'joined', ptt: true });
    render(<><AudioControls /><input aria-label="field" /></>);
    expect(screen.getByRole('button', { name: 'Push to talk (hold M)' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'm' });
    expect(rtc.talk).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(window, { key: 'm' });
    expect(rtc.talk).toHaveBeenLastCalledWith(false);
    rtc.talk.mockClear();
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'm' });
    fireEvent.keyDown(window, { key: 'm', metaKey: true });
    fireEvent.keyDown(window, { key: ' ' });
    expect(rtc.talk).not.toHaveBeenCalledWith(true);
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.blur(window);
    expect(rtc.talk).toHaveBeenLastCalledWith(false); // losing focus while the key is down must not leave the mic open
  });

  it('without push-to-talk the M key does nothing', () => {
    useRtcStore.getState().patch({ status: 'joined', ptt: false });
    render(<AudioControls />);
    fireEvent.keyDown(window, { key: 'm' });
    expect(rtc.talk).not.toHaveBeenCalledWith(true);
  });
});

describe('AudioSinks', () => {
  it('renders an <audio> for every peer that has a stream', () => {
    useRtcStore.getState().upsertPeer({ clientId: 'a', userId: null, name: 'A' }, { stream: {} as MediaStream });
    useRtcStore.getState().upsertPeer({ clientId: 'b', userId: null, name: 'B' }, {});
    render(<AudioSinks />);
    expect(screen.getByTestId('audio-a')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-b')).toBeNull();
  });
});
