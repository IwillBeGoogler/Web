import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Flashlight, X } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useCollabStore } from '../../collab/store';
import { presentationKey, presentationRect, presentationSteps, stepPresentation, type StepDir } from '../../lib/board/presentation';
import { stopPresentation } from '../../lib/board/live';
import { followTransform } from '../../collab/presenceMath';
import { isTypingTarget } from '../../lib/keymap';
import { useUiStore } from '../../store/uiStore';
import { followLink, linkAtPoint } from '../../lib/design/actions';
import { themeRoot } from '../../lib/host';
import { t } from '../../i18n';

/**
 * Presentation mode: one frame per step, fullscreen, nothing but the canvas. Arrow keys / click step, P laser, S spotlight, Esc exits.
 * Mounted once in the editor; renders nothing while not presenting.
 */
export function Presentation() {
  const presenting = useBoardStore((s) => s.presenting);
  const set = useBoardStore((s) => s.set);
  const nodes = useDiagramStore((s) => s.nodes);
  const session = useCollabStore((s) => s.session);
  const { setViewport, screenToFlowPosition } = useReactFlow();
  const steps = presentationSteps(nodes);
  const [idle, setIdle] = useState(false);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number; t: number }[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on = presenting !== null;
  const index = Math.min(presenting?.index ?? 0, Math.max(0, steps.length - 1));
  const frame = nodes.find((n) => n.id === steps[index]);

  // nothing left to show (the last frame was deleted): end the show
  useEffect(() => {
    if (on && steps.length === 0) stopPresentation();
  }, [on, steps.length]);

  // chrome off + fullscreen while presenting
  useEffect(() => {
    if (!on) return;
    const app = document.querySelector('.app');
    app?.classList.add('presenting');
    const el = themeRoot();
    if (!document.fullscreenElement) void el.requestFullscreen?.().catch(() => undefined);
    const onFs = () => { if (!document.fullscreenElement) stopPresentation(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      app?.classList.remove('presenting');
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, [on]);

  // show the current frame; tell the others where I am
  useEffect(() => {
    if (!on || !frame) return;
    const r = presentationRect(frame);
    const area = document.querySelector('.canvas')?.getBoundingClientRect();
    const size = { width: area?.width || window.innerWidth, height: area?.height || window.innerHeight };
    void setViewport(followTransform({ x: r.x, y: r.y, w: r.width, h: r.height }, size), { duration: 450 });
    session?.setPresence({ presenting: { frameId: frame.id, index, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, seq: Date.now() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, frame?.id, index]);

  useEffect(() => {
    if (!on) return;
    session?.setPresence({ laser: presenting?.laser ? true : undefined });
  }, [on, presenting?.laser, session]);

  const step = useCallback((dir: StepDir) => {
    const s = useBoardStore.getState().presenting;
    if (!s) return;
    set({ presenting: { ...s, index: stepPresentation({ index: s.index, count: presentationSteps(useDiagramStore.getState().nodes).length }, dir).index } });
  }, [set]);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const a = presentationKey(e.key);
      if (!a) return;
      // typing somewhere (the command palette, a text field) keeps its keys; only Esc always ends the show
      if (a.type !== 'exit' && (isTypingTarget(e.target) || useUiStore.getState().commandOpen || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (a.type === 'exit' && useUiStore.getState().commandOpen) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = useBoardStore.getState().presenting;
      if (!s) return;
      if (a.type === 'step') step(a.dir);
      else if (a.type === 'laser') set({ presenting: { ...s, laser: !s.laser, spotlight: false } });
      else if (a.type === 'spotlight') set({ presenting: { ...s, spotlight: !s.spotlight, laser: false } });
      else stopPresentation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [on, set, step]);

  // laser trail
  useEffect(() => {
    if (!presenting?.laser) { setTrail([]); return; }
    const id = setInterval(() => setTrail((t) => t.filter((p) => Date.now() - p.t < 600)), 80);
    return () => clearInterval(id);
  }, [presenting?.laser]);

  if (!on) return null;
  const wake = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };
  return (
    <div
      className="present-surface"
      data-testid="present-surface"
      onPointerMove={(e) => {
        wake();
        setMouse({ x: e.clientX, y: e.clientY });
        if (presenting?.laser) setTrail((t) => [...t.slice(-14), { x: e.clientX, y: e.clientY, t: Date.now() }]);
        // the laser is my shared cursor
        if (session) session.setCursor(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
      onClick={(e) => {
        const link = linkAtPoint(e.clientX, e.clientY);
        if (link) {
          if (link.fileId !== useDiagramStore.getState().projectId) stopPresentation();
          followLink(link);
          return;
        }
        step('next');
      }}
      onContextMenu={(e) => { e.preventDefault(); step('prev'); }}
    >
      {presenting?.spotlight && mouse && <div className="present-spotlight" style={{ ['--sx' as string]: `${mouse.x}px`, ['--sy' as string]: `${mouse.y}px` }} />}
      {presenting?.laser && trail.map((p, i) => <span key={p.t + ':' + i} className="laser-dot" style={{ left: p.x, top: p.y, opacity: (i + 1) / trail.length }} />)}
      {presenting?.laser && mouse && <span className="laser-dot head" style={{ left: mouse.x, top: mouse.y }} />}
      <div className={`present-bar glass${idle ? ' idle' : ''}`} role="toolbar" aria-label={t('Presentation')} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        <button type="button" aria-label={t('Previous frame')} disabled={index === 0} onClick={() => step('prev')}><ChevronLeft size={16} /></button>
        <span className="present-count" aria-live="polite">{index + 1} / {steps.length}<b>{frame?.data.label ? ` · ${String(frame.data.label)}` : ''}</b></span>
        <button type="button" aria-label={t('Next frame')} disabled={index >= steps.length - 1} onClick={() => step('next')}><ChevronRight size={16} /></button>
        <span className="dock-sep" aria-hidden />
        <button type="button" className={presenting?.laser ? 'on' : ''} aria-pressed={!!presenting?.laser} title={t('Laser pointer (P)')} aria-label={t('Laser pointer')} onClick={() => set({ presenting: { ...presenting!, laser: !presenting!.laser, spotlight: false } })}><Crosshair size={16} /></button>
        <button type="button" className={presenting?.spotlight ? 'on' : ''} aria-pressed={!!presenting?.spotlight} title={t('Spotlight (S)')} aria-label={t('Spotlight')} onClick={() => set({ presenting: { ...presenting!, spotlight: !presenting!.spotlight, laser: false } })}><Flashlight size={16} /></button>
        <button type="button" title={t('Exit (Esc)')} aria-label={t('Exit presentation')} onClick={() => stopPresentation()}><X size={16} /></button>
      </div>
    </div>
  );
}
