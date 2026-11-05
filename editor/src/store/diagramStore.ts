import { create } from 'zustand';
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import { registerCustomIcons } from '../data/customIcons';
import type {
  EdgeData,
  Arrows, DiagramContent, DiagramEdge, DiagramNode, DiagramNodeData, EdgeKind, Guide, LineType, MarkerKind, Page, Project, ProjectAsset, ReplMode, StrokeStyle,
} from '../types';
import { requestFit } from '../lib/fitBus';
import { absolutePosition, ancestorsOf, descendantsOf, isContainer, newId, nodeSize, normalizeLocks, resolveParent, sortParentsFirst, styleEdge } from '../lib/graph';
import { validateRole, isPrimaryRole } from '../clusters/roles';
import { suggestEdgeKind } from '../clusters/edgeKinds';
import { collapseCluster, expandCluster } from '../clusters/collapse';
import { getProfile } from '../clusters/profiles';
import { instantiate, regenerateCluster } from '../clusters/regenerate';
import { freeSpot, pushSiblingsClear, rectOf } from '../clusters/spacing';
import { alignNodes, distributeNodes, type AlignMode, type DistributeAxis } from '../lib/arrange';
import { applyBulk, matchSize, resetStyle, selectSimilar, type NodeField, type SimilarMode } from '../lib/bulkStyle';
import { repeatGroup } from '../lib/repeat';
import { addJunction } from '../lib/junction';
import { findPreset, presetPatch, type EdgePreset } from '../lib/edgePresets';
import { findFreeSpot, placeInto } from '../lib/placement';
import { clipboardOrigin, copySelection, pasteClipboard, type ClipboardData } from '../lib/clipboard';
import { reorderZ, type ZMode } from '../lib/zorder';
import { groupNodes, removeFromGroup as detach, ungroupNode } from '../lib/grouping';
import { duplicatePages } from '../lib/project';
import { deleteElements } from '../lib/deletion';
import { relayoutRootsOf } from '../lib/board/mindmapOps';
import { setOverride } from '../lib/library/components';
import { parentOf as mmParentOf } from '../lib/board/mindmap';
import { mergeSettings, stripStyleOverrides, type PartialSettings } from '../lib/settings';
import type { Viewport } from '../lib/viewport';
import { createJunction, createRelation, dropDanglingRelations, pruneFks, reverseRelation, setCardinality, withRelation, type CreateRelationInput } from '../lib/er/relations';
import { withTableSize } from '../lib/er/geometry';
import { expandManyToMany, showAsManyToMany } from '../lib/er/junction';
import { layoutTables } from '../lib/er/layout';
import { classOf, withClassSize } from '../lib/uml/geometry';
import { healStash, modelIdOf, newModelId, propagateEverywhere } from '../lib/uml/shared';
import { defaultRelation } from '../lib/uml2/nodes';
import { sequenceOf, withSequenceSize } from '../lib/seq/node';
import { timingOf, withTimingSize } from '../lib/timing/node';
import { tidyTiming } from '../lib/timing/edit';
import type { TimingData } from '../lib/timing/types';
import { diagramToStateModel, stateOf, withStateSize } from '../lib/state/convert';
import { layoutStates } from '../lib/state/layout';
import { tidyUseCase } from '../lib/usecase/tidy';
import { tidyActivity } from '../lib/activity/tidy';
import { nestInDeploymentNode, tidyDeployment, unnestDeployment } from '../lib/deployment/tidy';
import { withDeploymentSize } from '../lib/deployment/sizes';
import { nestInPackage, tidyPackages } from '../lib/package/tidy';
import { instantiateClass } from '../lib/object/nodes';
import { tidyObjects } from '../lib/object/convert';
import { withObjectSize } from '../lib/object/sizes';
import { withActivitySize } from '../lib/activity/sizes';
import { nestInNode, tidyComponents, unnestComponents } from '../lib/component/tidy';
import { portById } from '../lib/component/ports';
import type { ComponentPort } from '../lib/uml2/types';
import type { StateNodeData } from '../lib/state/types';
import { withShapeSize } from '../lib/uml2/sizes';
import type { SequenceData } from '../lib/seq/types';
import { umlEdge, withUml } from '../lib/uml/edges';
import { layoutClasses } from '../lib/uml/layout';
import type { ClassNodeData, UmlRelationData } from '../lib/uml/types';
import { relationOf, tableOf, type RelationData, type TableNodeData } from '../lib/er/tableData';
import type { Cardinality } from '../lib/er/types';

interface Snapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
interface PageState extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
}
const HISTORY_LIMIT = 100;

/**
 * Collaborative files replace the snapshot history by a per-user Y.UndoManager: while a driver is set, undo / redo / snapshot
 * go to it (see collab/binding.ts). Without a driver (local files, legacy REST files) nothing changes.
 */
export interface HistoryDriver {
  undo: () => void;
  redo: () => void;
  /** a new undo step starts here (what `snapshot()` means for the snapshot history) */
  checkpoint: () => void;
}
let historyDriver: HistoryDriver | null = null;
export const setHistoryDriver = (d: HistoryDriver | null): void => {
  historyDriver = d;
};

export type NewEdge = Partial<DiagramEdge> & { source: string; target: string };
export interface EdgePatch {
  label?: string;
  dashed?: boolean;
  color?: string;
  strokeWidth?: number;
  lineType?: LineType;
  arrows?: Arrows;
  labelBg?: boolean;
  strokeStyle?: StrokeStyle;
  flow?: boolean;
  kind?: EdgeKind;
  replMode?: ReplMode;
  startMarker?: MarkerKind;
  endMarker?: MarkerKind;
  cornerRadius?: number;
  labelColor?: string;
  labelBold?: boolean;
  labelSide?: 'auto' | 'on' | 'left' | 'right';
  preset?: string;
  dataFlow?: boolean;
  flowSpeed?: 'slow' | 'normal' | 'fast';
  flowDensity?: number;
  flowStyle?: 'dot' | 'dash' | 'pulse';
  flowDir?: 'forward' | 'reverse' | 'both';
}
export interface PageMeta {
  id: string;
  name: string;
}
type StyleClip = { kind: 'node'; data: Partial<DiagramNodeData> } | { kind: 'edge'; data: EdgePatch } | null;

const NODE_STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeStyle', 'radius', 'opacity', 'fontSize', 'bold', 'align', 'textColor'] as const;
const EDGE_STYLE_KEYS = ['color', 'dashed', 'strokeStyle', 'strokeWidth', 'lineType', 'arrows', 'labelBg'] as const;

interface DiagramState {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  past: Snapshot[];
  future: Snapshot[];

  projectId: string;
  projectName: string;
  createdAt: number;
  pages: PageMeta[];
  activePageId: string;
  stash: Record<string, PageState>;

  projectSettings: PartialSettings;
  viewports: Record<string, Viewport>;
  /** pages with "Data flow" mode on (animated packets on every edge) */
  pageFlow: Record<string, boolean>;
  /** ruler guides per page */
  guides: Record<string, Guide[]>;
  setGuides: (pageId: string, g: Guide[]) => void;
  setPageFlow: (pageId: string, on: boolean) => void;
  assets: Record<string, ProjectAsset>;
  clipboard: ClipboardData | null;
  pasteCount: number;
  styleClip: StyleClip;

  setPageViewport: (pageId: string, v: Viewport) => void;
  addAsset: (hash: string, asset: ProjectAsset) => void;
  setProjectSettings: (s: PartialSettings) => void;
  applyDefaultsToPage: () => void;
  addNode: (node: DiagramNode) => void;
  addNodes: (nodes: DiagramNode[]) => void;
  /** like addNodes but moves the batch to the nearest free spot (never stacks on existing nodes) */
  placeNodes: (nodes: DiagramNode[]) => void;
  /** insert diagram content (template) into this page, in the nearest free area right of / below existing content */
  /** paste content into the page; the new items stay selected unless `select: false` (templates leave nothing selected) */
  insertContent: (d: DiagramContent, opts?: { select?: boolean }) => void;
  /** turn a group into N repeated groups (name-1..N) with an ellipsis marker */
  repeatGroup: (groupId: string, count: number) => void;
  /** merge edges sharing a source/target through an (invisible) junction node */
  mergeIntoJunction: (edgeIds: string[]) => boolean;
  /** style edges with a named preset (builtin or user-defined) */
  applyEdgePreset: (edgeIds: string[], presetId: string, userPresets?: EdgePreset[]) => void;
  updateNodeData: (id: string, patch: Partial<DiagramNodeData>) => void;
  updateNodesData: (ids: string[], patch: Partial<DiagramNodeData>) => void;
  setNodePosition: (id: string, position: { x: number; y: number }) => void;
  deleteNodes: (ids: string[]) => number;
  addEdge: (edge: NewEdge) => void;
  connect: (c: Connection) => void;
  updateEdge: (id: string, patch: EdgePatch) => void;
  updateEdges: (ids: string[], patch: EdgePatch) => void;
  reverseEdge: (id: string) => void;
  /** ER: edit a table node (resizes it, drops relations to removed columns, keeps FK hints in step) */
  updateTable: (id: string, fn: (d: TableNodeData) => TableNodeData) => void;
  /** ER: reference `parent` from `child` (creating the FK column when none is given); returns the relation edge id */
  connectTables: (input: CreateRelationInput) => string | null;
  /** ER: replace an N:M relation by a junction table; returns its node id */
  makeJunction: (edgeId: string) => string | null;
  /** ER: show a junction table as one N:M edge (table and its keys are hidden) / bring it back */
  foldJunction: (tableId: string) => boolean;
  unfoldJunction: (edgeId: string) => boolean;
  /** ER: patch the relation data of edges (markers and line style follow) */
  updateRelations: (edgeIds: string[], patch: Partial<RelationData>) => void;
  setCardinality: (edgeIds: string[], c: Cardinality) => void;
  /** UML: edit a class node (resizes it) */
  updateClass: (id: string, fn: (d: ClassNodeData) => ClassNodeData) => void;
  /** UML shared model: place a linked copy of a class of this file on the current page (one undo step); returns the new node id */
  addLinkedClass: (source: { pageId: string; nodeId: string }) => string | null;
  /** UML shared model: detach a class copy from its model (the other copies stay linked) */
  unlinkClass: (id: string) => boolean;
  /** UML shared model: link the sequence lifelines and objects named like this class to its model; returns how many were linked */
  linkRefsToClass: (classId: string) => number;
  updateSequence: (id: string, fn: (d: SequenceData) => SequenceData) => void;
  /** timing diagram: edit the data of one `timing` frame (the frame follows its content) */
  updateTiming: (id: string, fn: (d: TimingData) => TimingData) => void;
  /** timing diagram: tidy every timing frame (or the selected ones); returns how many were changed */
  tidyTiming: () => number;
  /** communication diagram: rewrite the edges (message numbering is page wide) in one undo step */
  editEdges: (fn: (edges: DiagramEdge[]) => DiagramEdge[]) => void;
  updateState: (id: string, fn: (d: StateNodeData) => StateNodeData) => void;
  /** use case / component nodes: edit the node's data and keep its size in step */
  updateShape: (id: string, fn: (d: Record<string, unknown>) => Record<string, unknown>) => void;
  /** UML: add a relation between two classes; returns the edge id */
  addUmlEdge: (source: string, target: string, uml: UmlRelationData) => string | null;
  /** UML: patch the relation data of edges (markers and dash follow the kind) */
  updateUml: (edgeIds: string[], patch: Partial<UmlRelationData>) => void;
  /** UML: layered layout of the selected classes (or all): parents above children */
  tidyUml: () => number;
  tidyStates: () => number;
  tidyUseCase: () => number;
  tidyActivity: () => number;
  tidyDeployment: () => number;
  tidyPackages: () => number;
  nestPackages: (ids?: string[]) => string | null;
  tidyObjects: () => number;
  /** object diagram: an object per selected (or given) class, with an empty slot for every attribute; returns the new object ids */
  instantiateClasses: (ids?: string[]) => string[];
  nestDeployment: (ids?: string[]) => string | null;
  unnestDeployment: (ids?: string[]) => number;
  tidyComponents: () => number;
  /** wrap the selected (or given) components in a new deployment node; returns the node id */
  nestComponents: (ids?: string[]) => string | null;
  unnestComponents: (ids?: string[]) => number;
  /** ER: auto-layout the selected tables, or every table when fewer than two are selected */
  tidyEr: () => number;
  /** manual routing: waypoints make the edge manual. record=false for live dragging (call snapshot() once first) */
  setEdgeRoute: (id: string, waypoints: { x: number; y: number }[], record?: boolean) => void;
  resetRoute: (id: string) => void;
  tidyEdges: () => void;
  setLabelPosition: (id: string, t: number, offset?: number, record?: boolean) => void;
  reconnectEdge: (id: string, to: { source?: string; target?: string; sourceSide?: 'top' | 'right' | 'bottom' | 'left'; targetSide?: 'top' | 'right' | 'bottom' | 'left' }) => boolean;
  deleteEdges: (ids: string[]) => void;
  /** delete the selection, or exactly the given ids (context menus pass the target explicitly) */
  deleteSelection: (ids?: { nodes?: string[]; edges?: string[] }) => number;
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<DiagramEdge>[]) => void;
  /** rewrite nodes and edges in ONE undo step (Board actions: arrange, mind map, frame order); return null to do nothing */
  transform: (fn: (nodes: DiagramNode[], edges: DiagramEdge[]) => { nodes: DiagramNode[]; edges: DiagramEdge[] } | null) => boolean;
  snapshot: () => void;
  endDrag: (id: string) => void;
  undo: () => void;
  redo: () => void;
  loadDiagram: (d: DiagramContent) => void;

  // selection
  selectAll: () => void;
  selectOnly: (kind: 'node' | 'edge', id: string) => void;
  selectChildren: (groupId: string) => void;
  // clipboard
  copy: () => void;
  cut: () => void;
  paste: (at?: { x: number; y: number }) => void;
  duplicate: () => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  /** bulk style: apply fields to every selected node they apply to (one undo step); returns how many changed */
  updateSelectionStyle: (patch: Partial<Record<NodeField, unknown>>) => number;
  matchSelectionSize: () => number;
  /** set every edge's line style explicitly (this page or all pages): ONE undo step on the active page; returns the edge count */
  applyLineStyleToAll: (lineType: LineType, scope: 'page' | 'project') => number;
  resetSelectionStyle: () => void;
  /** select everything like the anchor (same type / same icon / same preset) */
  selectSimilar: (mode: SimilarMode, anchor?: { kind: 'node' | 'edge'; id: string }) => number;
  // arrange
  nudgeSelection: (dx: number, dy: number) => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (axis: DistributeAxis) => void;
  reorderSelection: (mode: ZMode) => void;
  toggleLock: () => void;
  groupSelection: () => void;
  ungroup: (groupId: string) => void;
  removeFromGroup: (ids: string[]) => void;
  // clusters
  setRole: (ids: string[], role: string | null) => boolean;
  toggleCollapse: (clusterId: string) => void;
  addReplica: (clusterId: string) => string | null;
  wrapSelectionInCluster: () => void;
  createCluster: (profileId: string, params: Record<string, unknown>, at?: { x: number; y: number }) => string | null;
  updateCluster: (clusterId: string, params: Record<string, unknown>) => boolean;

  // pages / project
  addPage: (name?: string, content?: DiagramContent) => string;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => boolean;
  duplicatePage: (id: string) => string;
  switchPage: (id: string) => void;
  importPages: (pages: Page[]) => void;
  setProjectName: (name: string) => void;
  loadProject: (p: Project) => void;
  toProject: () => Project;
  /** everything a file tab owns: the document plus its undo history, selection and viewports (see lib/tabSession) */
  captureTab: () => TabSlice;
  /** put a captured tab back; the undo history, selection and viewports come back exactly as they were */
  restoreTab: (slice: TabSlice) => void;
  reset: () => void;
}

const TAB_KEYS = ['nodes', 'edges', 'past', 'future', 'projectId', 'projectName', 'createdAt', 'pages', 'activePageId', 'stash', 'projectSettings', 'viewports', 'pageFlow', 'guides', 'assets'] as const;
export type TabSlice = Pick<DiagramState, (typeof TAB_KEYS)[number]>;

/** the saveable document of an editor state / captured tab */
export function sliceToProject(s: TabSlice): Project {
  return {
    version: 2 as const,
    id: s.projectId,
    name: s.projectName,
    createdAt: s.createdAt,
    updatedAt: Date.now(),
    activePageId: s.activePageId,
    ...(Object.keys(s.projectSettings).length ? { settings: s.projectSettings } : {}),
    ...(Object.keys(s.assets).length ? { assets: s.assets } : {}),
    pages: s.pages.map((p) => {
      const c = p.id === s.activePageId ? { nodes: s.nodes, edges: s.edges } : s.stash[p.id] ?? { nodes: [], edges: [] };
      return { id: p.id, name: p.name, nodes: c.nodes, edges: c.edges, ...(s.viewports[p.id] ? { viewport: s.viewports[p.id] } : {}), ...(s.pageFlow[p.id] ? { flow: true } : {}), ...(s.guides?.[p.id]?.length ? { guides: s.guides[p.id] } : {}) };
    }),
  };
}

/** edits of text / colours / icon on a child of a component instance are remembered as per-instance overrides */
function trackOverrides(nodes: DiagramNode[], ids: string[], patch: Record<string, unknown>): DiagramNode[] {
  let out = nodes;
  for (const id of ids) if (out.find((n) => n.id === id)?.data.instKey !== undefined) out = setOverride(out, id, patch);
  return out;
}
/** deleting a mind map branch re-flows the rest of its map (layout always runs) */
function afterDelete(nodes: DiagramNode[], edges: DiagramEdge[], ids: string[], r: { nodes: DiagramNode[]; edges: DiagramEdge[] }): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const parents = ids.filter((id) => nodes.find((n) => n.id === id)?.type === 'mindmap').map((id) => mmParentOf(edges, id)).filter((p): p is string => !!p && r.nodes.some((n) => n.id === p));
  return parents.length ? relayoutRootsOf(r.nodes, r.edges, parents) : r;
}
const snap = (s: Snapshot): Snapshot => ({ nodes: s.nodes, edges: s.edges });
/**
 * A Tidy moved nodes: edges that end on a moved node forget their hand-placed bends and label position (labelT / labelOffset, also
 * the ones a template stored), so the router and the label placer start fresh and the labels are centred again.
 */
const tidied = (st: DiagramState, nodes: DiagramNode[]): Pick<DiagramState, 'nodes' | 'edges'> => {
  const before = new Map(st.nodes.map((n) => [n.id, n]));
  const moved = new Set(nodes.filter((n) => { const o = before.get(n.id); return !o || o.position.x !== n.position.x || o.position.y !== n.position.y || o.width !== n.width || o.height !== n.height; }).map((n) => n.id));
  if (!moved.size) return { nodes, edges: st.edges };
  const edges = st.edges.map((e) => {
    if (e.data?.locked || !(moved.has(e.source) || moved.has(e.target))) return e;
    if (e.data?.manual === undefined && e.data?.waypoints === undefined && e.data?.labelT === undefined && e.data?.labelOffset === undefined) return e;
    const { manual: _m, waypoints: _w, labelT: _t, labelOffset: _o, ...data } = e.data ?? {};
    void _m; void _w; void _t; void _o;
    return styleEdge({ ...e, data });
  });
  return { nodes, edges };
};

const pushPast = (s: DiagramState): Pick<DiagramState, 'past' | 'future'> => ({
  past: [...s.past, snap(s)].slice(-HISTORY_LIMIT),
  future: [],
});
const selectedNodeIds = (s: DiagramState) => s.nodes.filter((n) => n.selected).map((n) => n.id);
const pick = <T extends object>(src: T, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if ((src as Record<string, unknown>)[k] !== undefined) out[k] = (src as Record<string, unknown>)[k];
  return out;
};

/** Dropping a component onto an empty cluster makes the cluster that tech. */
function adoptTech(nodes: DiagramNode[], dropped: DiagramNode): DiagramNode[] {
  if (!dropped.parentId || dropped.type !== 'icon' || !dropped.data.iconId) return nodes;
  const parent = nodes.find((n) => n.id === dropped.parentId);
  if (!parent || parent.type !== 'cluster' || parent.data.iconId) return nodes;
  return nodes.map((n) =>
    n.id === parent.id ? { ...n, data: { ...n.data, iconId: dropped.data.iconId, ...(n.data.label === 'Cluster' ? { label: `${dropped.data.label} cluster` } : {}) } } : n,
  );
}

const freshPage = (name = 'Page 1'): PageMeta => ({ id: newId('pg'), name });
function initialState() {
  const page = freshPage();
  return {
    nodes: [] as DiagramNode[],
    edges: [] as DiagramEdge[],
    past: [] as Snapshot[],
    future: [] as Snapshot[],
    projectId: newId('prj'),
    projectName: 'Untitled',
    createdAt: Date.now(),
    pages: [page],
    activePageId: page.id,
    stash: {} as Record<string, PageState>,
    projectSettings: {} as PartialSettings,
    viewports: {} as Record<string, Viewport>,
    pageFlow: {} as Record<string, boolean>,
    guides: {} as Record<string, Guide[]>,
    assets: {} as Record<string, ProjectAsset>,
    clipboard: null as ClipboardData | null,
    pasteCount: 0,
    styleClip: null as StyleClip,
  };
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  ...initialState(),

  setProjectSettings: (projectSettings) => set({ projectSettings }),
  setGuides: (pageId, g) => set((s) => ({ guides: { ...s.guides, [pageId]: g } })),
  setPageFlow: (pageId, on) => set((s) => ({ pageFlow: { ...s.pageFlow, [pageId]: on } })),
  setPageViewport: (pageId, v) => set((s) => ({ viewports: { ...s.viewports, [pageId]: v } })),
  addAsset: (hash, asset) => {
    registerCustomIcons({ [hash]: asset });
    set((s) => ({ assets: { ...s.assets, [hash]: asset } }));
  },

  applyDefaultsToPage: () =>
    set((s) => {
      const r = stripStyleOverrides(s.nodes, s.edges);
      return { ...pushPast(s), nodes: r.nodes, edges: r.edges.map((e) => styleEdge(e)) };
    }),

  addNode: (node) =>
    set((s) => {
      const placed = node.parentId ? node : resolveParent(s.nodes, node);
      const list = isContainer(placed) && !placed.parentId ? [placed, ...s.nodes] : [...s.nodes, placed];
      return { ...pushPast(s), nodes: adoptTech(sortParentsFirst(list), placed) };
    }),

  addNodes: (nodes) =>
    set((s) => {
      if (!nodes.length) return s;
      const first = nodes[0];
      const placed = first.parentId ? first : resolveParent(s.nodes, first);
      const list = [placed, ...nodes.slice(1)];
      return { ...pushPast(s), nodes: sortParentsFirst([...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...list]) };
    }),

  placeNodes: (nodes) => {
    if (!nodes.length) return;
    get().addNodes(placeInto(get().nodes, nodes));
  },

  insertContent: (d, opts) =>
    set((s) => {
      const pasted = pasteClipboard({ nodes: d.nodes, edges: d.edges }, { x: 0, y: 0 });
      let nodes = pasted.nodes;
      const keep = opts?.select !== false;
      if (s.nodes.length && nodes.length) {
        const roots = nodes.filter((n) => !n.parentId);
        const rs = roots.map((n) => ({ x: n.position.x, y: n.position.y, ...nodeSize(n) }));
        const minX = Math.min(...rs.map((r) => r.x));
        const minY = Math.min(...rs.map((r) => r.y));
        const w = Math.max(...rs.map((r) => r.x + r.width)) - minX;
        const h = Math.max(...rs.map((r) => r.y + r.height)) - minY;
        const ex = s.nodes.filter((n) => !n.parentId).map((n) => ({ ...absolutePosition(s.nodes, n), ...nodeSize(n) }));
        const exMaxX = Math.max(...ex.map((r) => r.x + r.width));
        const exMinX = Math.min(...ex.map((r) => r.x));
        const exMinY = Math.min(...ex.map((r) => r.y));
        const exMaxY = Math.max(...ex.map((r) => r.y + r.height));
        // right of existing content first; fall back to below (a template wider than tall of content)
        const right = findFreeSpot({ x: exMaxX + 80, y: exMinY, width: w, height: h }, ex);
        const below = findFreeSpot({ x: exMinX, y: exMaxY + 80, width: w, height: h }, ex);
        const spot = right.x - exMaxX >= 0 && right.y === exMinY ? right : below;
        const dx = Math.round(spot.x - minX);
        const dy = Math.round(spot.y - minY);
        nodes = nodes.map((n) => (n.parentId ? n : { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }));
      }
      requestFit(nodes.map((n) => n.id));
      // a template dropped on an empty file brings its look (canvas background, sketch ...); onto existing content it never restyles the file
      const adopt = !s.nodes.length && d.settings && Object.keys(d.settings).length ? { projectSettings: mergeSettings(s.projectSettings, d.settings) } : {};
      return {
        ...pushPast(s),
        ...adopt,
        nodes: sortParentsFirst([...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...normalizeLocks(keep ? nodes : nodes.map((n) => (n.selected ? { ...n, selected: false } : n)))]),
        edges: [...s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), ...pasted.edges.map((e) => styleEdge(keep || !e.selected ? e : { ...e, selected: false }))],
      };
    }),

  repeatGroup: (groupId, count) =>
    set((s) => {
      const next = repeatGroup(s.nodes, groupId, Math.min(Math.max(2, Math.round(count)), 12));
      return next === s.nodes ? s : { ...pushPast(s), nodes: next };
    }),

  mergeIntoJunction: (edgeIds) => {
    const s = get();
    const r = addJunction(s.nodes, s.edges, edgeIds);
    if (!r) return false;
    set({ ...pushPast(s), nodes: r.nodes, edges: r.edges.map((e) => styleEdge(e)) });
    return true;
  },

  applyEdgePreset: (edgeIds, presetId, userPresets) => {
    const p = findPreset(presetId, [...(get().projectSettings.edgePresets ?? []), ...(userPresets ?? [])]);
    if (!p) return;
    get().updateEdges(edgeIds, presetPatch(p));
  },

  updateNodeData: (id, patch) => get().updateNodesData([id], patch),

  updateNodesData: (ids, patch) =>
    set((s) => {
      const sel = new Set(ids);
      let nodes = trackOverrides(s.nodes.map((n) => (sel.has(n.id) ? { ...n, data: { ...n.data, ...patch } } : n)), ids, patch);
      let stash = s.stash;
      // renaming one copy of a shared class renames them all
      if ('label' in patch) for (const n of nodes) {
        const mid = sel.has(n.id) ? modelIdOf(n) : undefined;
        if (mid && n.type === 'class') ({ nodes, stash } = propagateEverywhere({ nodes, stash }, mid, classOf(n), n.id));
      }
      return { ...pushPast(s), nodes, ...(stash !== s.stash ? { stash } : {}) };
    }),

  setNodePosition: (id, position) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),

  deleteNodes: (ids) => {
    const s = get();
    const r = deleteElements(s.nodes, s.edges, ids, []);
    if (!r.removedNodes && !r.removedEdges) return r.kept.length;
    const g = afterDelete(s.nodes, s.edges, ids, r);
    set((st) => ({ ...pushPast(st), nodes: pruneFks(g.nodes, g.edges), edges: g.edges }));
    return r.kept.length;
  },

  addEdge: (edge) =>
    set((s) => {
      const ids = new Set(s.nodes.map((n) => n.id));
      if (edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) return s;
      const id = edge.id ?? newId('e');
      const full = styleEdge({ ...edge, id, className: 'edge-new', data: { ...(edge.data ?? {}) } } as DiagramEdge);
      // draw-in animation runs once, then the marker class is dropped
      setTimeout(() => set((st) => ({ edges: st.edges.map((x) => (x.id === id && x.className === 'edge-new' ? { ...x, className: undefined } : x)) })), 800);
      return { ...pushPast(s), edges: [...s.edges, full] };
    }),

  connect: (c) => {
    if (!c.source || !c.target) return;
    const tbl = (id: string) => get().nodes.find((n) => n.id === id)?.type === 'table';
    if (tbl(c.source) && tbl(c.target)) {
      // ER: dragging from a column handle onto a table / column creates the foreign key + relation
      const col = (h?: string | null) => (h && /^c\d+-[lr]$/.test(h) ? h.slice(0, h.lastIndexOf('-')) : undefined);
      get().connectTables({ childId: c.source, childCol: col(c.sourceHandle), parentId: c.target, parentCol: col(c.targetHandle) });
      return;
    }
    // UML: dragging between two classes draws an association; a note and a class get a dashed note link
    const typeOf = (id: string) => get().nodes.find((n) => n.id === id);
    const [ta, tb] = [typeOf(c.source), typeOf(c.target)];
    if (ta?.type === 'class' && tb?.type === 'class') return void get().addUmlEdge(c.source, c.target, { kind: 'association' });
    const dr = ta && tb ? defaultRelation(ta, tb) : undefined;
    if (dr) {
      // component connectors dropped on an interface port stay attached to that port
      const port = (n: DiagramNode | undefined, h: string | null | undefined) => (n?.type === 'component' && h ? portById(n.data as { ports?: ComponentPort[] }, h)?.id : undefined);
      const sp = port(ta, c.sourceHandle), tp = port(tb, c.targetHandle);
      return void get().addUmlEdge(c.source, c.target, { kind: dr, ...(sp ? { sourcePort: sp } : {}), ...(tp ? { targetPort: tp } : {}) });
    }
    const note = [ta, tb].find((n) => n?.type === 'sticky' && n.data.umlNote);
    const klass = [ta, tb].find((n) => n?.type === 'class');
    if (note && klass) return void get().addUmlEdge(note.id, klass.id, { kind: 'note' });
    const hint = suggestEdgeKind(get().nodes, c.source, c.target); // inside one cluster: replication / heartbeat
    let { source, target } = c;
    let sourceHandle = c.sourceHandle ?? undefined;
    let targetHandle = c.targetHandle ?? undefined;
    let clientLabel: string | undefined;
    // producers/consumers <-> Kafka cluster: normalise direction (produce = into the cluster, consume = out) and label the topic
    const a = get().nodes.find((n) => n.id === source);
    const bn = get().nodes.find((n) => n.id === target);
    const isKafka = (n?: DiagramNode) => n?.type === 'cluster' && (n.data.profileId === 'kafka' || n.data.iconId === 'kafka');
    const client = [a, bn].find((n) => n?.data.clientKind);
    const cl = [a, bn].find(isKafka);
    if (client && cl && client !== cl) {
      const topics = (cl.data.params?.topics as { name: string }[] | undefined) ?? [];
      clientLabel = topics[0]?.name ?? 'topic';
      const produce = client.data.clientKind === 'producer';
      const wantSource = produce ? client.id : cl.id;
      if (wantSource !== source) {
        [source, target] = [target, source];
        [sourceHandle, targetHandle] = [targetHandle, sourceHandle];
      }
    }
    const pins = {} as Partial<EdgeData>; // floating: ends pick the facing side and follow the shapes when they move
    get().addEdge({
      source,
      target,
      sourceHandle,
      targetHandle,
      ...(clientLabel ? { label: clientLabel } : {}),
      data: { ...pins, ...(hint ?? {}) },
      ...(hint?.kind === 'replication' && hint.replMode && !clientLabel ? { label: hint.replMode } : {}),
    });
  },

  updateEdge: (id, patch) => get().updateEdges([id], patch),

  updateEdges: (ids, patch) =>
    set((s) => {
      const sel = new Set(ids);
      return {
        ...pushPast(s),
        edges: s.edges.map((e) => {
          if (!sel.has(e.id)) return e;
          const data = { ...e.data };
          if (patch.strokeStyle !== undefined) {
            data.strokeStyle = patch.strokeStyle;
            data.dashed = patch.strokeStyle === 'dashed';
          }
          if (patch.dashed !== undefined) {
            data.dashed = patch.dashed;
            data.strokeStyle = patch.dashed ? 'dashed' : 'solid';
          }
          if (patch.color !== undefined) data.color = patch.color;
          if (patch.strokeWidth !== undefined) data.strokeWidth = patch.strokeWidth;
          if (patch.lineType !== undefined) data.lineType = patch.lineType;
          if (patch.arrows !== undefined) data.arrows = patch.arrows;
          if (patch.labelBg !== undefined) data.labelBg = patch.labelBg;
          if (patch.flow !== undefined) data.flow = patch.flow;
          if (patch.kind !== undefined) data.kind = patch.kind;
          if (patch.startMarker !== undefined) data.startMarker = patch.startMarker;
          if (patch.endMarker !== undefined) data.endMarker = patch.endMarker;
          if (patch.cornerRadius !== undefined) data.cornerRadius = patch.cornerRadius;
          if (patch.replMode !== undefined) data.replMode = patch.replMode;
          if (patch.labelColor !== undefined) data.labelColor = patch.labelColor;
          if (patch.labelBold !== undefined) data.labelBold = patch.labelBold;
          if (patch.labelSide !== undefined) data.labelSide = patch.labelSide;
          if ('dataFlow' in patch) { if (patch.dataFlow === undefined) delete data.dataFlow; else data.dataFlow = patch.dataFlow; } // undefined = back to "follow the page"
          if (patch.flowSpeed !== undefined) data.flowSpeed = patch.flowSpeed;
          if (patch.flowDensity !== undefined) data.flowDensity = patch.flowDensity;
          if (patch.flowStyle !== undefined) data.flowStyle = patch.flowStyle;
          if (patch.flowDir !== undefined) data.flowDir = patch.flowDir;
          if (patch.preset !== undefined) data.preset = patch.preset;
          else if (patch.color !== undefined) delete data.preset; // a manual colour detaches from the preset
          const next: DiagramEdge = { ...e, data };
          if (patch.label !== undefined) next.label = patch.label === '' ? undefined : patch.label;
          else if (data.kind === 'replication' && data.replMode && (patch.kind !== undefined || patch.replMode !== undefined)) next.label = data.replMode;
          return styleEdge(next);
        }),
      };
    }),

  setEdgeRoute: (id, waypoints, record = true) =>
    set((s) => ({
      ...(record ? pushPast(s) : {}),
      edges: s.edges.map((e) => (e.id === id && !e.data?.locked ? styleEdge({ ...e, data: { ...e.data, manual: true, waypoints } }) : e)),
    })),
  resetRoute: (id) =>
    set((s) => ({
      ...pushPast(s),
      edges: s.edges.map((e) => {
        if (e.id !== id) return e;
        const { manual: _m, waypoints: _w, labelT: _t, labelOffset: _o, ...data } = e.data ?? {};
        void _m; void _w; void _t; void _o;
        return styleEdge({ ...e, data });
      }),
    })),
  tidyEdges: () =>
    set((s) => ({
      ...pushPast(s),
      edges: s.edges.map((e) => {
        if (e.data?.locked) return e;
        const { manual: _m, waypoints: _w, labelT: _t, labelOffset: _o, ...data } = e.data ?? {};
        void _m; void _w; void _t; void _o;
        return styleEdge({ ...e, data });
      }),
    })),
  setLabelPosition: (id, t, offset, record = true) =>
    set((s) => ({
      ...(record ? pushPast(s) : {}),
      edges: s.edges.map((e) => (e.id === id ? styleEdge({ ...e, data: { ...e.data, labelT: Math.max(0, Math.min(1, t)), ...(offset !== undefined ? { labelOffset: offset } : {}) } }) : e)),
    })),
  reconnectEdge: (id, to) => {
    const s = get();
    const e = s.edges.find((x) => x.id === id);
    if (!e || e.data?.locked) return false;
    const source = to.source ?? e.source;
    const target = to.target ?? e.target;
    const ids = new Set(s.nodes.map((n) => n.id));
    if (source === target || !ids.has(source) || !ids.has(target)) return false;
    set((st) => ({
      ...pushPast(st),
      edges: st.edges.map((x) => {
        if (x.id !== id) return x;
        const { manual: _m, waypoints: _w, ...data } = x.data ?? {};
        void _m; void _w;
        // the moved end floats again (nearest side); the other end keeps whatever it had
        if (to.source) delete data.pinSource;
        if (to.target) delete data.pinTarget;
        return styleEdge({ ...x, source, target, sourceHandle: to.source ? undefined : x.sourceHandle, targetHandle: to.target ? undefined : x.targetHandle, data });
      }),
    }));
    return true;
  },
  reverseEdge: (id) =>
    set((s) => ({
      ...pushPast(s),
      edges: s.edges.map((e) =>
        e.id === id
          ? relationOf(e) ? reverseRelation(e) : styleEdge({ ...e, source: e.target, target: e.source, sourceHandle: e.targetHandle, targetHandle: e.sourceHandle })
          : e,
      ),
    })),

  updateTable: (id, fn) =>
    set((s) => {
      const nodes = s.nodes.map((n) => (n.id === id && n.type === 'table' ? withTableSize({ ...n, data: fn(tableOf(n)) as unknown as DiagramNode['data'] }) : n));
      const edges = dropDanglingRelations(nodes, s.edges);
      return { ...pushPast(s), nodes: pruneFks(nodes, edges), edges };
    }),

  connectTables: (input) => {
    const r = createRelation(get().nodes, get().edges, input);
    if (!r) return null;
    set((s) => ({ ...pushPast(s), nodes: r.nodes, edges: r.edges.map((e) => (e.id === r.edgeId ? { ...e, className: undefined } : e)) }));
    return r.edgeId;
  },

  makeJunction: (edgeId) => {
    const r = createJunction(get().nodes, get().edges, edgeId);
    if (!r) return null;
    set((s) => ({ ...pushPast(s), nodes: r.nodes, edges: r.edges }));
    return r.junctionId;
  },

  foldJunction: (tableId) => {
    const r = showAsManyToMany(get().nodes, get().edges, tableId);
    if (!r) return false;
    set((s) => ({ ...pushPast(s), nodes: r.nodes, edges: r.edges }));
    return true;
  },

  unfoldJunction: (edgeId) => {
    const r = expandManyToMany(get().nodes, get().edges, edgeId);
    if (!r) return false;
    set((s) => ({ ...pushPast(s), nodes: r.nodes, edges: r.edges }));
    return true;
  },

  updateRelations: (edgeIds, patch) =>
    set((s) => {
      const ids = new Set(edgeIds);
      const edges = s.edges.map((e) => (ids.has(e.id) && relationOf(e) ? withRelation(e, patch) : e));
      return { ...pushPast(s), edges };
    }),

  setCardinality: (edgeIds, c) =>
    set((s) => {
      const ids = new Set(edgeIds);
      return { ...pushPast(s), edges: s.edges.map((e) => (ids.has(e.id) && relationOf(e) ? setCardinality(e, c) : e)) };
    }),

  updateClass: (id, fn) =>
    set((s) => {
      let edited: DiagramNode | undefined;
      const nodes = s.nodes.map((n) => (n.id === id && n.type === 'class' ? (edited = withClassSize({ ...n, data: fn(classOf(n)) as unknown as DiagramNode['data'] })) : n));
      const mid = edited && modelIdOf(edited);
      // a linked class: name and members change on every copy in the same undo step (positions stay per copy)
      if (!edited || !mid) return { ...pushPast(s), nodes };
      const r = propagateEverywhere({ nodes, stash: s.stash }, mid, classOf(edited), id);
      return { ...pushPast(s), nodes: r.nodes, ...(r.stash !== s.stash ? { stash: r.stash } : {}) };
    }),

  addLinkedClass: (source) => {
    const s = get();
    const onActive = source.pageId === s.activePageId;
    const list = onActive ? s.nodes : s.stash[source.pageId]?.nodes;
    const src = list?.find((n) => n.id === source.nodeId && n.type === 'class');
    if (!list || !src) return null;
    const mid = modelIdOf(src) ?? newModelId();
    const linked: DiagramNode = { ...src, data: { ...src.data, modelId: mid } as never };
    if (!modelIdOf(src)) {
      // the source joins the model first (not an undo step of its own: the link itself is harmless)
      const put = (nodes: DiagramNode[]) => nodes.map((n) => (n.id === src.id ? linked : n));
      if (onActive) set({ nodes: put(s.nodes) });
      else set({ stash: { ...s.stash, [source.pageId]: { ...s.stash[source.pageId], nodes: put(list) } } });
    }
    const id = newId('cls');
    const copy: DiagramNode = { ...linked, id, selected: true, position: { x: 0, y: 0 } };
    delete (copy as Partial<DiagramNode>).parentId;
    const before = new Set(get().nodes.map((n) => n.id));
    get().insertContent({ nodes: [copy], edges: [] });
    return get().nodes.find((n) => !before.has(n.id))?.id ?? null;
  },

  unlinkClass: (id) => {
    const n = get().nodes.find((x) => x.id === id && x.type === 'class');
    if (!n || !modelIdOf(n)) return false;
    set((s) => ({ ...pushPast(s), nodes: s.nodes.map((x) => { if (x.id !== id) return x; const { modelId: _m, ...rest } = x.data as unknown as Record<string, unknown>; void _m; return { ...x, data: rest as never }; }) }));
    return true;
  },

  linkRefsToClass: (classId) => {
    const s = get();
    const c = s.nodes.find((n) => n.id === classId && n.type === 'class');
    if (!c) return 0;
    const label = classOf(c).label;
    const mid = modelIdOf(c) ?? newModelId();
    let count = 0;
    const link = (nodes: DiagramNode[]): DiagramNode[] => nodes.map((n) => {
      if (n.type === 'object' && n.data.className === label && !n.data.modelId) { count++; return { ...n, data: { ...n.data, modelId: mid } as never }; }
      if (n.type === 'sequence') {
        const parts = (n.data as unknown as { participants: { name: string; modelId?: string }[] }).participants;
        if (!parts.some((p) => p.name === label && !p.modelId)) return n;
        return { ...n, data: { ...n.data, participants: parts.map((p) => (p.name === label && !p.modelId ? (count++, { ...p, modelId: mid }) : p)) } as never };
      }
      return n;
    });
    const stash = Object.fromEntries(Object.entries(s.stash).map(([pid, ps]) => [pid, { ...ps, nodes: link(ps.nodes) }]));
    const nodes = link(s.nodes).map((n) => (n.id === classId && !modelIdOf(n) ? { ...n, data: { ...n.data, modelId: mid } as never } : n));
    if (count) set({ ...pushPast(s), nodes, stash });
    return count;
  },

  updateSequence: (id, fn) =>
    set((s) => ({ ...pushPast(s), nodes: s.nodes.map((n) => (n.id === id && n.type === 'sequence' ? withSequenceSize({ ...n, data: fn(sequenceOf(n)) as unknown as DiagramNode['data'] }) : n)) })),

  updateTiming: (id, fn) =>
    set((s) => ({ ...pushPast(s), nodes: s.nodes.map((n) => (n.id === id && n.type === 'timing' ? withTimingSize({ ...n, data: fn(timingOf(n)) as unknown as DiagramNode['data'] }) : n)) })),

  tidyTiming: () => {
    const s = get();
    const sel = s.nodes.filter((n) => n.type === 'timing' && n.selected);
    const pick = new Set((sel.length ? sel : s.nodes.filter((n) => n.type === 'timing')).map((n) => n.id));
    if (!pick.size) return 0;
    set((st) => ({ ...pushPast(st), nodes: st.nodes.map((n) => (pick.has(n.id) ? withTimingSize({ ...n, data: tidyTiming(timingOf(n)).data as unknown as DiagramNode['data'] }) : n)) }));
    return pick.size;
  },

  editEdges: (fn) => set((s) => ({ ...pushPast(s), edges: fn(s.edges) })),

  updateState: (id, fn) =>
    set((s) => ({ ...pushPast(s), nodes: s.nodes.map((n) => (n.id === id && n.type === 'state' ? withStateSize({ ...n, data: fn(stateOf(n)) as unknown as DiagramNode['data'] }) : n)) })),

  updateShape: (id, fn) =>
    set((s) => ({ ...pushPast(s), nodes: s.nodes.map((n) => (n.id === id && (n.type === 'usecase' || n.type === 'component') ? withShapeSize({ ...n, data: fn(n.data) as DiagramNode['data'] }) : n.id === id && n.type === 'activity' ? withActivitySize({ ...n, data: fn(n.data) as DiagramNode['data'] }) : n.id === id && n.type === 'deployment' ? withDeploymentSize({ ...n, data: fn(n.data) as DiagramNode['data'] }) : n.id === id && n.type === 'object' ? withObjectSize({ ...n, data: fn(n.data) as DiagramNode['data'] }) : n)) })),

  addUmlEdge: (source, target, uml) => {
    const ids = new Set(get().nodes.map((n) => n.id));
    if ((source === target && uml.kind !== 'transition') || !ids.has(source) || !ids.has(target)) return null;
    const id = newId('e');
    set((s) => ({ ...pushPast(s), edges: [...s.edges, umlEdge(id, source, target, uml)] }));
    return id;
  },

  updateUml: (edgeIds, patch) =>
    set((s) => {
      const ids = new Set(edgeIds);
      const isClass = (id: string) => s.nodes.find((n) => n.id === id)?.type === 'class';
      return { ...pushPast(s), edges: s.edges.map((e) => (ids.has(e.id) && (e.data?.uml || (isClass(e.source) && isClass(e.target))) ? withUml(e, patch) : e)) };
    }),

  tidyUml: () => {
    const s = get();
    const sel = s.nodes.filter((n) => n.type === 'class' && n.selected);
    const scope = sel.length >= 2 ? new Set(sel.map((n) => n.id)) : null;
    const classes = s.nodes.filter((n) => n.type === 'class' && (!scope || scope.has(n.id)));
    if (!classes.length) return 0;
    const edges = s.edges.filter((e) => !scope || (scope.has(e.source) && scope.has(e.target)));
    const minX = Math.min(...classes.map((n) => n.position.x));
    const minY = Math.min(...classes.map((n) => n.position.y));
    const pos = layoutClasses(classes, edges, { origin: { x: minX, y: minY } });
    set((st) => ({ ...pushPast(st), ...tidied(st, st.nodes.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n))) }));
    return classes.length;
  },

  tidyStates: () => {
    const s = get();
    const model = diagramToStateModel(s.nodes, s.edges);
    if (!model.states.length) return 0;
    const boxes = layoutStates(model);
    const inModel = new Set(model.states.map((x) => x.id));
    const tops = s.nodes.filter((n) => inModel.has(n.id) && !(n.parentId && inModel.has(n.parentId)));
    const ox = tops.length ? Math.min(...tops.map((n) => n.position.x)) : 0;
    const oy = tops.length ? Math.min(...tops.map((n) => n.position.y)) : 0;
    set((st) => ({
      ...pushPast(st),
      ...tidied(st, st.nodes.map((n) => {
        const b = boxes.get(n.id);
        if (!b || !inModel.has(n.id)) return n;
        if (n.parentId && !inModel.has(n.parentId)) return n;
        const nested = !!n.parentId;
        return { ...n, position: nested ? { x: b.x, y: b.y } : { x: b.x + ox, y: b.y + oy }, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h } };
      })),
    }));
    return model.states.length;
  },

  tidyActivity: () => {
    const r = tidyActivity(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  tidyDeployment: () => {
    const r = tidyDeployment(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  tidyPackages: () => {
    const r = tidyPackages(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  nestPackages: (ids) => {
    const sel = ids ?? get().nodes.filter((n) => n.selected).map((n) => n.id);
    const id = newId('n');
    const next = nestInPackage(get().nodes, sel, id);
    if (!next) return null;
    set((st) => ({ ...pushPast(st), nodes: next }));
    return id;
  },

  tidyObjects: () => {
    const r = tidyObjects(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  instantiateClasses: (ids) => {
    const all = get().nodes;
    const pick = all.filter((n) => n.type === 'class' && (ids ? ids.includes(n.id) : n.selected));
    if (!pick.length) return [];
    const taken = new Set(all.filter((n) => n.type === 'object').map((n) => String(n.data.label)));
    const made: DiagramNode[] = [];
    for (const c of pick) {
      const o = instantiateClass(c, newId('n'), taken, absolutePosition(all, c));
      taken.add(String(o.data.label));
      made.push({ ...o, selected: true });
    }
    set((st) => ({ ...pushPast(st), nodes: [...st.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...made] }));
    return made.map((n) => n.id);
  },

  nestDeployment: (ids) => {
    const sel = ids ?? get().nodes.filter((n) => n.selected).map((n) => n.id);
    const id = newId('n');
    const next = nestInDeploymentNode(get().nodes, sel, id);
    if (!next) return null;
    set((st) => ({ ...pushPast(st), nodes: next }));
    return id;
  },

  unnestDeployment: (ids) => {
    const sel = ids ?? get().nodes.filter((n) => n.selected).map((n) => n.id);
    const next = unnestDeployment(get().nodes, sel);
    if (!next) return 0;
    set((st) => ({ ...pushPast(st), nodes: next }));
    return sel.length;
  },

  tidyUseCase: () => {
    const r = tidyUseCase(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  tidyComponents: () => {
    const r = tidyComponents(get().nodes, get().edges);
    if (!r) return 0;
    set((st) => ({ ...pushPast(st), ...tidied(st, r.nodes) }));
    return r.count;
  },

  nestComponents: (ids) => {
    const sel = ids ?? get().nodes.filter((n) => n.selected).map((n) => n.id);
    const id = newId('n');
    const next = nestInNode(get().nodes, sel, id);
    if (!next) return null;
    set((st) => ({ ...pushPast(st), nodes: next }));
    return id;
  },

  unnestComponents: (ids) => {
    const sel = ids ?? get().nodes.filter((n) => n.selected).map((n) => n.id);
    const next = unnestComponents(get().nodes, sel);
    if (!next) return 0;
    set((st) => ({ ...pushPast(st), nodes: next }));
    return sel.length;
  },

  tidyEr: () => {
    const s = get();
    const sel = s.nodes.filter((n) => n.type === 'table' && n.selected);
    const scope = sel.length >= 2 ? new Set(sel.map((n) => n.id)) : null;
    const tables = s.nodes.filter((n) => n.type === 'table' && (!scope || scope.has(n.id)));
    if (!tables.length) return 0;
    const edges = s.edges.filter((e) => !scope || (scope.has(e.source) && scope.has(e.target)));
    const minX = Math.min(...tables.map((n) => n.position.x));
    const minY = Math.min(...tables.map((n) => n.position.y));
    const pos = layoutTables(tables, edges, { origin: { x: minX, y: minY } });
    set((st) => ({ ...pushPast(st), ...tidied(st, st.nodes.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n))) }));
    return tables.length;
  },

  deleteEdges: (ids) =>
    set((s) => {
      const gone = new Set(ids.filter((id) => !s.edges.find((e) => e.id === id)?.data?.locked));
      if (!s.edges.some((e) => gone.has(e.id))) return s;
      const edges = s.edges.filter((e) => !gone.has(e.id));
      return { ...pushPast(s), nodes: pruneFks(s.nodes, edges), edges };
    }),

  deleteSelection: (explicit) => {
    const { nodes, edges } = get();
    const wantN = explicit?.nodes ? new Set(explicit.nodes) : null;
    const wantE = explicit?.edges ? new Set(explicit.edges) : null;
    const nIds = nodes.filter((n) => (wantN ? wantN.has(n.id) : explicit ? false : n.selected)).map((n) => n.id);
    const eIds = edges.filter((e) => (wantE ? wantE.has(e.id) : explicit ? false : e.selected)).map((e) => e.id);
    if (!nIds.length && !eIds.length) return 0;
    const r = deleteElements(nodes, edges, nIds, eIds);
    if (r.removedNodes || r.removedEdges) {
      const g = afterDelete(nodes, edges, nIds, r);
      set((s) => ({ ...pushPast(s), nodes: pruneFks(g.nodes, g.edges), edges: g.edges }));
    }
    return r.kept.length;
  },

  onNodesChange: (changes) =>
    set((s) => {
      const locked = new Set(s.nodes.filter((n) => n.data.locked).map((n) => n.id));
      const allowed = changes.filter((c) => !((c.type === 'position' || c.type === 'remove') && locked.has(c.id)));
      return { nodes: applyNodeChanges(allowed, s.nodes) };
    }),
  onEdgesChange: (changes) =>
    set((s) => {
      const locked = new Set(s.edges.filter((e) => e.data?.locked).map((e) => e.id));
      return { edges: applyEdgeChanges(changes.filter((c) => !(c.type === 'remove' && locked.has(c.id))), s.edges) };
    }),

  transform: (fn) => {
    const { nodes, edges } = get();
    const r = fn(nodes, edges);
    if (!r || (r.nodes === nodes && r.edges === edges)) return false;
    set((s) => ({ ...pushPast(s), nodes: r.nodes, edges: r.edges }));
    return true;
  },

  snapshot: () => (historyDriver ? historyDriver.checkpoint() : set((s) => pushPast(s))),

  endDrag: (id) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === id);
      if (!node) return s;
      const next = resolveParent(s.nodes, node);
      if (next === node) return s;
      return { nodes: adoptTech(sortParentsFirst(s.nodes.map((n) => (n.id === id ? next : n))), next) };
    }),

  undo: () => {
    if (historyDriver) return historyDriver.undo();
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      const stash = healStash({ nodes: prev.nodes, stash: s.stash });
      return { ...prev, ...(stash !== s.stash ? { stash } : {}), past: s.past.slice(0, -1), future: [snap(s), ...s.future] };
    });
  },

  redo: () => {
    if (historyDriver) return historyDriver.redo();
    set((s) => {
      const next = s.future[0];
      if (!next) return s;
      const stash = healStash({ nodes: next.nodes, stash: s.stash });
      return { ...next, ...(stash !== s.stash ? { stash } : {}), past: [...s.past, snap(s)], future: s.future.slice(1) };
    });
  },

  loadDiagram: (d) => set((s) => ({ ...pushPast(s), nodes: sortParentsFirst(normalizeLocks(d.nodes)), edges: d.edges.map((e) => styleEdge(e)) })),

  // ---------- selection ----------
  selectAll: () =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.selected ? n : { ...n, selected: true })), edges: s.edges.map((e) => (e.selected ? e : { ...e, selected: true })) })),
  selectOnly: (kind, id) =>
    set((s) => ({
      nodes: s.nodes.map((n) => ((kind === 'node' && n.id === id) === !!n.selected ? n : { ...n, selected: kind === 'node' && n.id === id })),
      edges: s.edges.map((e) => ((kind === 'edge' && e.id === id) === !!e.selected ? e : { ...e, selected: kind === 'edge' && e.id === id })),
    })),
  selectChildren: (groupId) =>
    set((s) => {
      const kids = new Set(descendantsOf(s.nodes, groupId).map((d) => d.id));
      return {
        nodes: s.nodes.map((n) => ({ ...n, selected: kids.has(n.id) })),
        edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      };
    }),

  // ---------- clipboard ----------
  copy: () => {
    const clip = copySelection(get().nodes, get().edges);
    if (clip) set({ clipboard: clip, pasteCount: 0 });
  },
  cut: () => {
    get().copy();
    get().deleteSelection();
  },
  paste: (at) => {
    const { clipboard, pasteCount } = get();
    if (!clipboard) return;
    const offset = at
      ? { x: at.x - clipboardOrigin(clipboard).x, y: at.y - clipboardOrigin(clipboard).y }
      : { x: 20 * (pasteCount + 1), y: 20 * (pasteCount + 1) };
    set((s) => {
      const pasted = pasteClipboard(clipboard, offset);
      const out = { ...pasted, nodes: placeInto(s.nodes, pasted.nodes) };
      return {
        ...pushPast(s),
        pasteCount: at ? s.pasteCount : s.pasteCount + 1,
        nodes: sortParentsFirst([...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...out.nodes]),
        edges: [...s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), ...out.edges.map((e) => styleEdge(e))],
      };
    });
  },
  duplicate: () => {
    const clip = copySelection(get().nodes, get().edges);
    if (!clip) return;
    set((s) => {
      const pasted = pasteClipboard(clip, { x: 20, y: 20 });
      const out = { ...pasted, nodes: placeInto(s.nodes, pasted.nodes) };
      return {
        ...pushPast(s),
        nodes: sortParentsFirst([...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...out.nodes]),
        edges: [...s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), ...out.edges.map((e) => styleEdge(e))],
      };
    });
  },
  copyStyle: () => {
    const n = get().nodes.find((x) => x.selected);
    if (n) return set({ styleClip: { kind: 'node', data: pick(n.data, NODE_STYLE_KEYS) as Partial<DiagramNodeData> } });
    const e = get().edges.find((x) => x.selected);
    if (e) set({ styleClip: { kind: 'edge', data: pick(e.data ?? {}, EDGE_STYLE_KEYS) as EdgePatch } });
  },
  pasteStyle: () => {
    const clip = get().styleClip;
    if (!clip) return;
    if (clip.kind === 'node') {
      const ids = selectedNodeIds(get());
      if (ids.length) get().updateNodesData(ids, clip.data);
    } else {
      const ids = get().edges.filter((e) => e.selected).map((e) => e.id);
      if (ids.length) get().updateEdges(ids, clip.data);
    }
  },

  updateSelectionStyle: (patch) => {
    const s = get();
    const r = applyBulk(s.nodes, selectedNodeIds(s), patch);
    if (!r.changed) return 0;
    set({ ...pushPast(s), nodes: r.nodes });
    return r.changed;
  },
  matchSelectionSize: () => {
    const s = get();
    const r = matchSize(s.nodes, selectedNodeIds(s));
    if (!r.changed) return 0;
    set({ ...pushPast(s), nodes: r.nodes });
    return r.changed;
  },
  applyLineStyleToAll: (lineType, scope) => {
    const s = get();
    // straight / curved cannot follow hand-drawn orthogonal waypoints: they are cleared (the caller confirms that first)
    const set1 = (edges: DiagramEdge[]) =>
      edges.map((e) => {
        const { manual: _m, waypoints: _w, ...rest } = e.data ?? {};
        return styleEdge({ ...e, data: lineType === 'curved' || lineType === 'straight' ? { ...rest, lineType } : { ...e.data, lineType } });
      });
    let count = s.edges.length;
    const stash: Record<string, PageState> = { ...s.stash };
    if (scope === 'project') for (const [id, ps] of Object.entries(s.stash)) {
      count += ps.edges.length;
      stash[id] = { ...ps, edges: set1(ps.edges) };
    }
    set({ ...pushPast(s), edges: set1(s.edges), ...(scope === 'project' ? { stash } : {}) });
    return count;
  },
  resetSelectionStyle: () =>
    set((s) => {
      const r = resetStyle(s.nodes, s.edges, selectedNodeIds(s), s.edges.filter((e) => e.selected).map((e) => e.id));
      return { ...pushPast(s), nodes: r.nodes, edges: r.edges.map((e) => styleEdge(e)) };
    }),
  selectSimilar: (mode, anchor) => {
    const s = get();
    const a = anchor ?? (s.nodes.find((n) => n.selected) ? { kind: 'node' as const, id: s.nodes.find((n) => n.selected)!.id } : s.edges.find((e) => e.selected) ? { kind: 'edge' as const, id: s.edges.find((e) => e.selected)!.id } : null);
    if (!a) return 0;
    const r = selectSimilar(s.nodes, s.edges, a, mode);
    const ns = new Set(r.nodeIds);
    const es = new Set(r.edgeIds);
    set({ nodes: s.nodes.map((n) => ({ ...n, selected: ns.has(n.id) })), edges: s.edges.map((e) => ({ ...e, selected: es.has(e.id) })) });
    return ns.size + es.size;
  },

  // ---------- arrange ----------
  nudgeSelection: (dx, dy) =>
    set((s) => {
      const sel = new Set(selectedNodeIds(s));
      const move = s.nodes.filter((n) => sel.has(n.id) && !n.data.locked && !ancestorsOf(s.nodes, n.id).some((a) => sel.has(a.id))).map((n) => n.id);
      if (!move.length) return s;
      const m = new Set(move);
      return {
        ...pushPast(s),
        nodes: s.nodes.map((n) => (m.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
      };
    }),
  alignSelection: (mode) =>
    set((s) => {
      const nodes = alignNodes(s.nodes, selectedNodeIds(s), mode);
      return nodes === s.nodes ? s : { ...pushPast(s), nodes };
    }),
  distributeSelection: (axis) =>
    set((s) => {
      const nodes = distributeNodes(s.nodes, selectedNodeIds(s), axis);
      return nodes === s.nodes ? s : { ...pushPast(s), nodes };
    }),
  reorderSelection: (mode) =>
    set((s) => {
      const ids = selectedNodeIds(s);
      if (!ids.length) return s;
      const nodes = reorderZ(s.nodes, ids, mode);
      return nodes.every((n, i) => n === s.nodes[i]) ? s : { ...pushPast(s), nodes };
    }),
  toggleLock: () =>
    set((s) => {
      const selN = s.nodes.filter((n) => n.selected);
      const selE = s.edges.filter((e) => e.selected);
      if (!selN.length && !selE.length) return s;
      const lock = [...selN, ...selE].some((x) => !x.data?.locked);
      return {
        ...pushPast(s),
        nodes: s.nodes.map((n) => {
          if (!n.selected) return n;
          if (lock) return { ...n, draggable: false, deletable: false, data: { ...n.data, locked: true } };
          const { draggable: _d, deletable: _x, ...rest } = n;
          void _d; void _x;
          const { locked: _l, ...data } = n.data;
          void _l;
          return { ...rest, data: data as DiagramNodeData };
        }),
        edges: s.edges.map((e) => {
          if (!e.selected) return e;
          const data = { ...e.data };
          if (lock) data.locked = true;
          else delete data.locked;
          return styleEdge({ ...e, data });
        }),
      };
    }),
  groupSelection: () =>
    set((s) => {
      const r = groupNodes(s.nodes, selectedNodeIds(s), newId('g'));
      return r ? { ...pushPast(s), nodes: r.nodes, edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)) } : s;
    }),
  ungroup: (groupId) => set((s) => ({ ...pushPast(s), nodes: ungroupNode(s.nodes, groupId) })),
  removeFromGroup: (ids) => set((s) => ({ ...pushPast(s), nodes: detach(s.nodes, ids) })),

  // ---------- clusters ----------
  setRole: (ids, role) => {
    if (role !== null) {
      const v = validateRole(role);
      if (!v.ok) return false;
      role = v.role;
    }
    set((s) => {
      const sel = new Set(ids);
      return {
        ...pushPast(s),
        nodes: s.nodes.map((n) => {
          if (!sel.has(n.id)) return n;
          const { role: _r, ...data } = n.data;
          void _r;
          return { ...n, data: (role === null ? data : { ...data, role }) as DiagramNodeData };
        }),
      };
    });
    return true;
  },
  toggleCollapse: (clusterId) =>
    set((s) => {
      const t = s.nodes.find((n) => n.id === clusterId);
      if (!t || t.type !== 'cluster') return s;
      if (!t.data.collapsed) return { ...pushPast(s), nodes: collapseCluster(s.nodes, clusterId) };
      const before = rectOf(s.nodes, t);
      return { ...pushPast(s), nodes: pushSiblingsClear(expandCluster(s.nodes, clusterId), clusterId, before) };
    }),
  addReplica: (clusterId) => {
    const st = get();
    const cluster = st.nodes.find((n) => n.id === clusterId);
    if (!cluster || cluster.type !== 'cluster') return null;
    const members = descendantsOf(st.nodes, clusterId).filter((n) => !isContainer(n));
    const primary = members.find((m) => isPrimaryRole(m.data.role)) ?? members[0];
    if (!primary) return null;
    const siblings = members.filter((m) => m.parentId === primary.parentId);
    const id = newId('n');
    const replicas = members.filter((m) => m.data.role === 'replica').length;
    const lowest = Math.max(...siblings.map((m) => m.position.y));
    const mode = (cluster.data.replication as ReplMode | undefined) ?? 'async';
    const node: DiagramNode = {
      id, type: 'icon', parentId: primary.parentId, position: { x: primary.position.x, y: lowest + 110 }, width: primary.width, height: primary.height,
      data: { label: `replica-${replicas + 1}`, iconId: primary.data.iconId, role: 'replica', ...(primary.data.subtitle ? { subtitle: primary.data.subtitle } : {}) },
    };
    set((s) => ({
      ...pushPast(s),
      nodes: sortParentsFirst([...s.nodes, node]),
      edges: [...s.edges, styleEdge({ id: newId('e'), source: primary.id, target: id, sourceHandle: 'bottom', targetHandle: 'top', label: mode, data: { kind: 'replication', replMode: mode } } as DiagramEdge)],
    }));
    return id;
  },
  wrapSelectionInCluster: () =>
    set((s) => {
      const sel = s.nodes.filter((n) => n.selected && !isContainer(n));
      const icons = new Set(sel.map((n) => n.data.iconId).filter(Boolean));
      const tech = icons.size === 1 ? [...icons][0] : undefined;
      const label = tech ? `${sel.find((n) => n.data.iconId === tech)!.data.label.replace(/[-_ ]\d+$/, '')} cluster` : 'Cluster';
      const r = groupNodes(s.nodes, sel.map((n) => n.id), newId('c'), 28, 36, 'cluster', { label, ...(tech ? { iconId: tech as string } : {}) });
      return r ? { ...pushPast(s), nodes: r.nodes } : s;
    }),

  createCluster: (profileId, params, at) => {
    const profile = getProfile(profileId);
    if (!profile) return null;
    const parsed = profile.schema.safeParse(params);
    if (!parsed.success) return null;
    const prefix = newId('c');
    const want = at ?? { x: 0, y: 0 };
    const first = instantiate(profile, parsed.data as Record<string, unknown>, prefix, want);
    const spot = freeSpot(get().nodes, want, first.size);
    const g = spot.y === want.y ? first : instantiate(profile, parsed.data as Record<string, unknown>, prefix, spot);
    set((s) => ({
      ...pushPast(s),
      nodes: sortParentsFirst([...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...g.nodes.map((n) => (n.id === prefix ? { ...n, selected: true } : n))]),
      edges: [...s.edges, ...g.edges.map((e) => styleEdge(e))],
    }));
    return prefix;
  },
  updateCluster: (clusterId, params) => {
    const root = get().nodes.find((n) => n.id === clusterId);
    const profile = root?.data.profileId ? getProfile(root.data.profileId) : undefined;
    if (!root || !profile) return false;
    const parsed = profile.schema.safeParse(params);
    if (!parsed.success) return false;
    set((s) => {
      const r = regenerateCluster(s.nodes, s.edges, clusterId, profile, parsed.data as Record<string, unknown>);
      const before = rectOf(s.nodes, s.nodes.find((n) => n.id === clusterId)!);
      return { ...pushPast(s), nodes: pushSiblingsClear(r.nodes, clusterId, before), edges: r.edges.map((e) => styleEdge(e)) };
    });
    return true;
  },

  // ---------- pages ----------
  addPage: (name, content) => {
    const page = freshPage(name?.trim() || `Page ${get().pages.length + 1}`);
    set((s) => ({
      stash: { ...s.stash, [s.activePageId]: { nodes: s.nodes, edges: s.edges, past: s.past, future: s.future } },
      pages: [...s.pages, page],
      activePageId: page.id,
      nodes: content ? sortParentsFirst(content.nodes) : [],
      edges: content ? content.edges : [],
      past: [],
      future: [],
    }));
    return page.id;
  },
  renamePage: (id, name) => {
    const t = name.trim();
    if (!t) return;
    set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name: t } : p)) }));
  },
  deletePage: (id) => {
    const s = get();
    if (s.pages.length <= 1 || !s.pages.some((p) => p.id === id)) return false;
    const idx = s.pages.findIndex((p) => p.id === id);
    const pages = s.pages.filter((p) => p.id !== id);
    const { [id]: _gone, ...stash } = s.stash;
    void _gone;
    const { [id]: _vp, ...viewports } = s.viewports;
    void _vp;
    if (id !== s.activePageId) {
      set({ pages, stash, viewports });
      return true;
    }
    const next = pages[Math.min(idx, pages.length - 1)];
    const { [next.id]: ps, ...rest } = stash;
    set({ pages, viewports, stash: rest, activePageId: next.id, nodes: ps?.nodes ?? [], edges: ps?.edges ?? [], past: ps?.past ?? [], future: ps?.future ?? [] });
    return true;
  },
  duplicatePage: (id) => {
    const s = get();
    const src = s.pages.find((p) => p.id === id);
    const content = id === s.activePageId ? { nodes: s.nodes, edges: s.edges } : s.stash[id];
    if (!src || !content) return s.activePageId;
    const copy: PageMeta = freshPage(`${src.name} (copy)`);
    const idx = s.pages.findIndex((p) => p.id === id);
    const pages = [...s.pages.slice(0, idx + 1), copy, ...s.pages.slice(idx + 1)];
    set({
      stash: { ...s.stash, [s.activePageId]: { nodes: s.nodes, edges: s.edges, past: s.past, future: s.future } },
      pages,
      activePageId: copy.id,
      nodes: structuredClone(content.nodes).map((n) => ({ ...n, selected: false })),
      edges: structuredClone(content.edges).map((e) => ({ ...e, selected: false })),
      past: [],
      future: [],
    });
    return copy.id;
  },
  switchPage: (id) =>
    set((s) => {
      if (id === s.activePageId || !s.pages.some((p) => p.id === id)) return s;
      const target = s.stash[id] ?? { nodes: [], edges: [], past: [], future: [] };
      const { [id]: _t, ...rest } = s.stash;
      void _t;
      return {
        stash: { ...rest, [s.activePageId]: { nodes: s.nodes, edges: s.edges, past: s.past, future: s.future } },
        activePageId: id,
        nodes: target.nodes,
        edges: target.edges,
        past: target.past,
        future: target.future,
      };
    }),
  importPages: (incoming) =>
    set((s) => {
      const fresh = duplicatePages(incoming);
      const stash = { ...s.stash };
      for (const p of fresh) stash[p.id] = { nodes: sortParentsFirst(normalizeLocks(p.nodes)), edges: p.edges.map((e) => styleEdge(e)), past: [], future: [] };
      return { stash, pages: [...s.pages, ...fresh.map((p) => ({ id: p.id, name: p.name }))] };
    }),
  setProjectName: (name) => set({ projectName: name }),
  loadProject: (p) => {
    const stash: Record<string, PageState> = {};
    for (const pg of p.pages) if (pg.id !== p.activePageId) stash[pg.id] = { nodes: sortParentsFirst(normalizeLocks(pg.nodes)), edges: pg.edges.map((e) => styleEdge(e)), past: [], future: [] };
    const active = p.pages.find((pg) => pg.id === p.activePageId) ?? p.pages[0];
    registerCustomIcons(p.assets);
    set({
      projectId: p.id,
      projectName: p.name,
      createdAt: p.createdAt,
      pages: p.pages.map((pg) => ({ id: pg.id, name: pg.name })),
      activePageId: active.id,
      stash,
      projectSettings: p.settings ?? {},
      assets: p.assets ?? {},
      viewports: Object.fromEntries(p.pages.filter((pg) => pg.viewport).map((pg) => [pg.id, pg.viewport as Viewport])),
      pageFlow: Object.fromEntries(p.pages.filter((pg) => pg.flow).map((pg) => [pg.id, true])),
      guides: Object.fromEntries(p.pages.filter((pg) => pg.guides?.length).map((pg) => [pg.id, pg.guides as Guide[]])),
      nodes: sortParentsFirst(normalizeLocks(active.nodes)),
      edges: active.edges.map((e) => styleEdge(e)),
      past: [],
      future: [],
    });
  },
  toProject: () => sliceToProject(get()),
  captureTab: () => {
    const s = get();
    return Object.fromEntries(TAB_KEYS.map((k) => [k, s[k]])) as unknown as TabSlice;
  },
  restoreTab: (slice) => {
    registerCustomIcons(slice.assets);
    set({ ...slice });
  },

  reset: () => set(initialState()),
}));
