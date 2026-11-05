import { useEffect, useMemo, useRef } from 'react';
import { useStoreApi } from '@xyflow/react';
import type { FlowPath } from '../lib/flow/paths';
import { computeFrame, type FlowItem } from '../lib/flow/frame';
import { SceneLoop } from '../landing/sceneLoop';
import { usePrefersReducedMotion } from '../hooks/useReducedMotion';
import { themeRoot } from '../lib/host';

/** soft glow sprite per colour (drawn once, stamped for every packet: much cheaper than shadowBlur) */
const sprites = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement | null {
  let c = sprites.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    if (!g) return null;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, color);
    r.addColorStop(0.35, color + '88');
    r.addColorStop(1, color + '00');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    sprites.set(color, c);
  }
  return c;
}
const hex6 = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#5b5bf7');
/** packets must read on both themes: very dark edge colours are lifted toward white */
export function lift(c: string, dark = true): string {
  const h = hex6(c);
  if (!dark) return h;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.4) return h;
  const mix = (v: number) => Math.round(v + (255 - v) * 0.62).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function draw(ctx: CanvasRenderingContext2D, items: FlowItem[], t: number) {
  const dark = themeRoot().dataset.theme === 'dark';
  for (const it of items) {
    const color = lift(it.color, dark);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.angle);
    if (it.kind === 'chevron') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-3.5, -3.5);
      ctx.lineTo(1.5, 0);
      ctx.lineTo(-3.5, 3.5);
      ctx.stroke();
    } else if (it.style === 'dash') {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.roundRect(-6, -1.6, 12, 3.2, 1.6);
      ctx.fill();
    } else {
      const pulse = it.style === 'pulse' ? 0.65 + 0.35 * Math.sin(it.phase * Math.PI * 2 + t * 3) : 1;
      const g = glow(color);
      if (g) {
        ctx.globalAlpha = 0.9 * pulse;
        ctx.drawImage(g, -9 * pulse, -9 * pulse, 18 * pulse, 18 * pulse);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, (it.style === 'pulse' ? 2.2 + 1.4 * pulse : 2.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Data-flow overlay: ONE canvas over the React Flow pane, one rAF loop for all packets (cached path lengths, off-screen lines skipped).
 * Pauses when the tab is hidden; with prefers-reduced-motion it draws static chevrons instead of moving packets.
 */
export function FlowLayer({ paths, visible }: { paths: FlowPath[]; visible?: (p: FlowPath) => boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();
  const reduced = usePrefersReducedMotion();
  const live = useRef({ paths, visible });
  live.current = { paths, visible };
  const boxes = useMemo(() => new WeakMap<FlowPath, { x0: number; y0: number; x1: number; y1: number }>(), []);
  const loopRef = useRef<SceneLoop | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const parent = cv.parentElement!;
    let w = 1;
    let h = 1;
    const resize = () => {
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); loop.still(); });
    ro.observe(parent);
    const render = (t: number) => {
      const [tx, ty, zoom] = store.getState().transform;
      const dpr = cv.width / w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * tx, dpr * ty);
      const { paths: ps, visible: vis } = live.current;
      const vx0 = -tx / zoom;
      const vy0 = -ty / zoom;
      const vx1 = vx0 + w / zoom;
      const vy1 = vy0 + h / zoom;
      const inView = (p: FlowPath) => {
        let b = boxes.get(p);
        if (!b) {
          b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
          for (const q of p.points) { b.x0 = Math.min(b.x0, q.x); b.y0 = Math.min(b.y0, q.y); b.x1 = Math.max(b.x1, q.x); b.y1 = Math.max(b.y1, q.y); }
          boxes.set(p, b);
        }
        return b.x1 >= vx0 - 20 && b.x0 <= vx1 + 20 && b.y1 >= vy0 - 20 && b.y0 <= vy1 + 20 && (!vis || vis(p));
      };
      draw(ctx, computeFrame(ps, t, reduced, inView), t);
    };
    const loop = new SceneLoop({ raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id), render, reducedMotion: reduced });
    loopRef.current = loop;
    const onVis = () => loop.setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    const unsub = reduced ? store.subscribe(() => loop.still()) : () => {}; // static chevrons follow pan / zoom
    loop.start();
    return () => {
      loop.stop();
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      unsub();
      loopRef.current = null;
    };
  }, [store, reduced, boxes]);

  // reduced motion: redraw the static frame when the lines / trace change
  useEffect(() => { if (reduced) loopRef.current?.still(); }, [paths, visible, reduced]);

  return <canvas ref={ref} className="flow-layer" aria-hidden data-testid="flow-layer" />;
}
