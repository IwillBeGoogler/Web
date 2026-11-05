import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useStore } from '@xyflow/react';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { newId } from '../../lib/graph';
import { addGuide, moveGuide, removeGuide, rulerTicks, type Measure } from '../../lib/precision/precision';
import type { Guide } from '../../types';
import { useLayoutStore } from '../../store/layoutStore';
import { WSBAR_INSET } from '../../lib/viewport';

const EMPTY: Guide[] = [];
export const RULER = 20;
/** the top bar floats 12px from the top and is 48px high (`.topbar`, `--topbar-h`): rulers start under it */
export const TOPBAR_BOTTOM = 12 + 48;
/** y (px, from the top of the canvas) where the rulers start; lower while the file tabs row is shown */
export const rulersTop = (wsbar: boolean): number => TOPBAR_BOTTOM + (wsbar ? WSBAR_INSET : 0);

/** Alt held down (for measuring). Ignores key repeat and resets when the window loses focus. */
export function useAltKey(): boolean {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Alt' && setAlt(e.type === 'keydown');
    const off = () => setAlt(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off); };
  }, []);
  return alt;
}

/** distance lines + labels (Alt-hover and while dragging) and the file's guides; lives inside the React Flow viewport */
export function MeasureLines({ measures, zoom }: { measures: Measure[]; zoom: number }) {
  const s = 1 / Math.max(zoom, 0.1);
  return (
    <g className="measure-layer" data-testid="measure-layer">
      {measures.map((m, i) => {
        const mid = { x: (m.from.x + m.to.x) / 2, y: (m.from.y + m.to.y) / 2 };
        const label = `${Math.round(m.value)}`;
        return (
          <g key={i} className="measure">
            <line x1={m.from.x} y1={m.from.y} x2={m.to.x} y2={m.to.y} strokeWidth={1.2 * s} />
            <line x1={m.axis === 'x' ? m.from.x : m.from.x - 4 * s} y1={m.axis === 'x' ? m.from.y - 4 * s : m.from.y} x2={m.axis === 'x' ? m.from.x : m.from.x + 4 * s} y2={m.axis === 'x' ? m.from.y + 4 * s : m.from.y} strokeWidth={1.2 * s} />
            <line x1={m.axis === 'x' ? m.to.x : m.to.x - 4 * s} y1={m.axis === 'x' ? m.to.y - 4 * s : m.to.y} x2={m.axis === 'x' ? m.to.x : m.to.x + 4 * s} y2={m.axis === 'x' ? m.to.y + 4 * s : m.to.y} strokeWidth={1.2 * s} />
            <rect x={mid.x - (label.length * 3.4 + 5) * s} y={mid.y - 8 * s} width={(label.length * 6.8 + 10) * s} height={16 * s} rx={4 * s} />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={11 * s}>{label}</text>
          </g>
        );
      })}
    </g>
  );
}

/** The guides of this file, drawn in flow space. Drag one to move it, drag it back onto a ruler (or double-click) to delete it. */
export function GuideLines({ zoom }: { zoom: number }) {
  const pageId = useDiagramStore((s) => s.activePageId);
  const guides = useDiagramStore((s) => s.guides?.[pageId] ?? EMPTY);
  const setGuides = useDiagramStore((s) => s.setGuides);
  const rf = useStore((s) => s.transform);
  const off = rulersTop(useLayoutStore((st) => st.wsbar));
  const drag = useRef<{ id: string; axis: 'x' | 'y' } | null>(null);
  const s = 1 / Math.max(zoom, 0.1);
  const flow = (e: RPointerEvent) => {
    const el = (e.currentTarget as Element).closest('.react-flow')!.getBoundingClientRect();
    return { x: (e.clientX - el.left - rf[0]) / rf[2], y: (e.clientY - el.top - rf[1]) / rf[2], sx: e.clientX - el.left, sy: e.clientY - el.top };
  };
  return (
    <g className="guides-layer" data-testid="guides">
      {guides.map((g) => (
        <g key={g.id} className="guide" data-guide={g.id}>
          {g.axis === 'x' ? <line x1={g.pos} x2={g.pos} y1={-1e5} y2={1e5} strokeWidth={1 * s} /> : <line y1={g.pos} y2={g.pos} x1={-1e5} x2={1e5} strokeWidth={1 * s} />}
          <line
            className="guide-hit" strokeWidth={10 * s}
            {...(g.axis === 'x' ? { x1: g.pos, x2: g.pos, y1: -1e5, y2: 1e5 } : { y1: g.pos, y2: g.pos, x1: -1e5, x2: 1e5 })}
            style={{ pointerEvents: 'stroke', cursor: g.axis === 'x' ? 'col-resize' : 'row-resize' }}
            onDoubleClick={() => setGuides(pageId, removeGuide(guides, g.id))}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); e.stopPropagation(); useDiagramStore.getState().snapshot(); drag.current = { id: g.id, axis: g.axis }; }}
            onPointerMove={(e) => {
              if (drag.current?.id !== g.id) return;
              const p = flow(e);
              setGuides(pageId, moveGuide(useDiagramStore.getState().guides[pageId] ?? [], g.id, Math.round(g.axis === 'x' ? p.x : p.y)));
            }}
            onPointerUp={(e) => {
              if (drag.current?.id !== g.id) return;
              drag.current = null;
              const p = flow(e);
              if (g.axis === 'x' ? p.sx < RULER : p.sy < off + RULER) setGuides(pageId, removeGuide(useDiagramStore.getState().guides[pageId] ?? [], g.id)); // dragged back onto the ruler
            }}
          />
        </g>
      ))}
    </g>
  );
}

/** Rulers (top and left) in screen space; drag from one to pull out a guide. Shown only while the Rulers toggle is on. */
export function Rulers() {
  const off = rulersTop(useLayoutStore((s) => s.wsbar));
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const pageId = useDiagramStore((s) => s.activePageId);
  const setGuides = useDiagramStore((s) => s.setGuides);
  const pulling = useRef<string | null>(null);
  const top = rulerTicks(-tx / zoom, (width - tx) / zoom, zoom);
  const left = rulerTicks(-ty / zoom, (height - ty) / zoom, zoom);
  const pull = (axis: 'x' | 'y') => (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    useDiagramStore.getState().snapshot();
    const id = newId('gd');
    pulling.current = id;
    setGuides(pageId, addGuide(useDiagramStore.getState().guides[pageId] ?? [], { id, axis, pos: 0 }));
    place(e, axis, id);
  };
  const place = (e: RPointerEvent, axis: 'x' | 'y', id: string) => {
    const el = (e.currentTarget as Element).parentElement!.getBoundingClientRect();
    const pos = Math.round(axis === 'x' ? (e.clientX - el.left - tx) / zoom : (e.clientY - el.top - ty) / zoom);
    setGuides(pageId, moveGuide(useDiagramStore.getState().guides[pageId] ?? [], id, pos));
  };
  const finish = (e: RPointerEvent, axis: 'x' | 'y') => {
    const id = pulling.current;
    pulling.current = null;
    if (!id) return;
    const el = (e.currentTarget as Element).parentElement!.getBoundingClientRect();
    const sx = e.clientX - el.left;
    const sy = e.clientY - el.top;
    if (axis === 'x' ? sx < RULER : sy < off + RULER) setGuides(pageId, removeGuide(useDiagramStore.getState().guides[pageId] ?? [], id)); // released on the ruler
  };
  return (
    <div className="rulers" data-testid="rulers" aria-hidden>
      <div className="ruler ruler-top" style={{ top: off }} onPointerDown={pull('y')} onPointerMove={(e) => pulling.current && place(e, 'y', pulling.current)} onPointerUp={(e) => finish(e, 'y')}>
        <svg width={width} height={RULER}>
          {top.ticks.map((v) => (
            <g key={v}><line x1={v * zoom + tx} x2={v * zoom + tx} y1={RULER - 8} y2={RULER} /><text x={v * zoom + tx + 3} y={10}>{v}</text></g>
          ))}
        </svg>
      </div>
      <div className="ruler ruler-left" style={{ top: off + RULER }} onPointerDown={pull('x')} onPointerMove={(e) => pulling.current && place(e, 'x', pulling.current)} onPointerUp={(e) => finish(e, 'x')}>
        <svg width={RULER} height={height} style={{ marginTop: -(off + RULER) }}>
          {left.ticks.map((v) => (
            <g key={v}><line y1={v * zoom + ty} y2={v * zoom + ty} x1={RULER - 8} x2={RULER} /><text transform={`translate(10 ${v * zoom + ty + 3}) rotate(-90)`} textAnchor="end">{v}</text></g>
          ))}
        </svg>
      </div>
      <div className="ruler-corner" style={{ top: off }} />
    </div>
  );
}
export const useRulersOn = () => useUiStore((s) => s.rulers);
