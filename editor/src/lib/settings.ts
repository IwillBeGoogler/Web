import { isPreset, type EdgePreset } from './edgePresets';
import { EDGE_KIND_STYLE } from '../clusters/edgeKindStyle';
import type { Arrows, DiagramEdge, DiagramNode, DiagramNodeData, EdgeData, LineType, NodeKind, StrokeStyle } from '../types';

export type Theme = 'light' | 'dark' | 'system';
export interface Settings {
  node: { background: 'transparent' | 'filled'; fill: string; opacity: number; border: boolean; borderColor: string; radius: number; shadow: boolean };
  group: { fill: string; fillOpacity: number; borderStyle: StrokeStyle; borderColor: string };
  edge: { lineType: LineType; color: string; width: number; arrows: Arrows; labelBackground: boolean; cornerRadius: number; jumps: boolean; keepManual: boolean; autoRoute: boolean; arrowSize: 'S' | 'M' | 'L'; keepBusesOrthogonal: boolean };
  canvas: { background: string; grid: boolean; gridSize: number; snap: boolean; /** hand-drawn look: wobbly lines + handwritten font (see lib/sketch) */ sketch: boolean };
  export: { transparent: boolean; scale: 1 | 2 | 3; padding: number };
  theme: Theme;
  /** user-defined edge style presets (builtin ones live in lib/edgePresets) */
  edgePresets: EdgePreset[];
  /** capacity: monthly budget in USD (project level; the metrics bar warns above it) */
  monthlyBudgetUsd?: number;
}
export type PartialSettings = { [K in Exclude<keyof Settings, 'edgePresets'>]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K] } & { edgePresets?: EdgePreset[] };

export const SETTINGS_KEY = 'sdd:settings';

export const BUILTIN_SETTINGS: Settings = {
  node: { background: 'transparent', fill: '#ffffff', opacity: 100, border: false, borderColor: '#cfd4dc', radius: 8, shadow: false },
  group: { fill: '#ffffff', fillOpacity: 0, borderStyle: 'dashed', borderColor: '#8a93a3' },
  edge: { lineType: 'orthogonal', color: '#2d3340', width: 1.6, arrows: 'end', labelBackground: true, cornerRadius: 8, jumps: false, keepManual: true, autoRoute: true, arrowSize: 'M', keepBusesOrthogonal: false },
  canvas: { background: '#ffffff', grid: true, gridSize: 20, snap: true, sketch: false },
  export: { transparent: false, scale: 2, padding: 40 }, // white PNG by default
  theme: 'system',
  edgePresets: [],
};

const SECTION_KEYS = ['node', 'group', 'edge', 'canvas', 'export'] as const;

/** Deep merge; `undefined` values never override. Later arguments win. */
export function mergeSettings(...layers: (PartialSettings | undefined)[]): PartialSettings {
  const out: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      if ((SECTION_KEYS as readonly string[]).includes(k) && typeof v === 'object') {
        const cur = (out[k] as Record<string, unknown>) ?? {};
        const next = { ...cur };
        for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) if (vv !== undefined) next[kk] = vv;
        out[k] = next;
      } else out[k] = v;
    }
  }
  return out as PartialSettings;
}

/** built-in < global < project. (A component's own value is applied on top in resolve*Style.) */
export function resolveSettings(global?: PartialSettings, project?: PartialSettings): Settings {
  const m = mergeSettings(BUILTIN_SETTINGS as PartialSettings, global, project) as unknown as Settings;
  // edge presets are additive across levels (project overrides a global preset with the same id)
  const byId = new Map<string, EdgePreset>();
  for (const list of [global?.edgePresets, project?.edgePresets]) for (const p of list ?? []) byId.set(p.id, p);
  return { ...m, edgePresets: [...byId.values()] };
}

// ---------- validation / persistence ----------
type Check = (v: unknown) => boolean;
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const str: Check = (v) => typeof v === 'string';
const bool: Check = (v) => typeof v === 'boolean';
const oneOf = (...a: unknown[]): Check => (v) => a.includes(v);
const SCHEMA: Record<string, Record<string, Check>> = {
  node: { background: oneOf('transparent', 'filled'), fill: str, opacity: num, border: bool, borderColor: str, radius: num, shadow: bool },
  group: { fill: str, fillOpacity: num, borderStyle: oneOf('solid', 'dashed', 'dotted'), borderColor: str },
  edge: { lineType: oneOf('orthogonal', 'straight', 'curved', 'step-rounded'), color: str, width: num, arrows: oneOf('none', 'start', 'end', 'both'), labelBackground: bool, cornerRadius: num, jumps: bool, keepManual: bool, autoRoute: bool, arrowSize: oneOf('S', 'M', 'L'), keepBusesOrthogonal: bool },
  canvas: { background: str, grid: bool, gridSize: num, snap: bool, sketch: bool },
  export: { transparent: bool, scale: oneOf(1, 2, 3), padding: num },
};

/** Keep only well-formed fields (never throws). */
export function validateSettings(raw: unknown): PartialSettings {
  const out: Record<string, unknown> = {};
  if (typeof raw !== 'object' || raw === null) return out as PartialSettings;
  const r = raw as Record<string, unknown>;
  for (const [sec, fields] of Object.entries(SCHEMA)) {
    const v = r[sec];
    if (typeof v !== 'object' || v === null) continue;
    const kept: Record<string, unknown> = {};
    for (const [k, check] of Object.entries(fields)) if (check((v as Record<string, unknown>)[k])) kept[k] = (v as Record<string, unknown>)[k];
    if (Object.keys(kept).length) out[sec] = kept;
  }
  if (Array.isArray(r.edgePresets)) {
    const ok = r.edgePresets.filter(isPreset);
    if (ok.length) out.edgePresets = ok;
  }
  if (typeof r.monthlyBudgetUsd === 'number' && Number.isFinite(r.monthlyBudgetUsd) && r.monthlyBudgetUsd > 0) out.monthlyBudgetUsd = r.monthlyBudgetUsd;
  if (r.theme === 'light' || r.theme === 'dark' || r.theme === 'system') out.theme = r.theme;
  return out as PartialSettings;
}

export function loadGlobalSettings(st: Pick<Storage, 'getItem'>): PartialSettings {
  try {
    const t = st.getItem(SETTINGS_KEY);
    return t ? validateSettings(JSON.parse(t)) : {};
  } catch {
    return {};
  }
}
export function saveGlobalSettings(st: Pick<Storage, 'setItem'>, s: PartialSettings): void {
  try {
    st.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ---------- per-component resolution ----------
export interface NodeVisual {
  background: 'transparent' | 'filled';
  fill: string;
  opacity: number; // 0-100
  border: boolean;
  borderColor: string;
  borderWidth: number;
  borderStyle: StrokeStyle;
  radius: number;
  shadow: boolean;
  fillOpacity: number; // 0-100 (groups)
  textColor?: string;
}

export function resolveNodeStyle(d: DiagramNodeData, kind: NodeKind, s: Settings): NodeVisual {
  const n = s.node;
  const own = <T,>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
  if (kind === 'group') {
    return {
      background: d.background ?? 'transparent',
      fill: own(d.fill, s.group.fill),
      fillOpacity: own(d.fillOpacity as number | undefined, s.group.fillOpacity),
      opacity: own(d.opacity, 100),
      border: own(d.border, true),
      borderColor: own(d.stroke, s.group.borderColor),
      borderWidth: own(d.strokeWidth, 1.5),
      borderStyle: own(d.strokeStyle, s.group.borderStyle),
      radius: own(d.radius, 14),
      shadow: own(d.shadow, false),
      textColor: d.textColor,
    };
  }
  if (kind === 'cluster') {
    const accent = (d.accent as string | undefined) ?? '#5b5bf7';
    return {
      background: 'transparent',
      fill: own(d.fill, accent),
      fillOpacity: own(d.fillOpacity as number | undefined, 5),
      opacity: own(d.opacity, 100),
      border: own(d.border, true),
      borderColor: own(d.stroke, accent),
      borderWidth: own(d.strokeWidth, 1.25),
      borderStyle: own(d.strokeStyle, 'solid'),
      radius: own(d.radius, 14),
      shadow: own(d.shadow, false),
      textColor: d.textColor,
    };
  }
  if (kind === 'sticky') {
    return {
      background: own(d.background, 'filled'),
      fill: own(d.fill, '#fff3a3'),
      fillOpacity: 100,
      opacity: own(d.opacity, 100),
      border: own(d.border, true),
      borderColor: own(d.stroke, '#e0c84a'),
      borderWidth: own(d.strokeWidth, 1),
      borderStyle: own(d.strokeStyle, 'solid'),
      radius: own(d.radius, 4),
      shadow: own(d.shadow, true),
      textColor: d.textColor,
    };
  }
  const shapeLike = kind === 'shape' || kind === 'draw';
  const bg = own(d.background, d.fill && shapeLike ? 'filled' : n.background);
  return {
    background: bg,
    fill: own(d.fill, n.fill),
    fillOpacity: 100,
    opacity: own(d.opacity, n.opacity),
    border: own(d.border, shapeLike ? true : n.border),
    borderColor: own(d.stroke, shapeLike ? '#2d3340' : n.borderColor),
    borderWidth: own(d.strokeWidth, shapeLike ? 1.5 : 1),
    borderStyle: own(d.strokeStyle, 'solid'),
    radius: own(d.radius, n.radius),
    shadow: own(d.shadow, n.shadow),
    textColor: d.textColor,
  };
}

export interface EdgeVisual {
  lineType: LineType;
  color: string;
  width: number;
  arrows: Arrows;
  labelBackground: boolean;
  strokeStyle: StrokeStyle;
}
export function resolveEdgeStyle(d: EdgeData, s: Pick<Settings, 'edge'>): EdgeVisual {
  const k = d.kind ? EDGE_KIND_STYLE[d.kind] : {};
  return {
    lineType: d.lineType ?? k.lineType ?? s.edge.lineType,
    color: d.color ?? k.color ?? s.edge.color,
    width: d.strokeWidth ?? k.width ?? s.edge.width,
    arrows: d.arrows ?? k.arrows ?? s.edge.arrows,
    labelBackground: d.labelBg ?? s.edge.labelBackground,
    strokeStyle: d.strokeStyle ?? (d.dashed ? 'dashed' : k.strokeStyle ?? 'solid'),
  };
}

/** edges whose look will not follow a changed default line style: an own `lineType`, or a hand-routed path (waypoints) */
export function lineStyleOverrides(edges: DiagramEdge[], defaultLine: LineType): { custom: number; manual: number; total: number } {
  let custom = 0;
  let manual = 0;
  let total = 0;
  for (const e of edges) {
    const own = e.data?.lineType !== undefined && e.data.lineType !== defaultLine;
    const hand = !!e.data?.manual && !!e.data.waypoints?.length;
    if (own) custom++;
    if (hand) manual++;
    if (own || hand) total++;
  }
  return { custom, manual, total };
}

// ---------- "apply defaults to all existing components" ----------
const NODE_STYLE_KEYS = ['background', 'fill', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeStyle', 'radius', 'opacity', 'border', 'shadow'];
const EDGE_STYLE_KEYS = ['color', 'strokeWidth', 'lineType', 'arrows', 'labelBg', 'strokeStyle', 'dashed', 'flow']; // `kind` / `replMode` are semantic, not style, so they stay

/** Drop per-component style overrides so nodes/edges follow project / global / built-in defaults. */
export function stripStyleOverrides(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  return {
    nodes: nodes.map((n) => {
      if (n.type !== 'icon' && n.type !== 'shape' && n.type !== 'group') return n;
      const data: Record<string, unknown> = { ...n.data };
      let changed = false;
      for (const k of NODE_STYLE_KEYS) if (k in data) {
        delete data[k];
        changed = true;
      }
      return changed ? { ...n, data: data as DiagramNodeData } : n;
    }),
    edges: edges.map((e) => {
      const data: Record<string, unknown> = { ...(e.data ?? {}) };
      for (const k of EDGE_STYLE_KEYS) delete data[k];
      if (e.data?.locked) data.locked = true;
      return { ...e, data: data as EdgeData };
    }),
  };
}
