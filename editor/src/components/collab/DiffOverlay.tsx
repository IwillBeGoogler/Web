import { ViewportPortal, useStore } from '@xyflow/react';
import { useEffect } from 'react';
import { diffSummary, type Change } from '../../lib/versionDiff';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { useDiagramStore } from '../../store/diagramStore';
import { useDiffStore } from '../../versions/diffStore';
import { useTimeline } from '../../versions/timelineStore';
import { useSmart } from '../../store/smartStore';
import type { DiagramNode } from '../../types';
import { t } from '../../i18n';

type Rec = Record<string, unknown> & { id: string };
const asNode = (r: Rec): DiagramNode => r as unknown as DiagramNode;
const label = (r: Rec): string => String((r.data as { label?: unknown } | undefined)?.label || r.id);

/**
 * The version comparison drawn on the canvas, in flow space: added things get a green outline, removed ones a red dashed ghost at
 * their old position, changed ones an amber outline (edges: coloured straight lines between their nodes).
 */
export function DiffOverlay() {
  const diff = useDiffStore((s) => s.diff);
  const liveNodes = useDiagramStore((s) => s.nodes);
  const previewNodes = useTimeline((s) => s.preview?.nodes);
  const nodes = previewNodes ?? liveNodes; // while a past version is shown, positions come from it
  const zoom = useStore((s) => s.transform[2]);
  if (!diff) return null;
  const box = (r: Rec, all: DiagramNode[]) => {
    const n = asNode(r);
    const p = n.parentId ? absolutePosition(all.some((x) => x.id === n.id) ? all : [...all, n], n) : n.position;
    const s = nodeSize(n);
    return { x: p.x, y: p.y, w: s.width, h: s.height };
  };
  const center = (id: string, ...pools: Rec[][]) => {
    for (const pool of pools) {
      const r = pool.find((x) => x.id === id);
      if (r) {
        const b = box(r, nodes);
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      }
    }
    const live = nodes.find((n) => n.id === id);
    if (live) {
      const b = box(live as unknown as Rec, nodes);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
    return null;
  };
  const sc = 1 / Math.max(zoom, 0.01);
  const rect = (kind: 'added' | 'removed' | 'changed', r: Rec, extra = '') => {
    const b = box(r, nodes);
    return (
      <div key={`${kind}-${r.id}`} className={`diff-box diff-${kind}`} data-testid={`diff-${kind}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h, ['--z' as string]: zoom }}>
        <span className="diff-tag" style={{ transform: `scale(${sc})` }}>{kind === 'added' ? '+' : kind === 'removed' ? '−' : '~'} {label(r)}{extra}</span>
        {kind === 'removed' && <span className="diff-ghost-label" style={{ transform: `translate(-50%, -50%) scale(${sc})` }}>{label(r)}</span>}
      </div>
    );
  };
  const lines: { key: string; kind: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  const addEdge = (kind: string, e: Rec, pools: Rec[][]) => {
    const a = center(String(e.source), ...pools);
    const b = center(String(e.target), ...pools);
    if (a && b) lines.push({ key: `${kind}-${e.id}`, kind, a, b });
  };
  for (const e of diff.edges.added) addEdge('added', e, [diff.nodes.added, diff.nodes.changed.map((c: Change) => c.after)]);
  for (const e of diff.edges.removed) addEdge('removed', e, [diff.nodes.removed, diff.nodes.changed.map((c: Change) => c.before)]);
  for (const c of diff.edges.changed) addEdge('changed', c.after, [diff.nodes.changed.map((x: Change) => x.after)]);
  return (
    <ViewportPortal>
      <div className="diff-layer" data-testid="diff-overlay">
        {diff.nodes.removed.map((r) => rect('removed', r))}
        {diff.nodes.added.map((r) => rect('added', r))}
        {diff.nodes.changed.map((c) => rect('changed', c.after))}
        <svg className="diff-lines" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}>
          {lines.map((l) => (
            <line key={l.key} className={`diff-line diff-${l.kind}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} strokeWidth={3 * sc} />
          ))}
        </svg>
      </div>
    </ViewportPortal>
  );
}

/** "Comparing v3 → Current: ..." with the legend and a way out (Esc too) */
export function DiffBanner() {
  const reviewOpen = useSmart((s) => s.diff); // the review panel carries the title, legend and a way out itself
  const diff = useDiffStore((s) => s.diff);
  const from = useDiffStore((s) => s.from);
  const to = useDiffStore((s) => s.to);
  const timelineOpen = useTimeline((s) => s.open); // the timeline bar has its own legend and its own way out
  useEffect(() => {
    if (!diff || timelineOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useDiffStore.getState().clear();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diff, timelineOpen]);
  if (!diff || reviewOpen || timelineOpen) return null;
  return (
    <div className="diff-banner glass" role="status" data-testid="diff-banner">
      <strong>{from} → {to}</strong>
      <span className="diff-legend"><i className="diff-dot added" /> {t('added')} <i className="diff-dot removed" /> {t('removed')} <i className="diff-dot changed" /> {t('changed')}</span>
      <span className="muted">{diffSummary(diff)}</span>
      <button type="button" className="btn btn-ghost" onClick={() => useDiffStore.getState().clear()}>{t('Exit comparison')}</button>
    </div>
  );
}
