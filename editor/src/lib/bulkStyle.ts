import type { DiagramEdge, DiagramNode, DiagramNodeData, EdgeData, NodeKind } from '../types';
import { resolveEdgeStyle, resolveNodeStyle, type Settings } from './settings';
import { nodeSize } from './graph';
import { resolveFlowDir, resolveFlowLook } from './flow/resolve';

export type NodeField = 'background' | 'fill' | 'opacity' | 'stroke' | 'strokeStyle' | 'strokeWidth' | 'radius' | 'shadow' | 'fontSize' | 'bold' | 'textColor' | 'align' | 'iconSize' | 'accent';
export type EdgeField = 'color' | 'preset' | 'lineType' | 'strokeWidth' | 'strokeStyle' | 'arrows' | 'labelBg' | 'labelColor' | 'labelBold' | 'labelSide' | 'dataFlow' | 'flowSpeed' | 'flowDensity' | 'flowStyle' | 'flowDir';

const BOXES: NodeKind[] = ['icon', 'shape', 'sticky', 'card'];
const CONTAINERS: NodeKind[] = ['group', 'cluster'];
const TEXTY: NodeKind[] = [...BOXES, 'text', ...CONTAINERS];
/** which kinds each field applies to; a bulk change silently skips the rest */
export const FIELD_KINDS: Record<NodeField, NodeKind[]> = {
  background: [...BOXES, 'text', 'group'],
  fill: [...BOXES, 'text', ...CONTAINERS],
  opacity: [...BOXES, 'text', ...CONTAINERS],
  stroke: [...BOXES, ...CONTAINERS, 'draw'],
  strokeStyle: [...BOXES, ...CONTAINERS],
  strokeWidth: [...BOXES, ...CONTAINERS, 'draw'],
  radius: [...BOXES, 'text', ...CONTAINERS],
  shadow: BOXES,
  fontSize: TEXTY,
  bold: TEXTY,
  textColor: TEXTY,
  align: ['shape', 'sticky', 'text', ...CONTAINERS],
  iconSize: ['icon'],
  /** ER table header colour */
  accent: ['table'],
};
export const NODE_FIELDS = Object.keys(FIELD_KINDS) as NodeField[];

export interface Mixed<T = unknown> {
  /** how many selected items the field applies to */
  applicable: number;
  /** values differ between the applicable items */
  mixed: boolean;
  /** the shared value, or the first item's value when mixed */
  value: T;
}

const applies = (field: NodeField, n: DiagramNode) => FIELD_KINDS[field].includes(n.type ?? 'icon');

/** The value shown for a field on one node (resolved through component > project > global > built-in). */
export function nodeFieldValue(n: DiagramNode, field: NodeField, settings: Pick<Settings, 'node' | 'group'>): unknown {
  const kind = n.type ?? 'icon';
  const v = resolveNodeStyle(n.data, kind, settings as Settings);
  const d = n.data;
  switch (field) {
    case 'background': return kind === 'group' ? ((v.fillOpacity > 0 ? 'filled' : 'transparent') as 'filled' | 'transparent') : v.background;
    case 'fill': return v.fill;
    case 'opacity': return CONTAINERS.includes(kind) ? v.fillOpacity : v.opacity;
    case 'stroke': return v.borderColor;
    case 'strokeStyle': return v.borderStyle;
    case 'strokeWidth': return v.borderWidth;
    case 'radius': return v.radius;
    case 'shadow': return v.shadow;
    case 'fontSize': return d.fontSize ?? (kind === 'text' ? 14 : 12);
    case 'bold': return !!d.bold;
    case 'textColor': return v.textColor ?? '#2d3340';
    case 'align': return d.align ?? 'center';
    case 'iconSize': return d.iconSize ?? 48;
    case 'accent': return (d.accent as string | undefined) ?? '#2f6fdb';
  }
}

/** Per-field mixed-state for a selection (fields that apply to no selected node are omitted). */
export function computeMixed(nodes: DiagramNode[], settings: Pick<Settings, 'node' | 'group'>): Partial<Record<NodeField, Mixed>> {
  const out: Partial<Record<NodeField, Mixed>> = {};
  for (const f of NODE_FIELDS) {
    const list = nodes.filter((n) => applies(f, n));
    if (!list.length) continue;
    const values = list.map((n) => nodeFieldValue(n, f, settings));
    out[f] = { applicable: list.length, mixed: values.some((v) => v !== values[0]), value: values[0] };
  }
  return out;
}

/** data patch for one node and field (null = not applicable). Groups store opacity as `fillOpacity`. */
export function fieldPatch(n: DiagramNode, field: NodeField, value: unknown): Partial<DiagramNodeData> | null {
  if (!applies(field, n)) return null;
  if (field === 'opacity' && CONTAINERS.includes(n.type ?? 'icon')) return { fillOpacity: value as number };
  // a font size picked by hand ends the sticky's fit-to-note mode
  if (field === 'fontSize' && n.type === 'sticky') return { fontSize: value as number, autoFont: false };
  // groups have no `background` flag: filled = a tinted fill (fillOpacity > 0), same as the single-node inspector
  if (field === 'background' && n.type === 'group') return { fillOpacity: value === 'filled' ? ((n.data.fillOpacity as number | undefined) || 12) : 0 };
  return { [field]: value } as Partial<DiagramNodeData>;
}

/** Apply a multi-field patch to the given ids, skipping fields that do not apply to a node's kind. */
export function applyBulk(nodes: DiagramNode[], ids: string[], patch: Partial<Record<NodeField, unknown>>): { nodes: DiagramNode[]; changed: number } {
  const sel = new Set(ids);
  let changed = 0;
  const out = nodes.map((n) => {
    if (!sel.has(n.id)) return n;
    let data: DiagramNodeData | null = null;
    for (const [f, v] of Object.entries(patch) as [NodeField, unknown][]) {
      const p = fieldPatch(n, f, v);
      if (p) data = { ...(data ?? n.data), ...p };
    }
    if (!data) return n;
    changed++;
    return { ...n, data };
  });
  return { nodes: out, changed };
}

type EdgeSettings = Pick<Settings, 'edge'> & Partial<Pick<Settings, 'edgePresets'>>;
export const EDGE_FIELDS: EdgeField[] = ['color', 'preset', 'lineType', 'strokeWidth', 'strokeStyle', 'arrows', 'labelBg', 'labelColor', 'labelBold', 'labelSide', 'dataFlow', 'flowSpeed', 'flowDensity', 'flowStyle', 'flowDir'];

export function edgeFieldValue(e: DiagramEdge, field: EdgeField, settings: EdgeSettings): unknown {
  const v = resolveEdgeStyle(e.data ?? {}, settings);
  switch (field) {
    case 'color': return v.color;
    case 'preset': return e.data?.preset ?? '';
    case 'lineType': return v.lineType;
    case 'strokeWidth': return v.width;
    case 'strokeStyle': return v.strokeStyle;
    case 'arrows': return v.arrows;
    case 'labelBg': return v.labelBackground;
    case 'labelColor': return e.data?.labelColor ?? v.color;
    case 'labelBold': return !!e.data?.labelBold;
    case 'labelSide': return e.data?.labelSide ?? 'auto';
    case 'dataFlow': return e.data?.dataFlow ?? null;
    case 'flowSpeed': return resolveFlowLook(e.data, settings.edgePresets ?? []).speed;
    case 'flowDensity': return resolveFlowLook(e.data, settings.edgePresets ?? []).density;
    case 'flowStyle': return resolveFlowLook(e.data, settings.edgePresets ?? []).style;
    case 'flowDir': return e.data?.flowDir ?? resolveFlowDir(e.data, resolveEdgeStyle(e.data ?? {}, settings).arrows) ?? 'forward';
  }
}
export function computeMixedEdges(edges: DiagramEdge[], settings: EdgeSettings): Partial<Record<EdgeField, Mixed>> {
  const out: Partial<Record<EdgeField, Mixed>> = {};
  if (!edges.length) return out;
  for (const f of EDGE_FIELDS) {
    const values = edges.map((e) => edgeFieldValue(e, f, settings));
    out[f] = { applicable: edges.length, mixed: values.some((v) => v !== values[0]), value: values[0] };
  }
  return out;
}

export type SimilarMode = 'type' | 'icon' | 'preset';
/** ids of items "like" the anchor: same node type / same icon / same edge preset (edges: preset or all edges). */
export function selectSimilar(nodes: DiagramNode[], edges: DiagramEdge[], anchor: { kind: 'node' | 'edge'; id: string }, mode: SimilarMode): { nodeIds: string[]; edgeIds: string[] } {
  if (anchor.kind === 'edge') {
    const a = edges.find((e) => e.id === anchor.id);
    if (!a) return { nodeIds: [], edgeIds: [] };
    const same = (e: DiagramEdge) => (mode === 'preset' ? (e.data?.preset ?? '') === (a.data?.preset ?? '') : true);
    return { nodeIds: [], edgeIds: edges.filter(same).map((e) => e.id) };
  }
  const a = nodes.find((n) => n.id === anchor.id);
  if (!a) return { nodeIds: [], edgeIds: [] };
  const same = (n: DiagramNode) => {
    if (n.hidden) return false;
    if (mode === 'icon') return !!a.data.iconId && n.data.iconId === a.data.iconId;
    if (mode === 'preset') return !!a.data.profileId && n.data.profileId === a.data.profileId;
    return n.type === a.type;
  };
  return { nodeIds: nodes.filter(same).map((n) => n.id), edgeIds: [] };
}

const RESIZABLE: NodeKind[] = ['group', 'cluster', 'shape', 'sticky', 'card', 'text'];
/** width/height of the first selected node applied to the other resizable, unlocked ones. */
export function matchSize(nodes: DiagramNode[], ids: string[]): { nodes: DiagramNode[]; changed: number } {
  const sel = nodes.filter((n) => ids.includes(n.id));
  const first = sel.find((n) => RESIZABLE.includes(n.type ?? 'icon'));
  if (!first) return { nodes, changed: 0 };
  const { width, height } = nodeSize(first);
  let changed = 0;
  const out = nodes.map((n) => {
    if (n.id === first.id || !ids.includes(n.id) || !RESIZABLE.includes(n.type ?? 'icon') || n.data.locked || n.data.collapsed) return n;
    const s = nodeSize(n);
    if (s.width === width && s.height === height) return n;
    changed++;
    return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
  });
  return { nodes: out, changed };
}

const NODE_STYLE_DATA = ['background', 'fill', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeStyle', 'radius', 'opacity', 'border', 'shadow', 'fontSize', 'bold', 'textColor', 'align', 'iconSize', 'labelColor', 'subtitleColor'];
const EDGE_STYLE_DATA = ['color', 'dashed', 'strokeStyle', 'strokeWidth', 'lineType', 'arrows', 'labelBg', 'labelColor', 'labelBold', 'labelSide', 'preset', 'flow', 'dataFlow', 'flowSpeed', 'flowDensity', 'flowStyle', 'flowDir'];
/** Reset style overrides on the selection (back to project / global / built-in defaults). */
export function resetStyle(nodes: DiagramNode[], edges: DiagramEdge[], nodeIds: string[], edgeIds: string[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const ns = new Set(nodeIds);
  const es = new Set(edgeIds);
  return {
    nodes: nodes.map((n) => {
      if (!ns.has(n.id) || n.type === 'draw') return n;
      const data: Record<string, unknown> = { ...n.data };
      for (const k of NODE_STYLE_DATA) delete data[k];
      return { ...n, data: data as DiagramNodeData };
    }),
    edges: edges.map((e) => {
      if (!es.has(e.id)) return e;
      const data: Record<string, unknown> = { ...(e.data ?? {}) };
      for (const k of EDGE_STYLE_DATA) delete data[k];
      return { ...e, data: data as EdgeData };
    }),
  };
}
