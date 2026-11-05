import type { Project } from '../types';

type Rec = Record<string, unknown> & { id: string };
export interface Change {
  id: string;
  before: Rec;
  after: Rec;
  /** moved | resized | nested | label | style | content | slots | ports | behavior | sequence | timing | messages | link (nodes); endpoints | label | relation | style (edges) */
  fields: string[];
}
export interface EntityDiff {
  added: Rec[];
  removed: Rec[];
  changed: Change[];
}
export interface DocDiff {
  nodes: EntityDiff;
  edges: EntityDiff;
  nameChanged: { from: string; to: string } | null;
  isEmpty: boolean;
}

const TRANSIENT = new Set(['selected', 'dragging', 'measured', 'resizing', 'positionAbsolute', 'internals']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined && !TRANSIENT.has(k));
    const kb = Object.keys(b).filter((k) => b[k] !== undefined && !TRANSIENT.has(k));
    return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
  }
  return false;
}

const STYLE_DATA = new Set(['fill', 'stroke', 'strokeWidth', 'strokeStyle', 'radius', 'opacity', 'fontSize', 'bold', 'align', 'textColor', 'background', 'shape', 'variant', 'iconId', 'layout', 'color', 'accent']);
const LABEL_DATA = new Set(['label', 'subtitle']);
/** UML data with its own change word, so "edited" is not the answer to everything (key of `node.data` -> field) */
const SPECIAL_DATA: Record<string, string> = {
  slots: 'slots', // object diagram: `attribute = value` rows
  ports: 'ports', // component: provided / required interfaces on the border
  activity: 'behavior', // state: internal activities `entry / ...`, `exit / ...`
  archRef: 'link', // cross-link to another file / page / node
  participants: 'sequence', items: 'sequence', boxes: 'sequence', autonumber: 'sequence', // sequence diagram model
  lifelines: 'timing', changes: 'timing', messages: 'timing', durations: 'timing', end: 'timing', unit: 'timing', // timing diagram model
};

function nodeFields(a: Rec, b: Rec): string[] {
  const out: string[] = [];
  const add = (f: string) => { if (!out.includes(f)) out.push(f); };
  if (!eq(a.position, b.position)) add('moved');
  const sa = (isObj(a.style) ? a.style : {}) as Record<string, unknown>;
  const sb = (isObj(b.style) ? b.style : {}) as Record<string, unknown>;
  if (['width', 'height'].some((k) => !eq(a[k], b[k]) || !eq(sa[k], sb[k]))) add('resized');
  const da = (isObj(a.data) ? a.data : {}) as Record<string, unknown>;
  const db = (isObj(b.data) ? b.data : {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
    if (eq(da[k], db[k])) continue;
    add(LABEL_DATA.has(k) ? 'label' : STYLE_DATA.has(k) ? 'style' : (SPECIAL_DATA[k] ?? 'content'));
  }
  // a CSS style other than the size (opacity, z-index ...)
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (k !== 'width' && k !== 'height' && !eq(sa[k], sb[k])) add('style');
  // anything else that differs (type, z-index ...) is content; moving into / out of a container is "nested"
  const rest = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ['id', 'position', 'width', 'height', 'style', 'data', ...TRANSIENT]) rest.delete(k);
  for (const k of rest) if (!eq(a[k], b[k])) add(k === 'parentId' ? 'nested' : 'content');
  return out;
}
function edgeFields(a: Rec, b: Rec): string[] {
  const out: string[] = [];
  const add = (f: string) => { if (!out.includes(f)) out.push(f); };
  if (a.source !== b.source || a.target !== b.target || a.sourceHandle !== b.sourceHandle || a.targetHandle !== b.targetHandle) add('endpoints');
  const da = (isObj(a.data) ? a.data : {}) as Record<string, unknown>;
  const db = (isObj(b.data) ? b.data : {}) as Record<string, unknown>;
  const ma = isObj(da.uml) ? da.uml.messages : undefined, mb = isObj(db.uml) ? db.uml.messages : undefined;
  // the text of a link with messages is derived from them: only the messages count then
  if ((!eq(a.label, b.label) || !eq(da.label, db.label)) && !(ma || mb)) add('label');
  // UML relation kind / multiplicities / roles (package import, access, merge, dependency ...) and ER relations
  // communication diagram: the numbered messages of an object link are their own change, the rest of the relation is "relation"
  const ua = isObj(da.uml) ? da.uml : {}, ub = isObj(db.uml) ? db.uml : {};
  if (!eq(ua.messages, ub.messages)) add('messages');
  const { messages: _ma, ...restA } = ua;
  const { messages: _mb, ...restB } = ub;
  void _ma; void _mb;
  if (!eq(restA, restB) || !eq(da.relation, db.relation)) add('relation');
  for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
    if (k === 'label' || k === 'uml' || k === 'relation' || eq(da[k], db[k])) continue;
    add('style');
  }
  const rest = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ['id', 'source', 'target', 'sourceHandle', 'targetHandle', 'label', 'data', ...TRANSIENT]) rest.delete(k);
  for (const k of rest) if (!eq(a[k], b[k])) add('style');
  return out;
}

function diffEntities(a: Rec[], b: Rec[], fields: (x: Rec, y: Rec) => string[]): EntityDiff {
  const ma = new Map(a.map((x) => [x.id, x]));
  const mb = new Map(b.map((x) => [x.id, x]));
  const out: EntityDiff = { added: [], removed: [], changed: [] };
  for (const x of b) if (!ma.has(x.id)) out.added.push(x);
  for (const x of a) {
    const y = mb.get(x.id);
    if (!y) out.removed.push(x);
    else if (!eq(x, y)) {
      const f = fields(x, y);
      if (f.length) out.changed.push({ id: x.id, before: x, after: y, fields: f });
    }
  }
  return out;
}

/** compare two file documents: what was added, removed and changed (nodes and edges are matched by id, pages by id). Pure. */
export function diffProjects(a: Project, b: Project): DocDiff {
  const pa = new Map(a.pages.map((p) => [p.id, p]));
  const nodes: EntityDiff = { added: [], removed: [], changed: [] };
  const edges: EntityDiff = { added: [], removed: [], changed: [] };
  const ids = new Set([...a.pages.map((p) => p.id), ...b.pages.map((p) => p.id)]);
  const pb = new Map(b.pages.map((p) => [p.id, p]));
  for (const id of ids) {
    const x = pa.get(id);
    const y = pb.get(id);
    const nd = diffEntities((x?.nodes ?? []) as unknown as Rec[], (y?.nodes ?? []) as unknown as Rec[], nodeFields);
    const ed = diffEntities((x?.edges ?? []) as unknown as Rec[], (y?.edges ?? []) as unknown as Rec[], edgeFields);
    nodes.added.push(...nd.added);
    nodes.removed.push(...nd.removed);
    nodes.changed.push(...nd.changed);
    edges.added.push(...ed.added);
    edges.removed.push(...ed.removed);
    edges.changed.push(...ed.changed);
  }
  const nameChanged = a.name !== b.name ? { from: a.name, to: b.name } : null;
  const isEmpty = !nameChanged && [nodes, edges].every((d) => !d.added.length && !d.removed.length && !d.changed.length);
  return { nodes, edges, nameChanged, isEmpty };
}

const WORDS: Record<string, string> = {
  moved: 'moved', resized: 'resized', nested: 'reparented', label: 'renamed', style: 'restyled', content: 'edited', endpoints: 'rerouted',
  relation: 'relation changed', slots: 'slots edited', ports: 'ports edited', behavior: 'entry/exit edited', sequence: 'messages edited', timing: 'waveforms edited', messages: 'numbered messages edited', link: 'link changed',
};
const ORDER = ['endpoints', 'moved', 'resized', 'nested', 'label', 'relation', 'style', 'slots', 'ports', 'behavior', 'sequence', 'timing', 'messages', 'link', 'content'];
/** "moved, resized, renamed" (edge labels read "relabelled") */
export function describeChange(c: Change): string {
  const isEdge = 'source' in c.before;
  return [...c.fields]
    .sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y))
    .map((f) => (isEdge && f === 'label' ? 'relabelled' : (WORDS[f] ?? f)))
    .join(', ');
}

export function diffSummary(d: DocDiff): string {
  const add = d.nodes.added.length + d.edges.added.length;
  const rem = d.nodes.removed.length + d.edges.removed.length;
  const chg = d.nodes.changed.length + d.edges.changed.length;
  if (!add && !rem && !chg) return d.nameChanged ? 'Renamed only' : 'No differences';
  return [add && `${add} added`, rem && `${rem} removed`, chg && `${chg} changed`].filter(Boolean).join(', ');
}
