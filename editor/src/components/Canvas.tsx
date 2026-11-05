import { editNewNode } from '../lib/editOnAdd';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react';
import {
  Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, SelectionMode, ViewportPortal, useReactFlow, useStore, type Node,
} from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useEditorSession } from '../sync/status';
import { useResolvedSettings } from '../store/settingsStore';
import { useUsageStore } from '../store/usageStore';
import { junctionJoins } from '../lib/junction';
import { resolveMarkers } from '../lib/arrow';
import { nodeTypes } from './nodes';
import { DRAG_MIME } from './Sidebar';
import { createNodesFromPaletteItem, getItem } from '../data/palette';
import { newId, styleEdge } from '../lib/graph';
import { createNodeForTool, rectFromPoints, type Pt, type Tool } from '../lib/shapes';
import { useBoardStore } from '../store/boardStore';
import { flowRef } from '../lib/board/flowRef';
import { dropIndex, reorderChild } from '../lib/autolayout/autolayout';
import { dropTarget } from '../lib/board/mindmapOps';
import { mmDrop } from '../lib/board/actions';
import { addFrameFor, commitStroke, createMindMapAt, createStickyAt, eraseAt, stampAt } from '../lib/board/actions';
import { outlinePath } from '../lib/board/freehand';
import { contentInFrame, parseFrameHash } from '../lib/board/frames';
import { useZoomToFrame } from '../hooks/useZoomToFrame';
import { PresenterFollow } from './board/PresenterFollow';
import { usePresenterFollow } from '../lib/board/followStore';
import { ReactionLayer } from './board/ReactionLayer';
import { useLayoutStore } from '../store/layoutStore';
import { projectEdges } from '../clusters/collapse';
import { rectOf } from '../lib/routing';
import { useRoutes } from './useRoutes';
import { shouldVirtualize } from '../lib/virtualize';
import { resolveEdgeStyle } from '../lib/settings';
import { edgeTypes, type EdgeUi } from './edges/DiagramEdge';
import { isContainer } from '../lib/graph';
import { computeGuides, type GuideLine } from '../lib/guides';
import { absolutePosition, nodeSize } from '../lib/graph';
import type { DiagramNode } from '../types';
import { FlowLayer } from './FlowLayer';
import { COMPONENT_MIME } from './design/ComponentLibrary';
import { executeAction } from '../lib/actions';
import { GuideLines, MeasureLines, Rulers, useAltKey } from './design/PrecisionLayer';
import { dragDistances, measureBetween, snapToGuides, type Measure } from '../lib/precision/precision';
import { effectiveHiddenIds } from '../lib/layers/layers';
import { followLink, zoomToNode } from '../lib/design/actions';
import { parseNodeHash } from '../lib/links/links';
import { FollowBanner, MinimapPeers, PresenceLayer, PresencePublisher } from './collab/PresenceLayer';
import { useCollabStore } from '../collab/store';
import { CommentCapture, CommentPins } from './collab/CommentPins';
import { DiffBanner, DiffOverlay } from './collab/DiffOverlay';
import { previewEdgesChange, previewNodesChange, useTimeline } from '../versions/timelineStore';
import { CapacityOverlay } from './smart/CapacityOverlay';
import { flowRegistry } from '../lib/flow/registry';
import { collectFlowPaths, flowTip, traceEdges } from '../lib/flow/build';
import { traceFlow } from '../lib/flow/trace';
import { relationOf } from '../lib/er/tableData';
import { endLabels } from '../lib/uml/labels';
import { canvasInk, isDarkBackground } from '../lib/contrast';
import { useShownCanvasBackground, useSkyPaper } from '../embed/canvasTheme';
import { loadSketchFont, SKETCH_DEFS_ID, SKETCH_DEFS_INNER, SKETCH_FILTER_NODE_LIMIT } from '../lib/sketch';
import '../styles/sketch.css';
import { ErSqlPanel } from './er/ErSqlPanel';
import { DEFAULT_VIEWPORT, FALLBACK_SIZE, initialViewport } from '../lib/viewport';

/** Clicking the canvas takes focus away from inspector / rename inputs so Delete, Backspace and arrows act on the diagram again. */
function blurInputs(target: EventTarget | null) {
  const t = target as HTMLElement | null;
  if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return; // typing in an on-canvas editor
  const a = document.activeElement as HTMLElement | null;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}

const DRAW_TOOLS: Tool[] = ['rect', 'ellipse', 'diamond', 'text', 'sticky', 'pen', 'highlighter', 'eraser', 'frame', 'mindmap', 'stamp'];
const FREEHAND: Tool[] = ['pen', 'highlighter'];

export function Canvas() {
  // a past version drawn by the timeline replaces the live nodes / edges for display only: the document itself is never touched
  const preview = useTimeline((s) => s.preview);
  // the version timeline bar (bottom, centred, up to 880px wide) would cover the minimap: lift the map above it while the bar is open
  const timelineOpen = useTimeline((s) => s.open);
  const [barLift, setBarLift] = useState<number | null>(null);
  const mapBottom = timelineOpen ? (barLift ?? 280) : 76; // 280 until the bar is measured
  const liveNodes = useDiagramStore((s) => s.nodes);
  const liveEdges = useDiagramStore((s) => s.edges);
  const nodes = preview ? preview.nodes : liveNodes;
  const edges = preview ? preview.edges : liveEdges;
  const liveOnNodesChange = useDiagramStore((s) => s.onNodesChange);
  const liveOnEdgesChange = useDiagramStore((s) => s.onEdgesChange);
  const onNodesChange = preview ? previewNodesChange : liveOnNodesChange;
  const onEdgesChange = preview ? previewEdgesChange : liveOnEdgesChange;
  const connect = useDiagramStore((s) => s.connect);
  const addNode = useDiagramStore((s) => s.addNode);
  const addNodes = useDiagramStore((s) => s.placeNodes);
  const snapshot = useDiagramStore((s) => s.snapshot);
  const endDrag = useDiagramStore((s) => s.endDrag);
  const selectOnly = useDiagramStore((s) => s.selectOnly);
  const tool = useUiStore((s) => s.tool);
  const readOnly = useEditorSession((s) => s.readOnly) || !!preview;
  const setTool = useUiStore((s) => s.setTool);
  const showGrid = useUiStore((s) => s.showGrid);
  const umlAnchorRows = useUiStore((s) => s.umlAnchorRows);
  const snap = useUiStore((s) => s.snap);
  const openMenu = useUiStore((s) => s.openMenu);
  const settings = useResolvedSettings();
  const canvasBg = useShownCanvasBackground(settings.canvas.background);
  const skyPaper = useSkyPaper(settings.canvas.background);
  const sketch = settings.canvas.sketch;
  useEffect(() => { if (sketch) void loadSketchFont(); }, [sketch]);
  const rf = useReactFlow();
  const { screenToFlowPosition, setViewport } = rf;
  useEffect(() => { flowRef.current = rf; return () => { if (flowRef.current === rf) flowRef.current = null; }; }, [rf]);
  const activePageId = useDiagramStore((s) => s.activePageId);
  const projectId = useDiagramStore((s) => s.projectId);
  const setPageViewport = useDiagramStore((s) => s.setPageViewport);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** sketch look: a data attribute (not React state / className) so a pan or drag does not re-render; styles/sketch.css drops the filter while it is set */
  const setMoving = (on: boolean) => { const el = wrapRef.current; if (el) { if (on) el.setAttribute('data-moving', ''); else el.removeAttribute('data-moving'); } };
  // lift the minimap by the measured height of the timeline bar (its content grows with details / wrapping), not a fixed guess
  useEffect(() => {
    if (!timelineOpen) { setBarLift(null); return; }
    let ro: ResizeObserver | null = null;
    let raf = 0;
    const attach = () => {
      const bar = document.querySelector<HTMLElement>('[data-testid="version-timeline"]');
      const wrap = wrapRef.current;
      if (!bar || !wrap) { raf = requestAnimationFrame(attach); return; }
      const measure = () => {
        const top = bar.getBoundingClientRect().top;
        const bottom = wrap.getBoundingClientRect().bottom;
        if (bottom > top) setBarLift(Math.ceil(bottom - top) + 12);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(bar); ro.observe(wrap); }
    };
    attach();
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [timelineOpen]);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const showMinimap = useUiStore((s) => s.showMinimap);
  const zoom = useStore((s) => s.transform[2]);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const setNodePosition = useDiagramStore((s) => s.setNodePosition);
  const gridOpacity = Math.max(0, Math.min(1, (zoom - 0.25) / 0.5));
  const rulersOn = useUiStore((st) => st.rulers);
  const alt = useAltKey();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragMeasures, setDragMeasures] = useState<Measure[]>([]);
  const presenting = useBoardStore((st) => !!st.presenting);

  // 100% zoom on open / new page / tab switch: saved viewport, else centre the content (pan only, no scale).
  useEffect(() => {
    const st = useDiagramStore.getState();
    const el = wrapRef.current;
    const size = el && el.clientWidth ? { width: el.clientWidth, height: el.clientHeight } : FALLBACK_SIZE;
    const lay = useLayoutStore.getState();
    const vp = initialViewport(st.nodes, st.viewports[st.activePageId], size, { top: 76, bottom: 70, left: lay.sidebarOpen ? 300 : 0, right: lay.inspectorOpen ? 300 : 0 });
    void setViewport(vp);
    if (!st.viewports[st.activePageId]) setPageViewport(st.activePageId, vp);
  }, [activePageId, projectId, setViewport, setPageViewport]);

  const grid = settings.canvas.gridSize;
  const snapPt = useCallback((p: Pt): Pt => (snap ? { x: Math.round(p.x / (grid / 2)) * (grid / 2), y: Math.round(p.y / (grid / 2)) * (grid / 2) } : p), [snap, grid]);

  // routing runs on a deferred copy of the nodes so dragging stays smooth (routes catch up within a frame)
  const routedNodes = useDeferredValue(nodes);
  const projected = useMemo(() => projectEdges(routedNodes, edges), [routedNodes, edges]);
  const routingOpts = useMemo(
    () => ({ jumps: settings.edge.jumps, cornerRadius: settings.edge.cornerRadius, pad: 12, keepManual: settings.edge.keepManual, autoRoute: settings.edge.autoRoute, budgetMs: 8, edgeDefaults: settings.edge, nodeDefaults: settings.node, umlAnchorRows }),
    [settings.edge, settings.node, umlAnchorRows],
  );
  const routes = useRoutes(routedNodes, projected, routingOpts);
  // ---- data flow (packets on every edge) + "trace path" ----
  const pageFlow = useDiagramStore((s) => !!s.pageFlow[s.activePageId]);
  const traceNodeId = useUiStore((s) => s.traceNodeId);
  const setTrace = useUiStore((s) => s.setTrace);
  const flowPaths = useMemo(() => collectFlowPaths(routedNodes, projected, routes, settings, pageFlow), [routedNodes, projected, routes, settings, pageFlow]);
  useEffect(() => { flowRegistry.paths = pageFlow ? flowPaths : []; return () => { flowRegistry.paths = []; }; }, [flowPaths, pageFlow]);
  const trace = useMemo(() => (pageFlow && traceNodeId ? traceFlow(traceNodeId, traceEdges(projected, settings)) : null), [pageFlow, traceNodeId, projected, settings]);
  const traceVisible = useMemo(() => (trace ? (p: { edgeIds: string[] }) => p.edgeIds.some((id) => trace.edgeIds.has(id)) : undefined), [trace]);
  // ER focus: one selected table lights itself, the tables it is joined to and those relations; the rest dims
  const erFocus = useMemo(() => {
    const sel = nodes.filter((n) => n.selected);
    if (sel.length !== 1 || sel[0].type !== 'table') return null;
    const id = sel[0].id;
    const rels = edges.filter((e) => !e.hidden && relationOf(e) && (e.source === id || e.target === id));
    if (!rels.length) return null;
    return { nodeIds: new Set([id, ...rels.flatMap((e) => [e.source, e.target])]), edgeIds: new Set(rels.map((e) => e.id)) };
  }, [nodes, edges]);
  const spot = trace ?? erFocus;
  const isDragging = useMemo(() => routedNodes.some((n) => n.dragging), [routedNodes]);
  const hiddenIds = useMemo(() => effectiveHiddenIds(routedNodes), [routedNodes]);
  const displayEdges = useMemo(() => {
    const rects = projected.some((e) => e.selected) ? routedNodes.filter((n) => !n.hidden && !isContainer(n)).map((n) => ({ id: n.id, r: rectOf(routedNodes, n) })) : [];
    // composite foreign key: when one column pair is selected, its siblings light up too
    const hotGroups = new Set(projected.filter((e) => e.selected).map((e) => relationOf(e)?.group).filter(Boolean));
    return projected.map((e) => {
      const styled = styleEdge(e, settings.edge);
      const route = routes.get(e.id);
      if (!route || hiddenIds.has(e.source) || hiddenIds.has(e.target)) return { ...styled, hidden: true };
      const v = resolveEdgeStyle(e.data ?? {}, settings);
      const markers = resolveMarkers(routedNodes, e, v.arrows);
      // alignment guides are only used while dragging a bend of the selected edge: skip the O(nodes) work for the rest
      const others = e.selected ? rects.filter((x) => x.id !== e.source && x.id !== e.target) : [];
      const grp = relationOf(e)?.group;
      const sibling = !!grp && !e.selected && hotGroups.has(grp);
      const ui: EdgeUi = {
        route,
        text: typeof e.label === 'string' ? e.label : '',
        color: sibling ? '#5b5bf7' : v.color,
        width: sibling ? v.width + 0.8 : v.width,
        dash: (styled.style as { strokeDasharray?: string } | undefined)?.strokeDasharray,
        startMarker: markers.start,
        endMarker: markers.end,
        arrowSize: settings.edge.arrowSize,
        labelBg: v.labelBackground,
        animate: !isDragging,
        tip: flowTip(e, route, settings, pageFlow),
        endLabels: e.data?.uml ? endLabels(route.points, e.data.uml, { startCut: route.startCut, endCut: route.endCut }) : undefined,
        labelColor: e.data?.labelColor,
        labelBold: e.data?.labelBold,
        labelSide: e.data?.labelSide,
        locked: !!e.data?.locked,
        grid: snap ? settings.canvas.gridSize / 2 : 0,
        waypoints: e.data?.waypoints ?? [],
        alignX: others.flatMap((o) => [o.r.x, o.r.x + o.r.width / 2, o.r.x + o.r.width]),
        alignY: others.flatMap((o) => [o.r.y, o.r.y + o.r.height / 2, o.r.y + o.r.height]),
      };
      const dim = spot && !spot.edgeIds.has(e.id) ? ' flow-dim' : '';
      return { ...styled, className: `${styled.className ?? ''}${dim}`.trim() || undefined, type: 'diagram', label: undefined, markerStart: undefined, markerEnd: undefined, style: undefined, data: { ...styled.data, ui } };
    });
  }, [projected, routes, routedNodes, settings, snap, isDragging, pageFlow, spot, hiddenIds]);
  const measures = useMemo(() => {
    if (!alt || !hoverId) return [];
    const sel = nodes.filter((n) => n.selected);
    if (!sel.length || sel.some((n) => n.id === hoverId)) return [];
    const target = nodes.find((n) => n.id === hoverId);
    if (!target) return [];
    const rects = sel.map((n) => ({ ...absolutePosition(nodes, n), ...nodeSize(n) }));
    const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
    const box = { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y };
    return measureBetween(box, { ...absolutePosition(nodes, target), ...nodeSize(target) });
  }, [alt, hoverId, nodes]);
  const hot = useMemo(() => new Set(edges.filter((e) => e.selected).flatMap((e) => [e.source, e.target])), [edges]);
  // junctions draw a tiny dot in the edge colour where 3+ edges meet (or two turn a corner), so the bus reads as one seamless line
  const joins = useMemo(() => junctionJoins(routedNodes, projected, routes, (id) => resolveEdgeStyle(projected.find((x) => x.id === id)?.data ?? {}, settings).color), [routedNodes, projected, routes, settings]);
  const displayNodes = useMemo(() => {
    const withJoins = joins.size ? nodes.map((n) => (joins.has(n.id) ? { ...n, data: { ...n.data, join: joins.get(n.id) } } : n)) : nodes;
    const base = hot.size ? withJoins.map((n) => (hot.has(n.id) ? { ...n, className: 'edge-endpoint' } : n)) : withJoins;
    const hid = effectiveHiddenIds(nodes);
    const shown = hid.size ? base.map((n) => (hid.has(n.id) ? { ...n, hidden: true, selected: false } : n)) : base;
    return spot ? shown.map((n) => (spot.nodeIds.has(n.id) || isContainer(n) ? (n.id === traceNodeId ? { ...n, className: `${n.className ?? ''} flow-trace-root`.trim() } : n) : { ...n, className: `${n.className ?? ''} flow-dim`.trim() })) : shown;
  }, [nodes, joins, hot, spot, traceNodeId]);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const comp = e.dataTransfer.getData(COMPONENT_MIME);
      if (comp) {
        e.preventDefault();
        executeAction(`insert-component:${comp}`, { at: snapPt(screenToFlowPosition({ x: e.clientX, y: e.clientY })) });
        return;
      }
      const item = getItem(e.dataTransfer.getData(DRAG_MIME));
      if (!item) return;
      const p = snapPt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      useUsageStore.getState().recordUse(item.id);
      if (item.kind === 'cluster' && item.profileId) return useUiStore.getState().setWizard({ profileId: item.profileId, at: p }); // drop a cluster profile -> wizard
      const made = createNodesFromPaletteItem(item, p, newId);
      addNodes(made);
      editNewNode(made);
    },
    [addNodes, screenToFlowPosition, snapPt],
  );

  const menuAt = (e: { clientX: number; clientY: number }) => screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // ---------- drawing overlay ----------
  type Drag = { a: Pt; b: Pt; pts: Pt[]; press: number[]; screen: Pt[] };
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // events can arrive faster than renders: the gesture lives in the ref
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const [hover, setHover] = useState<Pt | null>(null);
  const lastCreate = useRef<{ t: number; at: Pt } | null>(null);
  const drawing = DRAW_TOOLS.includes(tool) && !readOnly;
  const penSize = useBoardStore((s) => s.penSize);
  const hlSize = useBoardStore((s) => s.hlSize);
  const penColor = useBoardStore((s) => s.penColor);
  const hlColor = useBoardStore((s) => s.hlColor);
  const eraserSize = useBoardStore((s) => s.eraserSize);
  const local = (e: RPointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pressureOf = (e: RPointerEvent) => (e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const f = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (tool === 'eraser') {
      snapshot();
      eraseAt(f, eraserSize / Math.max(zoom, 0.05), false);
    }
    setDrag({ a: f, b: f, pts: [f], press: [pressureOf(e)], screen: [local(e)] });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (tool === 'eraser') setHover(local(e));
    const drag = dragRef.current;
    if (!drag) return;
    const evs = FREEHAND.includes(tool) && e.nativeEvent.getCoalescedEvents?.().length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const r = wrapRef.current!.getBoundingClientRect();
    const fl = evs.map((ev) => ({ f: screenToFlowPosition({ x: ev.clientX, y: ev.clientY }), s: { x: ev.clientX - r.left, y: ev.clientY - r.top }, p: ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure) : 0.5 }));
    const last = fl[fl.length - 1];
    if (tool === 'eraser') {
      for (const x of fl) eraseAt(x.f, eraserSize / Math.max(zoom, 0.05), false);
      return setDrag({ ...drag, b: last.f });
    }
    if (FREEHAND.includes(tool)) return setDrag({ ...drag, b: last.f, pts: [...drag.pts, ...fl.map((x) => x.f)], press: [...drag.press, ...fl.map((x) => x.p)], screen: [...drag.screen, ...fl.map((x) => x.s)] });
    setDrag({ ...drag, b: last.f, screen: [drag.screen[0], last.s] });
  };
  const up = () => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (tool === 'eraser') return;
    if (FREEHAND.includes(tool)) {
      commitStroke(d.pts.map((p, i) => ({ x: p.x, y: p.y, p: d.press[i] ?? 0.5 })), tool as 'pen' | 'highlighter');
      return;
    }
    const click = Math.hypot(d.screen[1] ? d.screen[1].x - d.screen[0].x : 0, d.screen[1] ? d.screen[1].y - d.screen[0].y : 0) < 5;
    const a = snapPt(d.a);
    const rect = rectFromPoints(a, snapPt(d.b), tool === 'text' ? { width: 120, height: 30 } : undefined);
    if (tool === 'sticky') {
      const now = Date.now();
      const prev = lastCreate.current;
      lastCreate.current = { t: now, at: a };
      if (prev && now - prev.t < 450 && Math.hypot(prev.at.x - a.x, prev.at.y - a.y) < 12) return; // a double-click makes ONE sticky
      if (click) createStickyAt(a);
      else createStickyAt({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, rect);
      return; // the sticky tool stays on: click again for the next one
    }
    if (tool === 'stamp') {
      stampAt(a, useBoardStore.getState().stampEmoji);
      return;
    }
    if (tool === 'mindmap') {
      createMindMapAt(a);
      setTool('select');
      return;
    }
    if (tool === 'frame') {
      if (click) addFrameFor(a);
      else addFrameFor(a, rect);
      setTool('select');
      return;
    }
    const node: DiagramNode | null = createNodeForTool(tool, rect, newId('n'));
    if (node) {
      addNode(node);
      selectOnly('node', node.id);
      if (node.type === 'text') useUiStore.getState().setEditing(node.id);
    }
    setTool('select');
  };
  const previewPath = useMemo(() => {
    if (!drag || !FREEHAND.includes(tool)) return '';
    const size = (tool === 'pen' ? penSize : hlSize) * Math.max(zoom, 0.05);
    return outlinePath(drag.screen.map((p, i) => ({ x: p.x, y: p.y, p: drag.press[i] ?? 0.5 })), tool === 'pen' ? { size } : { size, thinning: 0, streamline: 0.6, simulatePressure: false });
  }, [drag, tool, penSize, hlSize, zoom]);

  // ---------- frames: deep link (#frame=<id>) and dragging a frame with what is inside it ----------
  const { zoomToFrame } = useZoomToFrame();
  const [linkTick, setLinkTick] = useState(0);
  const pendingFrame = useRef<string | null>(null);
  useEffect(() => {
    const read = () => { pendingFrame.current = parseFrameHash(window.location.hash); setLinkTick((t) => t + 1); };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [projectId, activePageId]);
  useEffect(() => {
    const id = pendingFrame.current;
    if (!id || !nodes.some((n) => n.id === id && n.type === 'frame')) return;
    pendingFrame.current = null;
    const t = setTimeout(() => { zoomToFrame(id, { duration: 0 }); useDiagramStore.getState().selectOnly('node', id); }, 30);
    return () => clearTimeout(t);
  }, [nodes, linkTick, zoomToFrame]);
  // links: `#node=<id>` (from "Go to main", a prototype link or a backlink) selects and zooms to that node once the file is open
  const pendingNode = useRef<string | null>(null);
  useEffect(() => { pendingNode.current = parseNodeHash(window.location.hash); setLinkTick((t) => t + 1); }, [projectId]);
  useEffect(() => {
    const id = pendingNode.current;
    if (!id || !nodes.some((n) => n.id === id)) return;
    pendingNode.current = null;
    const t = setTimeout(() => zoomToNode(id), 60);
    return () => clearTimeout(t);
  }, [nodes, linkTick]);
  const frameDrag = useRef<{ id: string; from: Pt; members: Map<string, Pt> } | null>(null);

  // arrow tool: press anywhere on a shape and drag to another shape to connect them (dots are tiny on collapsed / small nodes)
  const [arrowDrag, setArrowDrag] = useState<{ source: string; a: Pt; b: Pt } | null>(null);
  const nodeIdAt = (x: number, y: number) =>
    (document.elementsFromPoint(x, y).map((el) => el.closest?.('.react-flow__node[data-id]')).find(Boolean) as HTMLElement | undefined)?.getAttribute('data-id') ?? null;
  const toWrap = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const arrowDown = (e: RPointerEvent) => {
    if (tool !== 'arrow' || readOnly || e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest('.react-flow__handle')) return; // dot drag stays React Flow's own
    const source = el.closest('.react-flow__node[data-id]')?.getAttribute('data-id');
    if (!source) return;
    e.stopPropagation();
    e.preventDefault();
    const p = toWrap(e);
    setArrowDrag({ source, a: p, b: p });
    const onMove = (ev: PointerEvent) => setArrowDrag((d) => (d ? { ...d, b: toWrap(ev) } : d));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setArrowDrag(null);
      const target = nodeIdAt(ev.clientX, ev.clientY);
      if (target && target !== source) connect({ source, sourceHandle: null, target, targetHandle: null });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={(e) => { blurInputs(e.target); arrowDown(e); }}
      className={`canvas tool-${tool}${canvasBg === 'transparent' ? ' transparent-bg' : ''}${isDarkBackground(canvasBg) ? ' canvas-dark' : ''}${skyPaper ? ' canvas-sky' : ''}${sketch ? ` canvas-sketch${nodes.length > SKETCH_FILTER_NODE_LIMIT ? ' sketch-nofilter' : ''}` : ''}`}
      style={{ ...(canvasBg === 'transparent' ? {} : { background: canvasBg }), ['--canvas-bg' as string]: canvasBg === 'transparent' ? '#ffffff' : canvasBg, ['--canvas-ink' as string]: canvasInk(canvasBg === 'transparent' ? '#ffffff' : canvasBg) }}>
      {sketch && <svg id={SKETCH_DEFS_ID} width={0} height={0} aria-hidden focusable={false} style={{ position: 'absolute' }} dangerouslySetInnerHTML={{ __html: SKETCH_DEFS_INNER }} />}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements={shouldVirtualize(nodes.length)}
        // React Flow's own arrow-key move would double our nudge (and ignore undo); keyboard editing lives in lib/a11y/keyboard.ts and useShortcuts
        disableKeyboardA11y
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        connectionRadius={12}
        onConnectEnd={(ev, state) => {
          // ER: drop a dragged column anywhere on a table (not only on a handle) to reference it
          if (state.isValid || !state.fromNode) return;
          const pt = 'changedTouches' in ev ? ev.changedTouches[0] : (ev as MouseEvent);
          const stack = document.elementsFromPoint(pt.clientX, pt.clientY);
          const nodeEl = stack.map((el) => el.closest?.('.react-flow__node[data-id]')).find(Boolean) as HTMLElement | undefined;
          const targetId = nodeEl?.getAttribute('data-id');
          if (!targetId) return;
          const target = useDiagramStore.getState().nodes.find((n) => n.id === targetId);
          if (!target) return;
          if (state.fromNode.type !== 'table' || target.type !== 'table') {
            // any shape: dropping the line anywhere on another shape (not only on its dot) connects them
            if (targetId !== state.fromNode.id && state.fromNode.type !== 'table') connect({ source: state.fromNode.id, sourceHandle: state.fromHandle?.id ?? null, target: targetId, targetHandle: null });
            return;
          }
          const row = stack.map((el) => el.closest?.('[data-col]')).find(Boolean) as HTMLElement | undefined;
          const handle = state.fromHandle?.id ?? '';
          const childCol = /^c\d+-[lr]$/.test(handle) ? handle.slice(0, handle.lastIndexOf('-')) : undefined;
          const parentCol = row?.getAttribute('data-col') ?? undefined;
          if (targetId === state.fromNode.id && (!parentCol || parentCol === childCol)) return;
          useDiagramStore.getState().connectTables({ childId: state.fromNode.id, childCol, parentId: targetId, parentCol });
        }}
        onNodeDragStart={(_, node) => {
          setMoving(true);
          snapshot();
          // lines on a moved shape turn to whichever side faces their other end (mind maps keep their own sides)
          if (node.type !== 'mindmap') {
            const moving = new Set(useDiagramStore.getState().nodes.filter((n) => n.selected || n.id === node.id).map((n) => n.id));
            useDiagramStore.setState((s) => ({ edges: s.edges.map((e) => (moving.has(e.source) || moving.has(e.target)) && (e.data?.pinSource || e.data?.pinTarget) && !e.data?.locked ? { ...e, sourceHandle: undefined, targetHandle: undefined, data: { ...e.data, pinSource: undefined, pinTarget: undefined } } : e) }));
          }
          frameDrag.current = null;
          const all = useDiagramStore.getState().nodes;
          const me = all.find((n) => n.id === node.id);
          if (me?.type === 'frame') frameDrag.current = { id: me.id, from: { ...me.position }, members: new Map(contentInFrame(all, me).filter((n) => !n.selected && !n.data.locked).map((n) => [n.id, { ...n.position }])) };
        }}
        onNodeDrag={(ev, node) => {
          if (node.type === 'mindmap') {
            // mind map: highlight the node you would drop onto (it becomes the parent)
            const all = useDiagramStore.getState();
            const t = dropTarget(all.nodes, all.edges, node.id, screenToFlowPosition({ x: (ev as MouseEvent).clientX, y: (ev as MouseEvent).clientY }));
            useUiStore.getState().setMmDrop(t?.kind === 'parent' ? t.id : null);
            return;
          }
          const fd = frameDrag.current;
          if (fd && fd.id === node.id) {
            const dx = node.position.x - fd.from.x;
            const dy = node.position.y - fd.from.y;
            useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => (fd.members.has(n.id) ? { ...n, position: { x: fd.members.get(n.id)!.x + dx, y: fd.members.get(n.id)!.y + dy } } : n)) }));
            return;
          }
          const all = useDiagramStore.getState().nodes;
          const me = all.find((n) => n.id === node.id);
          if (!me || isContainer(me)) return setGuides([]);
          const abs = absolutePosition(all, me);
          const sz = nodeSize(me);
          const others = all.filter((n) => n.id !== node.id && !n.selected && n.parentId === me.parentId && !isContainer(n)).map((n) => {
            const p = absolutePosition(all, n);
            const s2 = nodeSize(n);
            return { x: p.x, y: p.y, width: s2.width, height: s2.height };
          });
          const g = computeGuides({ x: abs.x, y: abs.y, width: sz.width, height: sz.height }, others, 5 / Math.max(zoom, 0.25));
          setGuides(g.lines);
          let dx = g.dx;
          let dy = g.dy;
          const ruled = rulersOn ? useDiagramStore.getState().guides[useDiagramStore.getState().activePageId] ?? [] : [];
          if (ruled.length) {
            const sn = snapToGuides({ x: abs.x + dx, y: abs.y + dy, width: sz.width, height: sz.height }, ruled, 6 / Math.max(zoom, 0.25));
            dx += sn.dx;
            dy += sn.dy;
          }
          // distances to the nearest neighbours while dragging
          const rectsAll = all.filter((n) => n.id !== node.id && !n.selected && !n.hidden && !n.data.hidden && !isContainer(n)).map((n) => ({ ...absolutePosition(all, n), ...nodeSize(n) }));
          setDragMeasures(dragDistances({ x: abs.x + dx, y: abs.y + dy, width: sz.width, height: sz.height }, rectsAll));
          if (dx || dy) setNodePosition(node.id, { x: me.position.x + dx, y: me.position.y + dy });
        }}
        onNodeDragStop={(ev, node, dragged: Node[]) => {
          setMoving(false);
          setGuides([]);
          setDragMeasures([]);
          if (node.type === 'mindmap') {
            useUiStore.getState().setMmDrop(null);
            mmDrop(node.id, screenToFlowPosition({ x: (ev as MouseEvent).clientX, y: (ev as MouseEvent).clientY })); // re-parent / reorder, then the layout puts everything back
            return;
          }
          frameDrag.current = null;
          dragged.forEach((n) => endDrag(n.id));
          const dropped = useDiagramStore.getState().nodes.find((x) => x.id === node.id);
          const owner = dropped?.parentId ? useDiagramStore.getState().nodes.find((x) => x.id === dropped.parentId) : undefined;
          if (dropped && owner?.data.autoLayout && dragged.length === 1) {
            // dropped inside an auto-layout container: the drop point decides the place among its siblings
            const kids = useDiagramStore.getState().nodes.filter((x) => x.parentId === owner.id && x.id !== dropped.id && !x.data.hidden);
            const s0 = nodeSize(dropped);
            const idx = dropIndex(owner.data.autoLayout, kids.map((k) => ({ ...k.position, ...nodeSize(k) })), { x: dropped.position.x + s0.width / 2, y: dropped.position.y + s0.height / 2 });
            useDiagramStore.setState({ nodes: reorderChild(useDiagramStore.getState().nodes, dropped.id, idx) });
          }
        }}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onNodeContextMenu={(e, n) => {
          e.preventDefault();
          if (!n.selected) selectOnly('node', n.id);
          openMenu({ x: e.clientX, y: e.clientY, target: { type: 'node', id: n.id }, at: menuAt(e) });
        }}
        onEdgeDoubleClick={(e, edge) => {
          // double-click a line to type its label
          if (readOnly || edge.data?.locked) return;
          e.stopPropagation();
          selectOnly('edge', edge.id);
          useUiStore.getState().setEditing(edge.id);
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          if (!edge.selected) selectOnly('edge', edge.id);
          openMenu({ x: e.clientX, y: e.clientY, target: { type: 'edge', id: edge.id }, at: menuAt(e) });
        }}
        onSelectionContextMenu={(e) => {
          e.preventDefault();
          openMenu({ x: e.clientX, y: e.clientY, target: { type: 'selection' }, at: menuAt(e) });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          openMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY, target: { type: 'pane' }, at: menuAt(e as MouseEvent) });
        }}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={snap}
        snapGrid={[grid / 2, grid / 2]}
        deleteKeyCode={null}
        selectionOnDrag={tool === 'select'}
        onSelectionEnd={() => {
          // a box selection also takes the lines running between the boxed shapes
          const st = useDiagramStore.getState();
          const picked = new Set(st.nodes.filter((n) => n.selected).map((n) => n.id));
          if (picked.size < 2) return;
          if (!st.edges.some((e) => !e.selected && picked.has(e.source) && picked.has(e.target))) return;
          useDiagramStore.setState({ edges: st.edges.map((e) => (!e.selected && picked.has(e.source) && picked.has(e.target) ? { ...e, selected: true } : e)) });
        }}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === 'hand' ? true : [1]}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        zoomActivationKeyCode={['Meta', 'Control']}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        nodesDraggable={!readOnly && tool === 'select'}
        nodesConnectable={!readOnly && (tool === 'select' || tool === 'arrow')}
        elementsSelectable={tool !== 'hand'}
        defaultViewport={DEFAULT_VIEWPORT}
        onMoveStart={(ev) => { setMoving(true); if (ev) { useCollabStore.getState().dispatchFollow({ type: 'userInteraction' }); usePresenterFollow.getState().dispatch({ type: 'userInteraction' }); } }} // a drag / wheel by me ends "follow"; the follow move itself has no DOM event
        onMoveEnd={(_, vp) => { setMoving(false); setPageViewport(useDiagramStore.getState().activePageId, vp); }}
        minZoom={0.1}
        maxZoom={4}
        onNodeMouseEnter={(_, n) => setHoverId(n.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        onNodeClick={(ev, n) => {
          const link = (n.data as { link?: { fileId: string; nodeId?: string } }).link;
          if (link && (presenting || ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); followLink(link); return; }
          if (pageFlow && n.type !== 'group' && n.type !== 'cluster') setTrace(traceNodeId === n.id ? null : n.id);
        }}
        onPaneClick={() => { if (traceNodeId) setTrace(null); }}
      >
        {pageFlow && <FlowLayer paths={flowPaths} visible={traceVisible} />}
        <PresencePublisher />
        <PresenceLayer />
        <CommentPins />
        <DiffOverlay />
        <CapacityOverlay />
        {showGrid && <Background variant={BackgroundVariant.Dots} gap={grid} size={1.4} color="#b9bfcb" style={{ opacity: gridOpacity }} />}
        {showMinimap && <MiniMap pannable zoomable className="minimap-small" style={{ left: sidebarOpen ? 300 : 16, bottom: mapBottom, width: 132, height: 84 }} />}
        {showMinimap && <MinimapPeers left={sidebarOpen ? 300 : 16} bottom={mapBottom} width={132} height={84} />}
        <ViewportPortal>
          <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
            {rulersOn && <GuideLines zoom={zoom} />}
            <MeasureLines measures={[...measures, ...dragMeasures]} zoom={zoom} />
            {guides.map((g, i) =>
              g.orientation === 'v' ? (
                <line key={i} className="guide-line" x1={g.pos} x2={g.pos} y1={g.from - 12} y2={g.to + 12} />
              ) : (
                <line key={i} className="guide-line" y1={g.pos} y2={g.pos} x1={g.from - 12} x2={g.to + 12} />
              ),
            )}
          </svg>
        </ViewportPortal>
      </ReactFlow>
      {arrowDrag && (
        <svg className="draw-preview" style={{ zIndex: 6 }}>
          <polyline points={`${arrowDrag.a.x},${arrowDrag.a.y} ${arrowDrag.b.x},${arrowDrag.b.y}`} strokeDasharray="6 4" />
        </svg>
      )}
      {rulersOn && <Rulers />}
      <ErSqlPanel />
      <FollowBanner />
      <DiffBanner />
      <CommentCapture />
      {drawing && (
        <div className={`draw-layer tool-${tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} onPointerLeave={() => setHover(null)} data-testid="draw-layer">
          {drag && !FREEHAND.includes(tool) && tool !== 'eraser' && tool !== 'stamp' && tool !== 'mindmap' && (
            <svg className="draw-preview">
              <rect
                x={Math.min(drag.screen[0].x, drag.screen[1]?.x ?? drag.screen[0].x)}
                y={Math.min(drag.screen[0].y, drag.screen[1]?.y ?? drag.screen[0].y)}
                width={Math.abs((drag.screen[1]?.x ?? drag.screen[0].x) - drag.screen[0].x)}
                height={Math.abs((drag.screen[1]?.y ?? drag.screen[0].y) - drag.screen[0].y)}
                rx={tool === 'ellipse' ? 999 : 0}
              />
            </svg>
          )}
          {drag && FREEHAND.includes(tool) && (
            <svg className="draw-preview freehand-preview">
              <path d={previewPath} fill={tool === 'pen' ? penColor : hlColor} fillOpacity={tool === 'pen' ? 1 : 0.38} stroke="none" />
            </svg>
          )}
          {tool === 'eraser' && hover && <span className="eraser-cursor" style={{ left: hover.x, top: hover.y, width: eraserSize * 2, height: eraserSize * 2 }} aria-hidden />}
        </div>
      )}
      <PresenterFollow />
      <ReactionLayer />
    </div>
  );
}
