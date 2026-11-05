import { Headphones, Mic, MicOff, PhoneOff, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getRtc } from '../../rtc/runtime';
import { useRtcStore } from '../../rtc/store';
import { isTypingTarget } from '../../lib/keymap';
import { t } from '../../i18n';

/** the key held for push-to-talk. Not Space (pans the canvas) and not V (select tool): M, for "mic". */
export const PTT_KEY = 'm';

/** hold M to talk while push-to-talk is on; ignored while typing, with modifiers, or when the call is not joined */
export function usePushToTalk(): void {
  const joined = useRtcStore((s) => s.status === 'joined');
  const ptt = useRtcStore((s) => s.ptt);
  useEffect(() => {
    if (!joined || !ptt) return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== PTT_KEY || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!e.repeat) getRtc()?.talk(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === PTT_KEY) getRtc()?.talk(false);
    };
    const blur = () => getRtc()?.talk(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      getRtc()?.talk(false);
    };
  }, [joined, ptt]);
}

/** remote voices: one hidden <audio> per connected peer (the sink follows the speaker picked in the device list) */
export function AudioSinks() {
  const peers = useRtcStore((s) => s.peers);
  const outputId = useRtcStore((s) => s.outputId);
  return (
    <div className="audio-sinks" aria-hidden>
      {Object.values(peers).map((p) =>
        p.stream ? (
          <audio
            key={p.clientId}
            data-testid={`audio-${p.clientId}`}
            autoPlay
            ref={(el) => {
              if (!el) return;
              if (el.srcObject !== p.stream) el.srcObject = p.stream;
              const sink = (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
              if (outputId && sink) void sink.call(el, outputId).catch(() => undefined);
            }}
          />
        ) : null,
      )}
    </div>
  );
}

/**
 * "Join audio" (WebRTC mesh, up to the server's limit) and, once joined: mute, push-to-talk (hold M), device picker and Leave.
 * The number of people in the call is shown before you join.
 */
export function AudioControls() {
  const status = useRtcStore((s) => s.status);
  const error = useRtcStore((s) => s.error);
  const userMuted = useRtcStore((s) => s.userMuted);
  const ptt = useRtcStore((s) => s.ptt);
  const talking = useRtcStore((s) => s.talking);
  const speaking = useRtcStore((s) => s.speaking);
  const roster = useRtcStore((s) => s.roster);
  const inputs = useRtcStore((s) => s.inputs);
  const outputs = useRtcStore((s) => s.outputs);
  const inputId = useRtcStore((s) => s.inputId);
  const outputId = useRtcStore((s) => s.outputId);
  const maxPeers = useRtcStore((s) => s.maxPeers);
  const peers = useRtcStore((s) => s.peers);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  usePushToTalk();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const rtc = getRtc();
  if (!rtc) return null;
  const joined = status === 'joined';
  const muted = ptt ? !talking : userMuted;
  if (!joined) {
    const cap = Math.min(6, maxPeers);
    const full = roster.length >= cap;
    return (
      <div className="audio-ctl" ref={root}>
        <button type="button" className="btn btn-ghost audio-join" disabled={status === 'joining' || full} aria-label={full ? t('Audio room is full ({n}/{n})', { n: cap }) : t('Join audio')} title={full ? t('Audio room is full ({n}/{n})', { n: cap }) : roster.length ? t('{n} of {max} in the audio room', { n: roster.length, max: cap }) : t('Talk to the people in this file')} onClick={() => void rtc.join()}>
          <Headphones size={15} aria-hidden /> <span className="btn-label">{status === 'joining' ? t('Joining…') : full ? t('Full') : t('Join audio')}</span>
          {roster.length > 0 && <span className="audio-count" data-testid="audio-roster-count">{full ? `${cap}/${cap}` : ` · ${roster.length}/${cap}`}</span>}
        </button>
        {error && (
          <div className="audio-error glass" role="alert">
            {error}
            <button type="button" className="comment-act" onClick={() => useRtcStore.getState().patch({ error: null, status: 'idle' })}>{t('Dismiss')}</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="audio-ctl joined" ref={root} role="group" aria-label={t('Audio room')} data-testid="audio-room" data-peer-states={Object.values(peers).map((p) => p.state).join(',')}>
      <button type="button" className={`btn btn-icon btn-ghost audio-mic${muted ? ' muted' : ''}${speaking && !muted ? ' speaking' : ''}`} aria-label={ptt ? t('Push to talk (hold M)') : muted ? t('Unmute') : t('Mute')} aria-pressed={!muted} title={ptt ? t('Push-to-talk is on: hold M to talk') : muted ? t('Unmute') : t('Mute')} onClick={() => !ptt && rtc.setMuted(!userMuted)}>
        {muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
      </button>
      <button type="button" className="btn btn-icon btn-ghost" aria-label={t('Audio settings')} aria-haspopup="dialog" aria-expanded={open} title={t('Push-to-talk, microphone and speakers')} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={15} aria-hidden />
      </button>
      <button type="button" className="btn btn-icon btn-ghost audio-leave" aria-label={t('Leave audio')} title={t('Leave the audio room')} onClick={() => rtc.leave()}>
        <PhoneOff size={15} aria-hidden />
      </button>
      {open && (
        <div className="audio-pop" role="dialog" aria-label={t('Audio settings')}>
          <label className="audio-row">
            <input type="checkbox" checked={ptt} onChange={(e) => rtc.setPtt(e.target.checked)} /> {t('Push to talk')} <span className="muted">{t('hold')} <kbd>M</kbd></span>
          </label>
          <label className="audio-field">
            <span>{t('Microphone')}</span>
            <select aria-label={t('Microphone')} value={inputId ?? ''} onChange={(e) => void rtc.selectInput(e.target.value)}>
              {inputs.length === 0 && <option value="">{t('Default')}</option>}
              {inputs.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
            </select>
          </label>
          {outputs.length > 0 && (
            <label className="audio-field">
              <span>{t('Speakers')}</span>
              <select aria-label={t('Speakers')} value={outputId ?? ''} onChange={(e) => rtc.selectOutput(e.target.value)}>
                <option value="">{t('Default')}</option>
                {outputs.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
              </select>
            </label>
          )}
          <p className="muted audio-note">{t('Peer-to-peer audio for up to {n} people. Larger rooms need an SFU (see the docs).', { n: maxPeers })}</p>
        </div>
      )}
    </div>
  );
}
