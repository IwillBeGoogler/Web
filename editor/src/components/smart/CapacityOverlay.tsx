import { ViewportPortal, useStore } from '@xyflow/react';
import { useCapacity } from '../../hooks/useCapacity';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Load and utilisation drawn over the canvas while the capacity panel is open: red = overloaded, amber = nearly full, plus the worst-case path. */
export function CapacityOverlay() {
  const open = useSmart((s) => s.capacity);
  const result = useCapacity(open);
  const nodes = useDiagramStore((s) => s.nodes);
  const zoom = useStore((s) => s.transform[2]);
  if (!open || !result) return null;
  const sc = 1 / Math.max(zoom, 0.01);
  const center = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return null;
    const p = absolutePosition(nodes, n);
    const s = nodeSize(n);
    return { x: p.x + s.width / 2, y: p.y + s.height / 2 };
  };
  const path = result.worstPath;
  const pts = path?.nodeIds.map(center).filter((p): p is { x: number; y: number } => !!p) ?? [];
  return (
    <ViewportPortal>
      <div className="diff-layer cap-layer" data-testid="capacity-overlay">
        {nodes.map((n) => {
          const r = result.nodes[n.id];
          if (!r || r.load === 0) return null;
          const p = absolutePosition(nodes, n);
          const s = nodeSize(n);
          return (
            <div key={n.id} className={`cap-box cap-${r.status}`} data-testid={`cap-${n.id}`} style={{ left: p.x, top: p.y, width: s.width, height: s.height, ['--z' as string]: zoom }}>
              <span className="cap-tag" style={{ transform: `scale(${sc})` }}>{fmt(r.load)} rps{r.utilization !== undefined ? ` · ${Math.round(r.utilization * 100)}%` : ''}</span>
            </div>
          );
        })}
        {pts.length > 1 && (
          <svg className="diff-lines" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}>
            <polyline className="cap-path-line" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={4 * sc} strokeDasharray={`${8 * sc} ${6 * sc}`} />
          </svg>
        )}
      </div>
    </ViewportPortal>
  );
}
