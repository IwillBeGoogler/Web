import { useEffect, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from '@xyflow/react';
import type { MarkerKind } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { nearestT, type Pt, type Rect, type Side } from '../../lib/routing/geometry';
import { addWaypoint, dragSegment, interiorPoints, moveWaypoint, removeWaypoint, segmentMidpoints, snapWaypoint } from '../../lib/routing/manual';
import type { Route } from '../../lib/routing';
import { labelPlacement } from '../../lib/routing/labelSide';
import { EdgeLabelChip } from './EdgeLabelChip';
import { EdgeMarker } from './markers';
import { useShownEdgeColor, useShownLabelColor } from '../../embed/canvasTheme';
import { useResolvedSettings } from '../../store/settingsStore';
import { arrowMetrics, markerBox, type ArrowSize } from '../../lib/arrow';

/** Everything the edge needs to draw itself; computed once per render for ALL edges (routing is global). */
export interface EdgeUi {
  route: Route;
  text: string;
  color: string;
  width: number;
  dash?: string;
  startMarker: MarkerKind;
  endMarker: MarkerKind;
  /** arrowhead size setting (S/M/L); the head scales with the stroke width */
  arrowSize?: ArrowSize;
  labelBg: boolean;
  /** ease the path to its new shape (only when no node is being dragged, so there is no lag during a drag) */
  animate?: boolean;
  labelColor?: string;
  labelBold?: boolean;
  labelSide?: 'auto' | 'on' | 'left' | 'right';
  locked: boolean;
  grid: number;
  waypoints: Pt[];
  /** other node rectangles, for alignment snapping of manual routes */
  alignX: number[];
  alignY: number[];
  /** hover tooltip: label + data-flow stats */
  tip?: string;
  /** UML: multiplicity and role-name chips near the two ends */
  endLabels?: import('../../lib/uml/labels').EndLabel[];
}

const asFlow = (screenToFlowPosition: (p: Pt) => Pt) => (e: { clientX: number; clientY: number }) => screenToFlowPosition({ x: e.clientX, y: e.clientY });

function sideAt(rect: Rect, p: Pt): Side {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const nx = (p.x - cx) / (rect.width / 2 || 1);
  const ny = (p.y - cy) / (rect.height / 2 || 1);
  return Math.abs(nx) >= Math.abs(ny) ? (nx >= 0 ? 'right' : 'left') : ny >= 0 ? 'bottom' : 'top';
}

/** Edges mounted alone (user added one) draw in; bulk mounts (load, page switch) stay static. */
const drawn = new Set<string>();
let lastMount = 0;
function isFreshMount(id: string): boolean {
  const now = performance.now();
  const fresh = !drawn.has(id) && drawn.size > 0 && now - lastMount > 300;
  drawn.add(id);
  lastMount = now;
  return fresh;
}

export function DiagramEdge({ id, data, selected }: EdgeProps) {
  const ui = data?.ui as EdgeUi | undefined;
  const paper = useResolvedSettings().canvas.background;
  const color = useShownEdgeColor(ui?.color ?? '#ffffff', paper);
  const labelColor = useShownLabelColor(ui?.labelColor ?? ui?.color ?? '#ffffff', paper);
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  const editingId = useUiStore((s) => s.editingId);
  const setEditing = useUiStore((s) => s.setEditing);
  const snapshot = useDiagramStore((s) => s.snapshot);
  const setEdgeRoute = useDiagramStore((s) => s.setEdgeRoute);
  const setLabelPosition = useDiagramStore((s) => s.setLabelPosition);
  const reconnectEdge = useDiagramStore((s) => s.reconnectEdge);
  const updateEdges = useDiagramStore((s) => s.updateEdges);
  const [ghost, setGhost] = useState<{ from: Pt; to: Pt } | null>(null);
  const [fresh, setFresh] = useState(() => isFreshMount(id));
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(false), 700);
    return () => clearTimeout(t);
  }, [fresh]);
  if (!ui) return null;
  const { route } = ui;
  const toFlow = asFlow(screenToFlowPosition);
  const mid = `${id}-m`;
  const startId = ui.startMarker !== 'none' ? `${mid}s` : undefined;
  const endId = ui.endMarker !== 'none' ? `${mid}e` : undefined;
  const style = { ...(ui.animate && route.d ? { d: `path("${route.d}")`, transition: 'd 110ms ease-out' } : {}), stroke: color, strokeWidth: ui.width, strokeDasharray: ui.dash, strokeLinecap: ui.dash === '2 5' ? ('round' as const) : undefined };
  const am = arrowMetrics(ui.width, ui.arrowSize);
  const canEdit = !ui.locked;

  const drag = (onMove: (pt: Pt, ev: PointerEvent) => void, onEnd?: (ev: PointerEvent) => void) => (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    snapshot(); // one history step for the whole drag
    const move = (ev: PointerEvent) => onMove(toFlow(ev), ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onEnd?.(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const snap = (p: Pt) => snapWaypoint(p, { grid: ui.grid, tol: 6, align: [...ui.alignX.map((x) => ({ x, y: Number.NaN })), ...ui.alignY.map((y) => ({ x: Number.NaN, y }))] });

  // outline the shape an endpoint would land on while it is dragged
  const markDropTarget = (ev: PointerEvent | null) => {
    document.querySelectorAll('.react-flow__node.edge-drop').forEach((el) => el.classList.remove('edge-drop'));
    if (!ev) return;
    const el = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.react-flow__node[data-id]')).find(Boolean);
    el?.classList.add('edge-drop');
  };

  // ---- handles ----
  const handles: React.ReactNode[] = [];
  if (selected && canEdit) {
    if (route.orthogonal) {
      segmentMidpoints(route.points).forEach((m) => {
        const a = route.points[m.index];
        const b = route.points[m.index + 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 24) return;
        const start = route.points;
        let origin: Pt | null = null;
        handles.push(
          <rect
            key={`seg-${m.index}`}
            className={`edge-handle seg ${m.horizontal ? 'h' : 'v'} nodrag nopan`}
            x={m.pt.x - (m.horizontal ? 7 : 3.5)}
            y={m.pt.y - (m.horizontal ? 3.5 : 7)}
            width={m.horizontal ? 14 : 7}
            height={m.horizontal ? 7 : 14}
            rx={2}
            data-testid={`segment-handle-${m.index}`}
            onPointerDown={(e) => {
              origin = toFlow(e);
              drag((pt) => {
                const o = origin ?? pt;
                const d = { x: pt.x - o.x, y: pt.y - o.y };
                // snap the coordinate the segment moves along (perpendicular to itself)
                const target = m.horizontal ? snap({ x: 0, y: a.y + d.y }).y : snap({ x: a.x + d.x, y: 0 }).x;
                const dd = m.horizontal ? { x: 0, y: Number.isNaN(target) ? d.y : target - a.y } : { x: Number.isNaN(target) ? d.x : target - a.x, y: 0 };
                setEdgeRoute(id, interiorPoints(dragSegment(start, m.index, dd)), false);
              })(e);
            }}
          />,
        );
      });
    } else {
      const chain = [route.points[0], ...ui.waypoints, route.points[route.points.length - 1]];
      ui.waypoints.forEach((w, i) =>
        handles.push(
          <circle
            key={`wp-${i}`}
            className="edge-handle wp nodrag nopan"
            cx={w.x}
            cy={w.y}
            r={5.5}
            data-testid={`waypoint-${i}`}
            onPointerDown={drag((pt) => setEdgeRoute(id, moveWaypoint(ui.waypoints, i, snap(pt)), false))}
            onDoubleClick={(e) => {
              e.stopPropagation();
              snapshot();
              setEdgeRoute(id, removeWaypoint(ui.waypoints, i), false);
            }}
          />,
        ),
      );
      chain.slice(1).forEach((b, i) => {
        const a = chain[i];
        handles.push(
          <circle
            key={`add-${i}`}
            className="edge-handle add nodrag nopan"
            cx={(a.x + b.x) / 2}
            cy={(a.y + b.y) / 2}
            r={4}
            data-testid={`add-waypoint-${i}`}
            onPointerDown={drag((pt) => setEdgeRoute(id, addWaypoint(ui.waypoints, i, snap(pt)), false))}
          />,
        );
      });
    }
    // endpoint handles: drag onto another node / handle to reconnect
    (['source', 'target'] as const).forEach((end) => {
      const p = end === 'source' ? route.src.pt : route.dst.pt;
      const fixed = end === 'source' ? route.dst.pt : route.src.pt;
      handles.push(
        <circle
          key={`end-${end}`}
          className="edge-handle end nodrag nopan"
          cx={p.x}
          cy={p.y}
          r={7}
          data-testid={`endpoint-${end}`}
          onPointerDown={drag(
            (pt, ev) => { setGhost({ from: fixed, to: pt }); markDropTarget(ev); },
            (ev) => {
              setGhost(null);
              markDropTarget(null);
              const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
              const nodeEl = stack.map((el) => el.closest?.('.react-flow__node[data-id]')).find(Boolean) as HTMLElement | undefined;
              const nodeId = nodeEl?.getAttribute('data-id');
              if (!nodeId) return;
              const handleEl = stack.find((el) => el.classList?.contains('react-flow__handle')) as HTMLElement | undefined;
              const handleSide = handleEl?.getAttribute('data-handleid') as Side | null | undefined;
              const n = getInternalNode(nodeId);
              const pt = toFlow(ev);
              const rect = n ? { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured?.width ?? 120, height: n.measured?.height ?? 90 } : undefined;
              const side = handleSide ?? (rect ? sideAt(rect, pt) : undefined);
              reconnectEdge(id, end === 'source' ? { source: nodeId, sourceSide: side } : { target: nodeId, targetSide: side });
            },
          )}
        />,
      );
    });
  }

  return (
    <>
      <defs>
        <EdgeMarker id={`${mid}s`} kind={ui.startMarker} color={color} length={markerBox(ui.startMarker, am).length} width={markerBox(ui.startMarker, am).width} />
        <EdgeMarker id={`${mid}e`} kind={ui.endMarker} color={color} length={markerBox(ui.endMarker, am).length} width={markerBox(ui.endMarker, am).width} />
      </defs>
      {ui.tip && <path d={route.d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }}><title>{ui.tip}</title></path>}
      <g className={fresh ? 'edge-new' : undefined}>
        <BaseEdge id={id} path={route.d} style={style} markerStart={startId ? `url(#${startId})` : undefined} markerEnd={endId ? `url(#${endId})` : undefined} interactionWidth={28} />
      </g>
      {ghost && <line className="edge-ghost" x1={ghost.from.x} y1={ghost.from.y} x2={ghost.to.x} y2={ghost.to.y} />}
      {handles}
      <EdgeLabelRenderer>
        <EdgeLabelChip
          text={ui.text}
          x={route.labelPt.x}
          y={route.labelPt.y}
          color={labelColor}
          bold={ui.labelBold}
          anchor={labelPlacement(route.points, route.labelPt, ui.labelSide).anchor}
          background={ui.labelBg}
          selected={selected}
          locked={ui.locked}
          editing={editingId === id}
          onEditingChange={(v) => !v && editingId === id && setEditing(null)}
          onCommit={(text) => updateEdges([id], { label: text })}
          onDragStart={snapshot}
          onDrag={(cx, cy) => {
            const t = nearestT(route.points, toFlow({ clientX: cx, clientY: cy }));
            setLabelPosition(id, Math.abs(t - 0.5) < 0.03 ? 0.5 : Math.round(t * 1000) / 1000, undefined, false);
          }}
        />
        {(ui.endLabels ?? []).map((l, i) => (
          <div
            key={`${l.end}-${l.kind}-${i}`}
            className={`uml-end-label ${l.kind}`}
            data-testid={`uml-label-${l.end}-${l.kind}`}
            style={{ transform: `translate(${l.anchor === 'center' ? '-50%' : l.anchor === 'end' ? '-100%' : '0'}, -50%) translate(${l.x}px, ${l.y}px)`, color: ui.labelColor ? labelColor : 'var(--canvas-ink, #2d3340)' }}
          >
            {l.text}
          </div>
        ))}
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { diagram: DiagramEdge };
