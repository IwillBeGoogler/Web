import { useEffect, useMemo, useRef } from 'react';
import { ViewportPortal, getNodesBounds, useReactFlow, useStore } from '@xyflow/react';
import { followTransform, smoothCursor, type Pt } from '../../collab/presenceMath';
import { useCollabStore } from '../../collab/store';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { useDiagramStore } from '../../store/diagramStore';
import { t } from '../../i18n';

const CURSOR_TAU_MS = 70;

/**
 * Other people on the canvas, drawn in flow space inside the viewport (so they pan / zoom with it):
 * smoothed cursors with a name label (counter-scaled so they keep their size), and a coloured outline around what they selected.
 */
export function PresenceLayer() {
  const people = useCollabStore((s) => s.people);
  const nodes = useDiagramStore((s) => s.nodes);
  const zoom = useStore((s) => s.transform[2]);
  const els = useRef(new Map<number, HTMLElement>());
  const pos = useRef(new Map<number, Pt>());
  const target = useRef(new Map<number, Pt | null>());

  useEffect(() => {
    target.current = new Map(people.map((p) => [p.clientId, p.state.cursor ?? null]));
    for (const id of [...pos.current.keys()]) if (!target.current.has(id)) pos.current.delete(id);
  }, [people]);

  // one animation loop for every cursor: exponential smoothing towards the last known position
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      for (const [id, el] of els.current) {
        const t = target.current.get(id);
        if (!t) {
          el.style.opacity = '0';
          pos.current.delete(id);
          continue;
        }
        const cur = pos.current.get(id) ?? t;
        const next = smoothCursor(cur, t, dt, CURSOR_TAU_MS);
        pos.current.set(id, next);
        el.style.opacity = '1';
        el.style.transform = `translate(${next.x}px, ${next.y}px) scale(${1 / Math.max(zoomRef.current, 0.01)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const selections = useMemo(() => {
    const out: { key: string; x: number; y: number; w: number; h: number; color: string; name: string }[] = [];
    for (const p of people) {
      for (const id of p.state.selection?.nodes ?? []) {
        const n = nodes.find((x) => x.id === id);
        if (!n) continue;
        const a = absolutePosition(nodes, n);
        const s = nodeSize(n);
        out.push({ key: `${p.clientId}-${id}`, x: a.x, y: a.y, w: s.width, h: s.height, color: p.user.color, name: p.user.name });
      }
    }
    return out;
  }, [people, nodes]);

  if (!people.length) return null;
  return (
    <ViewportPortal>
      <div className="presence-layer" data-testid="presence-layer" style={{ ['--z' as string]: zoom }}>
        {selections.map((s) => (
          <div key={s.key} className="remote-sel" data-testid="remote-selection" style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderColor: s.color, ['--c' as string]: s.color }}>
            <span className="remote-sel-tag" style={{ background: s.color, transform: `scale(${1 / Math.max(zoom, 0.01)})` }}>{s.name}</span>
          </div>
        ))}
        {people.map((p) =>
          p.state.cursor ? (
            <div
              key={p.clientId}
              ref={(el) => {
                if (el) els.current.set(p.clientId, el);
                else els.current.delete(p.clientId);
              }}
              className={`remote-cursor${p.state.audio?.speaking ? ' speaking' : ''}${p.state.laser ? ' laser' : ''}`}
              data-testid={`remote-cursor-${p.user.name}`}
              style={{ transform: `translate(${p.state.cursor.x}px, ${p.state.cursor.y}px) scale(${1 / Math.max(zoom, 0.01)})`, color: p.user.color }}
            >
              <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
                <path d="M1 1 L1 15 L5 11.5 L8 18.5 L10.6 17.4 L7.6 10.6 L13 10.6 Z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="remote-cursor-name" style={{ background: p.user.color }}>{p.user.name}</span>
            </div>
          ) : null,
        )}
      </div>
    </ViewportPortal>
  );
}

/** Publishes MY cursor, viewport and activity into the awareness state, and runs "follow user". Renders nothing. */
export function PresencePublisher() {
  const session = useCollabStore((s) => s.session);
  const { screenToFlowPosition, setViewport } = useReactFlow();
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const follow = useCollabStore((s) => s.follow);
  const people = useCollabStore((s) => s.people);
  const lastRect = useRef<string>('');

  // cursor + activity
  useEffect(() => {
    if (!session) return;
    let raf = 0;
    let latest: { x: number; y: number } | null = null;
    const root = document.querySelector('.canvas');
    const onMove = (e: PointerEvent) => {
      latest = { x: e.clientX, y: e.clientY };
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (latest) session.setCursor(screenToFlowPosition(latest));
        });
    };
    const onLeave = () => session.setCursor(null);
    const onActive = () => session.touch();
    root?.addEventListener('pointermove', onMove as EventListener);
    root?.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onActive);
    window.addEventListener('pointerdown', onActive);
    return () => {
      root?.removeEventListener('pointermove', onMove as EventListener);
      root?.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onActive);
      window.removeEventListener('pointerdown', onActive);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [session, screenToFlowPosition]);

  // my viewport (for the minimap of others and for people following me)
  useEffect(() => {
    if (!session || !width || !height) return;
    const rect = { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom };
    const key = JSON.stringify(rect);
    if (key === lastRect.current) return;
    lastRect.current = key;
    session.setViewport(rect);
  }, [session, tx, ty, zoom, width, height]);

  // follow: keep my view on theirs
  const lastFollowed = useRef('');
  useEffect(() => {
    if (follow.following === null || !width || !height) return;
    const p = people.find((x) => x.clientId === follow.following);
    const rect = p?.state.viewport;
    if (!rect) return;
    const k = JSON.stringify(rect);
    if (k === lastFollowed.current) return;
    lastFollowed.current = k;
    const t = followTransform(rect, { width, height });
    void setViewport(t, { duration: 120 });
  }, [follow, people, width, height, setViewport]);
  useEffect(() => {
    if (follow.following === null) lastFollowed.current = '';
  }, [follow.following]);

  // Esc stops following
  useEffect(() => {
    if (follow.following === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useCollabStore.getState().dispatchFollow({ type: 'escape' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [follow.following]);
  return null;
}

/** "Following Ann · Esc to stop" */
export function FollowBanner() {
  const follow = useCollabStore((s) => s.follow);
  const people = useCollabStore((s) => s.people);
  const p = follow.following === null ? null : people.find((x) => x.clientId === follow.following);
  if (!p) return null;
  return (
    <div className="follow-banner glass" role="status" data-testid="follow-banner" style={{ borderColor: p.user.color }}>
      <span className="follow-dot" style={{ background: p.user.color }} />
      {t('Following')} <strong>{p.user.name}</strong>
      <span className="muted">{t(' · Esc to stop')}</span>
      <button type="button" className="btn btn-ghost" onClick={() => useCollabStore.getState().dispatchFollow({ type: 'escape' })}>{t('Stop')}</button>
    </div>
  );
}

/** Rectangles of what the others are looking at, over the minimap (same viewBox the minimap computes for itself). */
export function MinimapPeers({ width, height, left, bottom }: { width: number; height: number; left: number; bottom: number }) {
  const people = useCollabStore((s) => s.people);
  const nodes = useDiagramStore((s) => s.nodes);
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const vw = useStore((s) => s.width);
  const vh = useStore((s) => s.height);
  const box = useMemo(() => {
    const view = { x: -tx / zoom, y: -ty / zoom, width: vw / zoom, height: vh / zoom };
    let b = view;
    const measured = nodes.filter((n) => (n.measured?.width ?? n.width) && !n.hidden);
    if (measured.length) {
      const nb = getNodesBounds(measured as never);
      const x1 = Math.min(nb.x, view.x);
      const y1 = Math.min(nb.y, view.y);
      b = { x: x1, y: y1, width: Math.max(nb.x + nb.width, view.x + view.width) - x1, height: Math.max(nb.y + nb.height, view.y + view.height) - y1 };
    }
    const scale = Math.max(b.width / width, b.height / height);
    const viewW = scale * width;
    const viewH = scale * height;
    const off = 5 * scale;
    return { x: b.x - (viewW - b.width) / 2 - off, y: b.y - (viewH - b.height) / 2 - off, w: viewW + off * 2, h: viewH + off * 2 };
  }, [nodes, tx, ty, zoom, vw, vh, width, height]);
  const shown = people.filter((p) => p.state.viewport);
  if (!shown.length || !vw) return null;
  return (
    <svg className="minimap-peers" data-testid="minimap-peers" style={{ left, bottom, width, height }} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-hidden>
      {shown.map((p) => (
        <rect key={p.clientId} x={p.state.viewport!.x} y={p.state.viewport!.y} width={p.state.viewport!.w} height={p.state.viewport!.h} fill={p.user.color} fillOpacity={0.12} stroke={p.user.color} strokeWidth={box.w / width * 1.5} />
      ))}
    </svg>
  );
}
