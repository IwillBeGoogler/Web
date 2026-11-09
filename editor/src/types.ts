import type { Edge, Node } from '@xyflow/react';

export type NodeKind = 'icon' | 'group' | 'text' | 'shape' | 'sticky' | 'draw' | 'cluster' | 'card' | 'junction' | 'table' | 'class' | 'sequence' | 'state' | 'usecase' | 'activity' | 'component' | 'deployment' | 'object' | 'timing' | 'frame' | 'mindmap' | 'stamp';
export const NODE_KINDS: NodeKind[] = ['icon', 'group', 'text', 'shape', 'sticky', 'draw', 'cluster', 'card', 'junction', 'table', 'class', 'sequence', 'state', 'usecase', 'activity', 'component', 'deployment', 'object', 'timing', 'frame', 'mindmap', 'stamp'];

export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'diamond' | 'cylinder' | 'ellipsis';
export interface CardTag {
  text: string;
  color: string;
}
export type GroupVariant = 'dashed' | 'card' | 'package' | 'boundary' | 'composite' | 'lane';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type TextAlign = 'left' | 'center' | 'right';

/** Phase 5 (schema v7) ------------------------------------------------------------------------------------------------ */
export type LayoutMode = 'row' | 'column' | 'grid';
/** auto-layout container (a `group` with `data.autoLayout`): children reflow on add / remove / resize */
export interface AutoLayoutConfig {
  mode: LayoutMode;
  gap: number;
  /** grid only: vertical gap (defaults to `gap`) */
  gapY?: number;
  /** uniform padding */
  padding: number;
  /** cross-axis alignment of the children */
  align: 'start' | 'center' | 'end' | 'stretch';
  /** main-axis distribution when the container is larger than its content */
  justify: 'start' | 'center' | 'end' | 'between';
  /** grid: number of columns */
  columns?: number;
  /** hug: the container shrinks / grows to its content on that axis */
  hugW: boolean;
  hugH: boolean;
}
export type SizingMode = 'fixed' | 'fill' | 'hug';
export interface LayoutSizing { w: SizingMode; h: SizingMode }
export interface NodeConstraints {
  h: 'left' | 'right' | 'center' | 'stretch' | 'scale';
  v: 'top' | 'bottom' | 'center' | 'stretch' | 'scale';
}
/** prototype link: a node jumps to another file (or a node in it) */
export interface NodeLink { fileId: string; nodeId?: string }
/** instance of a project component: `overrides[instKey]` holds the per-instance edits of that child */
export interface InstanceData { componentId: string; rev: number; overrides: Record<string, Record<string, unknown>> }
export interface StyleRefs { fill?: string; stroke?: string; text?: string; effect?: string }
/** a horizontal (`y`) or vertical (`x`) guide line, persisted per file */
export interface Guide { id: string; axis: 'x' | 'y'; pos: number }

export type DiagramNodeData = {
  label: string;
  subtitle?: string;
  iconId?: string;
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  radius?: number;
  opacity?: number;
  fillOpacity?: number;
  background?: 'transparent' | 'filled';
  border?: boolean;
  shadow?: boolean;
  groupIcon?: string;
  /** cluster support: member role pill (primary, replica, ...) */
  role?: string;
  /** messaging clients: producer arrows point into a cluster, consumer arrows out of it */
  clientKind?: 'producer' | 'consumer';
  /** cluster support: collapsed to a compact node; the previous size is kept in expandedSize */
  collapsed?: boolean;
  expandedSize?: { width: number; height: number };
  topology?: string;
  replication?: string;
  accent?: string;
  profileId?: string;
  genPos?: { x: number; y: number };
  params?: Record<string, unknown>;
  warnings?: string[];
  partitions?: { topic: string; partition: number; leader: boolean }[];
  fontSize?: number;
  bold?: boolean;
  align?: TextAlign;
  textColor?: string;
  locked?: boolean;
  /** freehand: SVG path in node-local coordinates */
  path?: string;
  /** card node: coloured tags under the title, and layout */
  tags?: CardTag[];
  layout?: 'vertical' | 'horizontal';
  /** icon node: coloured caption lines */
  labelColor?: string;
  subtitleColor?: string;
  /** icon node: glyph size in px (default 48) */
  iconSize?: number;
  /** group look: dashed outline with centred title, or a solid tinted container card */
  variant?: GroupVariant;
  /** group: small caption at the bottom-left */
  caption?: string;
  /** group created by "Repeat group": index within the repeated set */
  repeatOf?: string;
  /** layers panel: hidden nodes are not drawn and not exported */
  hidden?: boolean;
  /** group that is the main component `componentMain` of the project library */
  componentMain?: string;
  /** group that is an instance of a project component; its children carry `instKey` */
  instance?: InstanceData;
  instKey?: string;
  autoLayout?: AutoLayoutConfig;
  layoutSizing?: LayoutSizing;
  constraints?: NodeConstraints;
  link?: NodeLink;
  /** project style ids (colour / text / effect) applied to this node */
  styles?: StyleRefs;
  /** dev mode: link to the source code of this element */
  source?: string;
  /** capacity & latency calculator inputs (schema v8) */
  capacity?: import('@core/capacity').NodeCapacity;
  /** per-component architecture config (OLTP / replication / cache strategy ...), see core/arch */
  arch?: import('@core/arch').ArchConfig;
} & Record<string, unknown>;

export type DiagramNode = Node<DiagramNodeData, NodeKind>;

export type LineType = 'orthogonal' | 'straight' | 'curved' | 'step-rounded';
export type MarkerKind = 'none' | 'arrow' | 'open' | 'triangle' | 'diamond' | 'circle' | 'crowfoot' | 'one' | 'zeroOrOne' | 'many' | 'oneOrMany' | 'zeroOrMany' | 'hollowTriangle' | 'filledDiamond' | 'hollowDiamond';
export const MARKER_KINDS: MarkerKind[] = ['none', 'arrow', 'open', 'triangle', 'diamond', 'circle', 'crowfoot', 'one', 'zeroOrOne', 'many', 'oneOrMany', 'zeroOrMany', 'hollowTriangle', 'filledDiamond', 'hollowDiamond'];
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type Arrows = 'none' | 'start' | 'end' | 'both';
export type EdgeKind = 'replication' | 'heartbeat' | 'failover' | 'sharding';
export type ReplMode = 'sync' | 'async' | 'semi-sync';

export type EdgeData = {
  dashed?: boolean;
  color?: string;
  strokeWidth?: number;
  lineType?: LineType;
  arrows?: Arrows;
  labelBg?: boolean;
  strokeStyle?: StrokeStyle;
  /** animated flowing dashes */
  flow?: boolean;
  /** data-flow packets: per-edge override (false = never, true = always, unset = follows the page's "Data flow" mode) and look */
  dataFlow?: boolean;
  flowSpeed?: 'slow' | 'normal' | 'fast';
  /** packets per 100px of line */
  flowDensity?: number;
  flowStyle?: 'dot' | 'dash' | 'pulse';
  flowDir?: 'forward' | 'reverse' | 'both';
  /** cluster-internal edge kind (default styling) */
  kind?: EdgeKind;
  replMode?: ReplMode;
  /** number of edges merged into this one while a cluster is collapsed */
  merged?: number;
  /** manual routing: interior bend / waypoints (absolute flow coordinates) and the manual flag */
  waypoints?: { x: number; y: number }[];
  manual?: boolean;
  /** pinned connection sides (set when the user drops on a specific handle); otherwise the nearest side is chosen */
  pinSource?: PortSide;
  pinTarget?: PortSide;
  /** label position: fraction along the path (0..1) and perpendicular offset in px */
  labelT?: number;
  labelOffset?: number;
  /** per-end arrowhead shapes (override `arrows`) */
  startMarker?: MarkerKind;
  endMarker?: MarkerKind;
  cornerRadius?: number;
  /** label styling: colour, bold, and which side of a vertical segment it sits on */
  labelColor?: string;
  labelBold?: boolean;
  labelSide?: 'auto' | 'on' | 'left' | 'right';
  /** named style preset (builtin or user-defined) this edge was styled with */
  preset?: string;
  locked?: boolean;
  /** ER relation (crow's foot) between two table columns, see lib/er/tableData */
  relation?: import('./lib/er/tableData').RelationData;
  /** UML relation (inheritance, composition ...) between two classes, see lib/uml/types */
  uml?: import('./lib/uml/types').UmlRelationData;
  /** capacity & latency calculator inputs of a call (schema v8) */
  traffic?: import('@core/capacity').EdgeTraffic;
} & Record<string, unknown>;

export type DiagramEdge = Edge<EdgeData>;

/** v1 single diagram (legacy import / autosave format). */
export interface Diagram {
  version: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** settings a template wants for its file (dark canvas, sketch look); applied as the new file's project-level settings */
  settings?: import('./lib/settings').PartialSettings;
}

export type DiagramContent = { nodes: DiagramNode[]; edges: DiagramEdge[]; version?: number; settings?: import('./lib/settings').PartialSettings };

export interface Page {
  id: string;
  name: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** last pan/zoom of this page (zoom 1 = 100%) */
  viewport?: { x: number; y: number; zoom: number };
  /** "Data flow" mode (animated packets on every edge) for this page */
  flow?: boolean;
  /** per-page overrides of project/global settings */
  settings?: import('./lib/settings').PartialSettings;
  /** ruler guides of this file */
  guides?: Guide[];
}

/**
 * Uploaded custom icon / image, content-addressed by sha256 (hex). `data` is base64 (standalone documents, .sdd files).
 * Without `data` the bytes live in the host's asset store (`GET <apiBase>/assets/<hash>`), the embedded editor's way.
 */
export interface ProjectAsset {
  mime: string;
  data?: string;
}

/** v2 project with multiple pages. */
export interface Project {
  version: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activePageId: string;
  pages: Page[];
  /** project-level overrides of the global settings (see lib/settings) */
  settings?: import('./lib/settings').PartialSettings;
  /** custom icons referenced as `asset:<sha256>` */
  assets?: Record<string, ProjectAsset>;
}

export const EDGE_COLORS = [
  { name: 'Dark gray', value: '#2d3340' },
  { name: 'Teal', value: '#0f7b6c' },
  { name: 'Red', value: '#d1344a' },
  { name: 'Blue', value: '#2f6fdb' },
] as const;
export const DEFAULT_EDGE_COLOR = EDGE_COLORS[0].value;
export const GRID = 20;
