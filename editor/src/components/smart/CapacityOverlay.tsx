import { useEffect } from 'react';
import { ViewportPortal, useStore } from '@xyflow/react';
import { useCapacity } from '../../hooks/useCapacity';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1));

const esc = (id: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id);
/** the rendered SVG path of an edge (flow coordinates), when it is on screen */
const edgePathD = (id: string): string | null => (typeof document === 'undefined' ? null : document.querySelector(`.react-flow__edge[data-id="${esc(id)}"] path.react-flow__edge-path`)?.getAttribute('d') ?? null);
/** node size including the caption / badges that overflow below the node box */
const fullSize = (id: string, s: { width: number; height: number }) => {
  const el = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(`.react-flow__node[data-id="${esc(id)}"]`);
  return el ? { width: s.width, height: Math.max(s.height, el.scrollHeight) } : s;
};

/** Load and utilisation drawn over the canvas while the capacity panel is open: red = overloaded, amber = nearly full, plus the worst-case path. */
export function CapacityOverlay() {
  const open = useSmart((s) => s.capacity || s.metrics || s.simulating);
  // the worst-path line belongs to the capacity panel; during a simulation the moving packets show the flow
  const showPath = useSmart((s) => s.capacity);
  const result = useCapacity(open);
  const nodes = useDiagramStore((s) => s.nodes);
  const zoom = useStore((s) => s.transform[2]);
  const simulating = useSmart((s) => s.simulating);
  const setSimEdges = useSmart((s) => s.setSimEdges);
  // while simulating, tell the canvas which edges carry load (true = the target is overloaded / down)
  useEffect(() => {
    if (!simulating) return;
    const m: Record<string, boolean> = {};
    if (result) {
      for (const e of useDiagramStore.getState().edges) {
        const rps = result.edges[e.id]?.rps ?? 0;
        if (rps > 0) { const st = result.nodes[e.target]?.status; m[e.id] = st === 'over' || st === 'down'; }
      }
    }
    const cur = useSmart.getState().simEdges;
    const same = Object.keys(m).length === Object.keys(cur).length && Object.keys(m).every((k) => cur[k] === m[k]);
    if (!same) setSimEdges(m);
  }, [result, simulating, setSimEdges]);
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
  // follow the drawn edges (routed around nodes) instead of a straight line through the node centres
  const pathDs = (path?.edgeIds ?? []).map(edgePathD).filter((d): d is string => !!d);
  const pts = path?.nodeIds.map(center).filter((p): p is { x: number; y: number } => !!p) ?? [];
  return (
    <ViewportPortal>
      <div className="diff-layer cap-layer" data-testid="capacity-overlay">
        {nodes.map((n) => {
          const r = result.nodes[n.id];
          if (!r || (r.load === 0 && !r.chaos)) return null;
          const p = absolutePosition(nodes, n);
          const s = fullSize(n.id, nodeSize(n));
          return (
            <div key={n.id} className={`cap-box cap-${r.status}${r.chaos === 'slow' ? ' cap-slow-chaos' : ''}`} data-testid={`cap-${n.id}`} style={{ left: p.x, top: p.y, width: s.width, height: s.height, ['--z' as string]: zoom }}>
              <span className="cap-tag" style={{ transform: `scale(${sc})` }}>{r.assumed && <i className="cap-assumed" title="Assumed defaults for this role">~</i>}{r.status === 'down' ? 'DOWN' : `${fmt(r.load)} rps${r.utilization !== undefined ? ` · ${Number.isFinite(r.utilization) ? Math.round(r.utilization * 100) : '∞'}%` : ''}${r.chaos === 'slow' ? ' · slow' : ''}`}</span>
            </div>
          );
        })}
        {!showPath ? null : pathDs.length > 0 ? (
          <svg className="diff-lines" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}>
            {pathDs.map((d, i) => <path key={i} className="cap-path-line" d={d} fill="none" strokeWidth={4 * sc} strokeDasharray={`${8 * sc} ${6 * sc}`} />)}
          </svg>
        ) : pts.length > 1 && (
          <svg className="diff-lines" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}>
            <polyline className="cap-path-line" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={4 * sc} strokeDasharray={`${8 * sc} ${6 * sc}`} />
          </svg>
        )}
      </div>
    </ViewportPortal>
  );
}
