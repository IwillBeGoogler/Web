import { useEffect, useRef, useState, type RefObject } from 'react';
import { HeroFallback } from './HeroFallback';
import { SceneLoop } from './sceneLoop';
import { sceneBox, type Box } from './cameraMap';

/** px between the headline column and the scene, and the scene's inner padding */
export const SCENE_GAP = 56;
export const SCENE_PAD = 20;

export function canWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const prefersReduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => !!(window.matchMedia?.('(max-width: 760px)').matches || ('ontouchstart' in window && window.innerWidth < 900));

/** the free area for the scene, relative to the canvas box: the box minus the measured headline column */
export function measureFit(box: HTMLElement, copy: HTMLElement | null): Box {
  const b = box.getBoundingClientRect();
  if (!copy) return { left: SCENE_PAD, top: SCENE_PAD, width: Math.max(1, b.width - SCENE_PAD * 2), height: Math.max(1, b.height - SCENE_PAD * 2) };
  const c = copy.getBoundingClientRect();
  // the headline column = the copy block's text extent (its children), not any empty flex space
  let right = c.left;
  let top = c.bottom;
  let bottom = c.top;
  for (const el of Array.from(copy.children)) {
    const r = el.getBoundingClientRect();
    right = Math.max(right, r.right);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  if (bottom <= top) { top = c.top; bottom = c.bottom; }
  const text = { left: c.left, top, width: Math.max(1, right - c.left), height: bottom - top };
  const f = sceneBox({ left: b.left, top: b.top, width: b.width, height: b.height }, text, { gap: SCENE_GAP, pad: SCENE_PAD, maxWidth: 780 });
  return { left: f.left - b.left, top: f.top - b.top, width: f.width, height: f.height };
}
const cssVar = (name: string, dflt: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || dflt;

export type SceneMode = 'loading' | 'webgl' | 'fallback';

/**
 * The hero's WebGL canvas (the only three.js on the page): created inside the hero box, lazy-loaded, paused while the tab is hidden or the
 * hero is off screen. Without WebGL it reports `fallback` and the animated SVG is shown instead.
 */
export function HeroCanvas({ boxRef, copyRef, onMode }: { boxRef: RefObject<HTMLElement | null>; copyRef?: RefObject<HTMLElement | null>; onMode: (m: SceneMode) => void }) {
  const [webgl] = useState(() => canWebGL());
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');
  const [mobile, setMobile] = useState(() => isMobile());
  const modeCb = useRef(onMode);
  modeCb.current = onMode;

  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme ?? 'light'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 760px)');
    if (!mq) return;
    const on = () => setMobile(isMobile());
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    if (!webgl || failed) {
      modeCb.current('fallback');
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    modeCb.current('loading');
    // a fresh canvas per effect run: a canvas whose WebGL context was released (StrictMode remount, theme switch) can never get a new one
    const cv = document.createElement('canvas');
    cv.className = 'hero-canvas';
    cv.setAttribute('aria-hidden', 'true');
    cv.dataset.testid = 'hero-canvas';
    box.prepend(cv);
    let disposed = false;
    let cleanup = () => {};
    const reduced = prefersReduced();
    const size = () => { const b = box.getBoundingClientRect(); return { w: Math.max(1, b.width), h: Math.max(1, b.height) }; };
    void import('./threeScene')
      .then(async ({ createLandingScene }) => {
        const { w, h } = size();
        const scene = await createLandingScene({ canvas: cv, host: box, width: w, height: h, mobile, dark: theme === 'dark', accent: cssVar('--accent', '#5b5bf7'), fitBox: measureFit(box, copyRef?.current ?? null) });
        if (disposed) return scene.dispose();
        const loop = new SceneLoop({ raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id), render: scene.render, reducedMotion: reduced });
        const onVis = () => loop.setVisible(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', onVis);
        const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([en]) => loop.setIntersecting(en.isIntersecting), { threshold: 0.01 }) : null;
        io?.observe(box);
        const ro = new ResizeObserver(() => {
          const s = size();
          scene.resize(s.w, s.h, measureFit(box, copyRef?.current ?? null));
          if (reduced) loop.still();
        });
        ro.observe(box);
        if (copyRef?.current) ro.observe(copyRef.current);
        const onMove = (e: PointerEvent) => scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
        if (!mobile && !reduced) window.addEventListener('pointermove', onMove, { passive: true });
        loop.start();
        modeCb.current('webgl');
        cleanup = () => {
          loop.stop();
          document.removeEventListener('visibilitychange', onVis);
          window.removeEventListener('pointermove', onMove);
          io?.disconnect();
          ro.disconnect();
          scene.dispose();
        };
      })
      .catch(() => { if (!disposed) { setFailed(true); modeCb.current('fallback'); } });
    return () => {
      disposed = true;
      cleanup();
      cv.remove();
    };
  }, [webgl, failed, theme, mobile, boxRef, copyRef]);

  return null;
}

/** Hero placeholder: its box is the canvas area; shows the animated SVG while loading / without WebGL. */
export function HeroVisual({ mode, boxRef }: { mode: SceneMode; boxRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="hero-visual" ref={boxRef} data-mode={mode}>
      {mode !== 'webgl' && <HeroFallback className={mode === 'loading' ? 'is-loading' : ''} />}
    </div>
  );
}
