import { MARKER_KINDS, NODE_KINDS, type Diagram, type DiagramEdge, type DiagramNode, type NodeKind } from '../types';
import { normalizeLocks, sortParentsFirst } from './graph';
import { resolveId } from '../data/idAliases';
import { validateSettings } from './settings';
import { UML_ALL_KINDS } from './uml/types';
import { validateArchRef } from './crosslink/links';
import { validateSequence } from './seq/validate';
import { validateTiming } from './timing/validate';
import { validateBoardNodeData } from './board/validate';
import { validateDesignData } from './design/validate';

export type ParseResult = { ok: true; diagram: Diagram } | { ok: false; error: string };

const KINDS: NodeKind[] = NODE_KINDS;
const ENUMS: Record<string, string[]> = {
  shape: ['rect', 'rounded', 'ellipse', 'diamond', 'cylinder', 'ellipsis'],
  layout: ['vertical', 'horizontal'],
  variant: ['dashed', 'card', 'package', 'boundary', 'composite', 'lane'],
  stateKind: ['state', 'initial', 'final', 'choice', 'fork', 'join', 'history', 'deepHistory', 'entryPoint', 'exitPoint'],
  ucKind: ['actor', 'usecase'],
  actKind: ['initial', 'final', 'flowFinal', 'action', 'decision', 'fork', 'object', 'send', 'accept', 'note'],
  laneOrient: ['v', 'h'],
  compKind: ['component', 'node', 'artifact', 'provided', 'required'],
  depKind: ['node', 'device', 'executionEnvironment', 'artifact', 'component'],
  facing: ['right', 'left', 'up', 'down'],
  strokeStyle: ['solid', 'dashed', 'dotted'],
  align: ['left', 'center', 'right'],
  background: ['transparent', 'filled'],
};
const NUMS = ['strokeWidth', 'radius', 'opacity', 'fontSize', 'fillOpacity'];
const STRS = ['labelColor', 'subtitleColor', 'caption', 'repeatOf', 'fill', 'stroke', 'textColor', 'iconId', 'path', 'groupIcon', 'role', 'topology', 'replication', 'accent', 'profileId', 'modelId'];
const BOOLS = ['bold', 'locked', 'border', 'shadow', 'collapsed'];
const EDGE_ENUMS: Record<string, string[]> = {
  kind: ['replication', 'heartbeat', 'failover', 'sharding'],
  replMode: ['sync', 'async', 'semi-sync'],
  lineType: ['orthogonal', 'straight', 'curved', 'step-rounded'],
  pinSource: ['top', 'right', 'bottom', 'left'],
  pinTarget: ['top', 'right', 'bottom', 'left'],
  startMarker: MARKER_KINDS,
  endMarker: MARKER_KINDS,
  arrows: ['none', 'start', 'end', 'both'],
  labelSide: ['auto', 'on', 'left', 'right'],
  strokeStyle: ['solid', 'dashed', 'dotted'],
  flowSpeed: ['slow', 'normal', 'fast'],
  flowStyle: ['dot', 'dash', 'pulse'],
  flowDir: ['forward', 'reverse', 'both'],
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Strip transient UI state (selection, drag, measured size). */
export function cleanDiagram(d: Diagram): Diagram {
  return {
    version: 1,
    nodes: d.nodes.map((n) => {
      const { selected: _s, dragging: _d, measured: _m, resizing: _r, ...rest } = n as DiagramNode & { resizing?: boolean };
      void _s; void _d; void _m; void _r;
      return rest as DiagramNode;
    }),
    edges: d.edges.map((e) => {
      const { selected: _s, ...rest } = e;
      void _s;
      if (rest.className === 'edge-new') delete rest.className;
      return rest as DiagramEdge;
    }),
    ...(d.settings && Object.keys(d.settings).length ? { settings: d.settings } : {}),
  };
}

export function serializeDiagram(d: Diagram): string {
  return JSON.stringify(cleanDiagram(d), null, 2);
}

export function validateDiagram(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'Root must be an object' };
  if (raw.version !== 1) return { ok: false, error: 'Unsupported or missing version (expected 1)' };
  if (!Array.isArray(raw.nodes)) return { ok: false, error: '"nodes" must be an array' };
  if (!Array.isArray(raw.edges)) return { ok: false, error: '"edges" must be an array' };

  const ids = new Set<string>();
  for (const [i, n] of raw.nodes.entries()) {
    if (!isObj(n)) return { ok: false, error: `nodes[${i}] must be an object` };
    if (!isStr(n.id)) return { ok: false, error: `nodes[${i}].id must be a non-empty string` };
    if (ids.has(n.id)) return { ok: false, error: `Duplicate node id "${n.id}"` };
    ids.add(n.id);
    if (!KINDS.includes(n.type as NodeKind)) return { ok: false, error: `nodes[${i}].type invalid` };
    if (!isObj(n.position) || !isNum(n.position.x) || !isNum(n.position.y))
      return { ok: false, error: `nodes[${i}].position must be {x:number,y:number}` };
    if (!isObj(n.data) || typeof n.data.label !== 'string') return { ok: false, error: `nodes[${i}].data.label must be a string` };
    if (n.data.subtitle !== undefined && typeof n.data.subtitle !== 'string') return { ok: false, error: `nodes[${i}].data.subtitle must be a string` };
    for (const [k, allowed] of Object.entries(ENUMS))
      if (n.data[k] !== undefined && !allowed.includes(n.data[k] as string)) return { ok: false, error: `nodes[${i}].data.${k} must be one of ${allowed.join('|')}` };
    for (const k of NUMS) if (n.data[k] !== undefined && !isNum(n.data[k])) return { ok: false, error: `nodes[${i}].data.${k} must be a number` };
    if (n.data.tags !== undefined && !(Array.isArray(n.data.tags) && n.data.tags.every((t) => isObj(t) && typeof t.text === 'string' && typeof t.color === 'string'))) return { ok: false, error: `nodes[${i}].data.tags must be an array of {text, color}` };
    for (const k of STRS) if (n.data[k] !== undefined && typeof n.data[k] !== 'string') return { ok: false, error: `nodes[${i}].data.${k} must be a string` };
    {
      const err = validateArchRef(n.data.archRef);
      if (err) return { ok: false, error: `nodes[${i}].data.archRef${err}` };
    }
    for (const k of BOOLS) if (n.data[k] !== undefined && typeof n.data[k] !== 'boolean') return { ok: false, error: `nodes[${i}].data.${k} must be boolean` };
    if (n.type === 'table') {
      const cols = (n.data as Record<string, unknown>).columns;
      if (!Array.isArray(cols)) return { ok: false, error: `nodes[${i}].data.columns must be an array` };
      const cids = new Set<string>();
      for (const [k, c] of cols.entries()) {
        if (!isObj(c) || !isStr(c.id) || typeof c.name !== 'string' || typeof c.type !== 'string') return { ok: false, error: `nodes[${i}].data.columns[${k}] needs id, name and type` };
        if (cids.has(c.id)) return { ok: false, error: `nodes[${i}] has a duplicate column id "${c.id}"` };
        cids.add(c.id);
      }
    }
    if (n.type === 'class') {
      const d = n.data as Record<string, unknown>;
      if (!['class', 'interface', 'abstract', 'enum'].includes(d.kind as string)) return { ok: false, error: `nodes[${i}].data.kind must be class|interface|abstract|enum` };
      const mids = new Set<string>();
      for (const key of ['attributes', 'operations'] as const) {
        const list = d[key];
        if (!Array.isArray(list)) return { ok: false, error: `nodes[${i}].data.${key} must be an array` };
        for (const [k, m] of list.entries()) {
          if (!isObj(m) || !isStr(m.id) || typeof m.name !== 'string' || !['+', '-', '#', '~', ''].includes(m.visibility as string)) return { ok: false, error: `nodes[${i}].data.${key}[${k}] needs id, name and visibility (+ - # ~)` };
          if (mids.has(m.id)) return { ok: false, error: `nodes[${i}] has a duplicate member id "${m.id}"` };
          mids.add(m.id);
          if (m.params !== undefined && (!Array.isArray(m.params) || m.params.some((p: unknown) => !isObj(p) || typeof p.name !== 'string'))) return { ok: false, error: `nodes[${i}].data.${key}[${k}].params must be an array of {name, type?}` };
        }
      }
    }
    if (n.type === 'sequence') {
      const err = validateSequence(n.data);
      if (err) return { ok: false, error: `nodes[${i}].data: ${err}` };
    }
    if (n.type === 'timing') {
      const err = validateTiming(n.data);
      if (err) return { ok: false, error: `nodes[${i}].data: ${err}` };
    }
    {
      const err = validateBoardNodeData(n.type as string, n.data as Record<string, unknown>, n);
      if (err) return { ok: false, error: `nodes[${i}]: ${err}` };
    }
    {
      const err = validateDesignData(n.data as Record<string, unknown>);
      if (err) return { ok: false, error: `nodes[${i}]: ${err}` };
    }
    if (n.type === 'state' && !isStr((n.data as Record<string, unknown>).stateKind)) return { ok: false, error: `nodes[${i}].data.stateKind is required` };
    if (n.type === 'usecase' && !isStr((n.data as Record<string, unknown>).ucKind)) return { ok: false, error: `nodes[${i}].data.ucKind is required` };
    if (n.type === 'activity' && !isStr((n.data as Record<string, unknown>).actKind)) return { ok: false, error: `nodes[${i}].data.actKind is required` };
    if (n.type === 'deployment' && !isStr((n.data as Record<string, unknown>).depKind)) return { ok: false, error: `nodes[${i}].data.depKind is required` };
    if (n.type === 'object') {
      const d = n.data as Record<string, unknown>;
      if (d.className !== undefined && typeof d.className !== 'string') return { ok: false, error: `nodes[${i}].data.className must be a string` };
      if (!Array.isArray(d.slots)) return { ok: false, error: `nodes[${i}].data.slots must be an array` };
      const sids = new Set<string>();
      for (const [k, sl] of d.slots.entries()) {
        if (!isObj(sl) || !isStr(sl.id) || typeof sl.name !== 'string' || typeof sl.value !== 'string') return { ok: false, error: `nodes[${i}].data.slots[${k}] needs id, name and value (strings)` };
        if (sids.has(sl.id)) return { ok: false, error: `nodes[${i}] has a duplicate slot id "${sl.id}"` };
        sids.add(sl.id);
      }
    }
    if (n.type === 'component' && !isStr((n.data as Record<string, unknown>).compKind)) return { ok: false, error: `nodes[${i}].data.compKind is required` };
    if (n.width !== undefined && !isNum(n.width)) return { ok: false, error: `nodes[${i}].width must be a number` };
    if (n.height !== undefined && !isNum(n.height)) return { ok: false, error: `nodes[${i}].height must be a number` };
  }
  for (const [i, n] of raw.nodes.entries()) {
    const node = n as Record<string, unknown>;
    if (node.parentId !== undefined) {
      const parent = (raw.nodes as Record<string, unknown>[]).find((p) => p.id === node.parentId);
      if (!parent || !['group', 'cluster', 'component', 'deployment'].includes(parent.type as string)) return { ok: false, error: `nodes[${i}].parentId must reference a group, cluster, component or deployment node` };
    }
  }
  const eIds = new Set<string>();
  for (const [i, e] of raw.edges.entries()) {
    if (!isObj(e)) return { ok: false, error: `edges[${i}] must be an object` };
    if (!isStr(e.id)) return { ok: false, error: `edges[${i}].id must be a non-empty string` };
    if (eIds.has(e.id)) return { ok: false, error: `Duplicate edge id "${e.id}"` };
    eIds.add(e.id);
    if (!isStr(e.source) || !ids.has(e.source)) return { ok: false, error: `edges[${i}].source references unknown node` };
    if (!isStr(e.target) || !ids.has(e.target)) return { ok: false, error: `edges[${i}].target references unknown node` };
    if (e.label !== undefined && typeof e.label !== 'string') return { ok: false, error: `edges[${i}].label must be a string` };
    if (e.data !== undefined) {
      if (!isObj(e.data)) return { ok: false, error: `edges[${i}].data must be an object` };
      if (e.data.dashed !== undefined && typeof e.data.dashed !== 'boolean') return { ok: false, error: `edges[${i}].data.dashed must be boolean` };
      if (e.data.color !== undefined && typeof e.data.color !== 'string') return { ok: false, error: `edges[${i}].data.color must be string` };
      for (const [k, allowed] of Object.entries(EDGE_ENUMS))
        if (e.data[k] !== undefined && !allowed.includes(e.data[k] as string)) return { ok: false, error: `edges[${i}].data.${k} must be one of ${allowed.join('|')}` };
      if (e.data.dataFlow !== undefined && typeof e.data.dataFlow !== 'boolean') return { ok: false, error: `edges[${i}].data.dataFlow must be boolean` };
      if (e.data.flow !== undefined && typeof e.data.flow !== 'boolean') return { ok: false, error: `edges[${i}].data.flow must be boolean` };
      for (const k of ['labelT', 'labelOffset', 'cornerRadius', 'flowDensity']) if (e.data[k] !== undefined && !isNum(e.data[k])) return { ok: false, error: `edges[${i}].data.${k} must be a number` };
      if (e.data.manual !== undefined && typeof e.data.manual !== 'boolean') return { ok: false, error: `edges[${i}].data.manual must be boolean` };
      if (e.data.waypoints !== undefined && (!Array.isArray(e.data.waypoints) || e.data.waypoints.some((w: unknown) => !isObj(w) || !isNum(w.x) || !isNum(w.y)))) return { ok: false, error: `edges[${i}].data.waypoints must be an array of {x,y}` };
      if (e.data.relation !== undefined) {
        const r = e.data.relation;
        if (!isObj(r) || !['1:1', '1:N', 'N:1', 'N:M'].includes(r.cardinality as string)) return { ok: false, error: `edges[${i}].data.relation.cardinality must be one of 1:1|1:N|N:1|N:M` };
        if (typeof r.identifying !== 'boolean' || typeof r.optional !== 'boolean') return { ok: false, error: `edges[${i}].data.relation.identifying and .optional must be boolean` };
      }
      if (e.data.uml !== undefined) {
        const u = e.data.uml;
        if (!isObj(u) || !UML_ALL_KINDS.includes(u.kind as never)) return { ok: false, error: `edges[${i}].data.uml.kind must be ${UML_ALL_KINDS.join('|')}` };
        for (const k of ['sourceMult', 'targetMult', 'sourceRole', 'targetRole', 'sourceMember', 'targetMember', 'sourcePort', 'targetPort']) if (u[k] !== undefined && typeof u[k] !== 'string') return { ok: false, error: `edges[${i}].data.uml.${k} must be a string` };
      }
      if (isObj(e.data.uml) && e.data.uml.messages !== undefined) {
        const ms = e.data.uml.messages;
        const seen = new Set<string>();
        if (!Array.isArray(ms)) return { ok: false, error: `edges[${i}].data.uml.messages must be an array` };
        for (const [k, m] of ms.entries()) {
          if (!isObj(m) || !isStr(m.id) || typeof m.seq !== 'string' || !/^\d+(\.\d+)*$/.test(m.seq) || typeof m.text !== 'string' || (m.dir !== 'fwd' && m.dir !== 'back') || (m.async !== undefined && typeof m.async !== 'boolean')) return { ok: false, error: `edges[${i}].data.uml.messages[${k}] needs id, a dotted seq (1, 1.1), text and dir fwd|back` };
          if (seen.has(m.id)) return { ok: false, error: `edges[${i}] has a duplicate message id "${m.id}"` };
          seen.add(m.id);
        }
      }
      if (e.data.strokeWidth !== undefined && !isNum(e.data.strokeWidth)) return { ok: false, error: `edges[${i}].data.strokeWidth must be a number` };
      if (e.data.labelBg !== undefined && typeof e.data.labelBg !== 'boolean') return { ok: false, error: `edges[${i}].data.labelBg must be boolean` };
    }
  }
  const diagram = cleanDiagram({
    version: 1,
    nodes: (raw.nodes as DiagramNode[]).map((n) => (n.data.iconId && resolveId(n.data.iconId) !== n.data.iconId ? { ...n, data: { ...n.data, iconId: resolveId(n.data.iconId) } } : n)),
    edges: raw.edges as DiagramEdge[],
    ...(isObj(raw.settings) ? { settings: validateSettings(raw.settings) } : {}),
  });
  return { ok: true, diagram: { ...diagram, nodes: sortParentsFirst(normalizeLocks(diagram.nodes)) } };
}

export function parseDiagram(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  return validateDiagram(raw);
}
