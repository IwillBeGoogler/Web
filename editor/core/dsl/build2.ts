/** Merges the UML blocks of a parsed document (classes, states, use cases, components, activity, deployment, packages, objects) into a page. Called by `applyDoc`. */
import type { CEdge, CNode, CPage } from '../types';
import { resolveIcon } from '../catalog';
import { isActLike, isDepNode, isObjNode, ownedObjEdges, ownedPkgEdges, ownedActEdges, ownedDepEdges, isCompNode, isGroupOf, isStateLike, isUcNode, memberLine, ownedClassEdges, ownedCompEdges, ownedTransitions, ownedUcEdges, isImpliedAssembly } from './print2';
import type { DslDoc } from './types';

export interface UmlEnv {
  added: Set<string>;
  removed: string[];
  fresh: Set<string>;
  nodeIds: Set<string>;
  err: (line: number, message: string) => void;
  warn: (line: number, message: string) => void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const uniq = (base: string, taken: Set<string>) => { let id = base; for (let i = 2; taken.has(id); i++) id = `${base}-${i}`; taken.add(id); return id; };

const UML_COLOR = '#7b8499';
const KIND_ACCENT: Record<string, string> = { class: '#2f6fdb', interface: '#0f9d8f', abstract: '#8e5bd6', enum: '#e8710a' };
const STATE_ACCENT = '#2f6fdb';
const UC_ACCENT = '#0f9d8f';
const COMP_ACCENT = '#8e5bd6';
const ACT_ACCENT = '#d9822b';
const DEP_ACCENT = '#3f8f6b';
const OBJ_ACCENT = '#0e7490';
const snap = (n: number) => Math.round(n / 10) * 10;

// ---- sizes (mirrors src/lib/uml/geometry.ts, state/layout.ts, uml2/sizes.ts; the client recomputes the exact ones) ----
export function classSizeOf(d: any): { width: number; height: number } {
  const label = d.generics?.trim() ? `${d.label}<${d.generics.trim()}>` : d.label;
  let w = label.length * 8.1 + 40;
  for (const m of d.attributes) w = Math.max(w, memberLine(m, false).length * 6.9 + 28);
  for (const m of d.operations) w = Math.max(w, memberLine(m, true).length * 6.9 + 28);
  const width = Math.round(Math.min(420, Math.max(160, w)) / 10) * 10;
  const stereo = d.kind === 'interface' || d.kind === 'abstract' || d.kind === 'enum' || !!d.stereotype?.trim();
  const shown = d.kind === 'enum' ? [d.attributes.length] : d.kind === 'interface' && d.attributes.length === 0 ? [d.operations.length] : [d.attributes.length, d.operations.length];
  return { width, height: 36 + (stereo ? 16 : 0) + shown.reduce((a: number, rows: number) => a + 8 + rows * 22, 0) + 2 };
}
export function stateSizeOf(kind: string, name: string, activity?: string, vertical?: boolean): { width: number; height: number } {
  switch (kind) {
    case 'initial': return { width: 20, height: 20 };
    case 'final': return { width: 28, height: 28 };
    case 'choice': return { width: 34, height: 34 };
    case 'fork': case 'join': return vertical ? { width: 8, height: 96 } : { width: 96, height: 8 };
    case 'history': case 'deepHistory': return { width: 30, height: 30 };
    case 'entryPoint': case 'exitPoint': return { width: 16, height: 16 };
    default: {
      const lines = activity ? activity.split('\n').filter(Boolean) : [];
      const widest = Math.max(name.length, ...lines.map((l) => l.length * 0.92));
      return { width: Math.round(Math.max(110, widest * 7.4 + 36) / 10) * 10, height: 40 + (lines.length ? lines.length * 15 + 10 : 0) };
    }
  }
}
export function shapeSizeOf(type: 'usecase' | 'component', d: any): { width: number; height: number } {
  const label = String(d.label ?? '');
  if (type === 'usecase') {
    if (d.ucKind === 'actor') return { width: Math.max(70, snap(label.length * 7.6 + 20)), height: 100 };
    const eps: string[] = d.extensionPoints ?? [];
    const epW = Math.max(0, ...eps.map((e) => e.length)) * 6.6 + 40;
    return { width: Math.max(150, snap(Math.max(label.length * 7.6 + 56, epW))), height: (label.length > 28 ? 80 : 64) + (eps.length ? 22 + eps.length * 15 : 0) };
  }
  const per = ((d.ports ?? []) as any[]).reduce((m: Record<string, number>, p) => { m[p.side] = (m[p.side] ?? 0) + 1; return m; }, {});
  const portH = 30 * Math.max(per.left ?? 0, per.right ?? 0) + 14;
  const portW = 40 * Math.max(per.top ?? 0, per.bottom ?? 0) + 20;
  const fit = (r: { width: number; height: number }) => ({ width: Math.max(r.width, portW), height: Math.max(r.height, portH) });
  switch (d.compKind) {
    case 'node': return fit({ width: Math.max(150, snap(label.length * 7.6 + 60)), height: 90 });
    case 'artifact': return fit({ width: Math.max(130, snap(label.length * 7.6 + 50)), height: 72 });
    default: return fit({ width: Math.max(150, snap(label.length * 7.6 + 70)), height: 72 });
  }
}

/** size of an activity element (mirrors src/lib/activity/sizes.ts) */
export function actSizeOf(d: any): { width: number; height: number } {
  const label = String(d.label ?? '');
  const longest = Math.max(0, ...label.split('\n').map((l) => l.length));
  const lines = label ? label.split('\n').length : 1;
  switch (d.actKind) {
    case 'initial': return { width: 28, height: 28 };
    case 'final': return { width: 36, height: 36 };
    case 'flowFinal': return { width: 30, height: 30 };
    case 'decision': return { width: 56, height: 56 };
    case 'fork': return d.vertical ? { width: 8, height: 120 } : { width: 120, height: 8 };
    case 'object': return { width: Math.max(110, snap(longest * 7.6 + 32)), height: d.objectState ? 62 : 46 };
    case 'send': case 'accept': return { width: Math.max(130, snap(longest * 7.6 + 56)), height: 48 };
    case 'note': return { width: Math.max(140, snap(longest * 6.8 + 28)), height: Math.max(56, 28 + lines * 17) };
    default: return { width: Math.max(120, snap(longest * 7.6 + 36)), height: Math.max(48, 24 + lines * 20) };
  }
}
/** size of a deployment element (mirrors src/lib/deployment/sizes.ts) */
export function depSizeOf(d: any): { width: number; height: number } {
  const label = String(d.label ?? '');
  switch (d.depKind) {
    case 'device': return { width: Math.max(160, snap(label.length * 7.6 + 70)), height: 110 };
    case 'executionEnvironment': return { width: Math.max(150, snap(label.length * 7.6 + 60)), height: 80 };
    case 'artifact': return { width: Math.max(130, snap(label.length * 7.6 + 50)), height: 72 };
    case 'component': return { width: Math.max(150, snap(label.length * 7.6 + 70)), height: 72 };
    default: return { width: Math.max(160, snap(label.length * 7.6 + 70)), height: 96 };
  }
}
/** size of an object (mirrors src/lib/object/sizes.ts) */
export function objSizeOf(d: any): { width: number; height: number } {
  const slots: { name: string; value: string }[] = d.slots ?? [];
  const head = `${d.label ?? ''}${d.className ? ` : ${d.className}` : ''}`;
  let w = head.length * 7.6 + 32;
  for (const s of slots) w = Math.max(w, `${s.name}${s.value ? ` = ${s.value}` : ''}`.length * 6.9 + 28);
  return { width: Math.round(Math.min(420, Math.max(150, w)) / 10) * 10, height: 36 + (slots.length ? 8 + slots.length * 22 : 0) + 2 };
}

type Cat = 'cls' | 'pkg' | 'state' | 'uc' | 'comp' | 'act' | 'dep' | 'obj';
const catOf = (n: CNode): Cat | undefined =>
  n.type === 'class' ? 'cls' : isGroupOf(n, 'package') ? 'pkg' : isStateLike(n) ? 'state' : isUcNode(n) || isGroupOf(n, 'boundary') ? 'uc' : isCompNode(n) ? 'comp' : isActLike(n) ? 'act' : isDepNode(n) ? 'dep' : isObjNode(n) ? 'obj' : undefined;

interface Want { id: string; cat: Cat; type: string; variant?: string; parent?: string; line: number; groupSize?: [number, number]; data: (old: any | undefined) => any; size?: (data: any) => { width: number; height: number } }

const setOrDelete = (o: any, k: string, v: unknown) => { if (v === undefined || v === false || v === '') delete o[k]; else o[k] = v; };

function members(defs: DslDoc['classes'][number]['attrs'], prefix: 'a' | 'o', oldList: any[]): any[] {
  const used = new Set<string>();
  let next = 0;
  for (const m of oldList) { const x = /^[ao](\d+)$/.exec(m.id); if (x) next = Math.max(next, Number(x[1]) + 1); }
  return defs.map((def) => {
    const old = oldList.find((m) => m.name === def.name && !used.has(m.id) && !!m.params === def.op);
    const id: string = old?.id ?? `${prefix}${next++}`;
    used.add(id);
    const m: any = { ...(old ?? {}), id, visibility: def.vis, name: def.name };
    setOrDelete(m, 'type', def.type);
    setOrDelete(m, 'default', def.default);
    setOrDelete(m, 'static', def.static);
    setOrDelete(m, 'abstract', def.abstract);
    if (def.op) m.params = def.params ?? []; else delete m.params;
    return m;
  });
}

export function applyUml(page: CPage, doc: DslDoc, env: UmlEnv): Set<string> {
  const { added, removed, fresh, nodeIds, err, warn } = env;
  const owned = new Set<string>();
  const oldNodes = page.nodes.filter((n) => catOf(n));
  for (const n of oldNodes) owned.add(n.id);
  const oldEdges = {
    cls: ownedClassEdges(page), state: ownedTransitions(page), uc: ownedUcEdges(page), comp: ownedCompEdges(page), act: ownedActEdges(page), dep: ownedDepEdges(page), pkg: ownedPkgEdges(page), obj: ownedObjEdges(page),
  };
  const anyNew = doc.classes.length + doc.packages.length + doc.states.length + doc.ucItems.length + doc.comps.length + doc.actNodes.length + doc.depNodes.length + doc.objects.length;

  // ---- wants ----
  const wants: Want[] = [];
  const classId = new Map<string, string>();
  const usedOld = new Set<string>();
  // classes are known by name: match those first; when exactly one class of the text and one node are left over, it is a rename (keeps the node, its place, links and style)
  const oldOf = new Map<(typeof doc.classes)[number], CNode>();
  for (const dc of doc.classes) {
    const old = page.nodes.find((n) => n.type === 'class' && n.data.label === dc.name && !usedOld.has(n.id));
    if (old) { usedOld.add(old.id); oldOf.set(dc, old); }
  }
  const newOnes = doc.classes.filter((dc) => !oldOf.has(dc));
  const goneOnes = page.nodes.filter((n) => n.type === 'class' && !usedOld.has(n.id));
  if (newOnes.length === 1 && goneOnes.length === 1) { oldOf.set(newOnes[0], goneOnes[0]); usedOld.add(goneOnes[0].id); }
  for (const dc of doc.classes) {
    const old = oldOf.get(dc);
    const id = old?.id ?? uniq(`cls-${slug(dc.name)}`, nodeIds);
    classId.set(dc.name, id);
    wants.push({
      id, cat: 'cls', type: 'class', parent: dc.pkg, line: dc.line,
      data: (o) => {
        const d: any = { ...(o ?? {}), label: dc.name, kind: dc.kind };
        setOrDelete(d, 'generics', dc.generics);
        if (dc.archRef) d.archRef = dc.archRef; else delete d.archRef;
        setOrDelete(d, 'modelId', dc.modelId);
        setOrDelete(d, 'stereotype', dc.stereotype);
        if (dc.pkg) d.package = doc.packages.find((p) => p.id === dc.pkg)?.label;
        d.attributes = members(dc.attrs, 'a', o?.attributes ?? []);
        d.operations = members(dc.ops, 'o', o?.operations ?? []);
        d.accent = o?.accent ?? KIND_ACCENT[dc.kind];
        return d;
      },
      size: classSizeOf,
    });
  }
  for (const p of doc.packages) {
    wants.push({
      id: p.id, cat: 'pkg', type: 'group', variant: 'package', parent: p.parent, line: p.line, groupSize: [360, 240],
      data: (o) => ({ ...(o ?? { stroke: '#4b5563', accent: '#4b5563', fillOpacity: 0, border: true, strokeWidth: 1.5, strokeStyle: 'solid' }), label: p.label, variant: 'package' }),
    });
  }
  for (const s of doc.states) {
    if (s.composite) {
      wants.push({
        id: s.id, cat: 'state', type: 'group', variant: 'composite', parent: s.parent, line: s.line, groupSize: [360, 220],
        data: (o) => { const d: any = { ...(o ?? { accent: STATE_ACCENT, stroke: STATE_ACCENT, fillOpacity: 6, border: true }), label: s.label, variant: 'composite' }; setOrDelete(d, 'region', s.region > 0 ? s.region : undefined); return d; },
      });
    } else {
      wants.push({
        id: s.id, cat: 'state', type: 'state', parent: s.parent, line: s.line,
        data: (o) => {
          const d: any = { ...(o ?? { accent: STATE_ACCENT }), label: s.label, stateKind: s.kind };
          setOrDelete(d, 'activity', s.activity);
          setOrDelete(d, 'vertical', s.vertical && (s.kind === 'fork' || s.kind === 'join'));
          setOrDelete(d, 'region', s.region > 0 ? s.region : undefined);
          return d;
        },
        size: (d) => stateSizeOf(d.stateKind, d.label, d.activity, d.vertical),
      });
    }
  }
  for (const u of doc.ucItems) {
    if (u.kind === 'boundary') {
      wants.push({ id: u.id, cat: 'uc', type: 'group', variant: 'boundary', line: u.line, groupSize: [420, 320], data: (o) => ({ ...(o ?? { accent: UC_ACCENT, stroke: UC_ACCENT, fillOpacity: 3, border: true }), label: u.label, variant: 'boundary' }) });
    } else {
      wants.push({
        id: u.id, cat: 'uc', type: 'usecase', parent: u.parent, line: u.line,
        data: (o) => { const d: any = { accent: UC_ACCENT, ...(o ?? {}), label: u.label, ucKind: u.kind }; if (u.points.length && u.kind === 'usecase') d.extensionPoints = u.points; else delete d.extensionPoints; return d; },
        size: (d) => shapeSizeOf('usecase', d),
      });
    }
  }
  const containers = new Set(doc.comps.map((c) => c.parent).filter(Boolean) as string[]);
  for (const c of doc.comps) {
    wants.push({
      id: c.id, cat: 'comp', type: 'component', parent: c.parent, line: c.line,
      data: (o) => {
        const d: any = { accent: COMP_ACCENT, ...(o ?? {}), label: c.label, compKind: c.kind };
        setOrDelete(d, 'stereotype', c.stereotype);
        if (c.archRef) d.archRef = c.archRef; else delete d.archRef;
        const old: any[] = o?.ports ?? [];
        const used = new Set<string>();
        let next = 0;
        for (const p of old) { const x = /^p(\d+)$/.exec(p.id); if (x) next = Math.max(next, Number(x[1])); }
        const pick = (kind: 'provided' | 'required', names: string[], side: 'left' | 'right') => names.map((name) => {
          const hit = old.find((p) => p.kind === kind && p.name === name && !used.has(p.id));
          if (hit) { used.add(hit.id); return hit; }
          const id = `p${++next}`;
          used.add(id);
          return { id, name, kind, side };
        });
        const ports = [...pick('provided', c.provides, 'left'), ...pick('required', c.requires, 'right')];
        // keep the side / offset of existing ports; spread the new ones evenly per side like the client does
        const count: Record<string, number> = {};
        for (const p of ports) count[p.side] = (count[p.side] ?? 0) + 1;
        const seen: Record<string, number> = {};
        const spread = ports.map((p) => { const i = (seen[p.side] = (seen[p.side] ?? -1) + 1); return old.includes(p) ? p : { ...p, offset: (i + 1) / (count[p.side] + 1) }; });
        if (spread.length) d.ports = spread; else delete d.ports;
        setOrDelete(d, 'container', containers.has(c.id));
        return d;
      },
      size: (d) => shapeSizeOf('component', d),
    });
  }
  for (const l of doc.actLanes) {
    wants.push({
      id: l.id, cat: 'act', type: 'group', variant: 'lane', line: l.line, groupSize: l.orient === 'h' ? [640, 200] : [240, 520],
      data: (o) => ({ ...(o ?? { accent: ACT_ACCENT, stroke: ACT_ACCENT, fillOpacity: 3, border: true }), label: l.label, variant: 'lane', laneOrient: l.orient }),
    });
  }
  for (const a of doc.actNodes) {
    wants.push({
      id: a.id, cat: 'act', type: 'activity', parent: a.lane, line: a.line,
      data: (o) => {
        const d: any = { accent: ACT_ACCENT, ...(o ?? {}), label: a.label, actKind: a.kind };
        setOrDelete(d, 'vertical', a.vertical && a.kind === 'fork');
        setOrDelete(d, 'objectState', a.kind === 'object' ? a.state : undefined);
        return d;
      },
      size: actSizeOf,
    });
  }
  const depContainers = new Set(doc.depNodes.map((c) => c.parent).filter(Boolean) as string[]);
  for (const c of doc.depNodes) {
    let hit = c.icon ? resolveIcon(c.icon) : undefined;
    if (c.icon && !hit) warn(c.line, `unknown icon "${c.icon}" (autocomplete lists the catalog)`);
    if (hit?.kind === 'cluster') { warn(c.line, `"${c.icon}" is a cluster profile; use an icon id`); hit = undefined; }
    wants.push({
      id: c.id, cat: 'dep', type: 'deployment', parent: c.parent, line: c.line,
      data: (o) => {
        const d: any = { accent: DEP_ACCENT, ...(o ?? {}), label: c.label, depKind: c.kind };
        setOrDelete(d, 'stereotype', c.stereotype);
        setOrDelete(d, 'iconId', hit?.id);
        setOrDelete(d, 'container', depContainers.has(c.id));
        return d;
      },
      size: depSizeOf,
    });
  }
  for (const o of doc.objects) {
    wants.push({
      id: o.id, cat: 'obj', type: 'object', line: o.line,
      data: (old) => {
        const d: any = { accent: OBJ_ACCENT, ...(old ?? {}), label: o.label };
        setOrDelete(d, 'className', o.className);
        setOrDelete(d, 'modelId', o.modelId);
        const prev: any[] = old?.slots ?? [];
        const used = new Set<string>();
        let next = 0;
        for (const x of prev) { const m = /^s(\d+)$/.exec(x.id); if (m) next = Math.max(next, Number(m[1]) + 1); }
        d.slots = o.slots.map((sl) => {
          const hit = prev.find((x) => x.name === sl.name && !used.has(x.id));
          const id: string = hit?.id ?? `s${next++}`;
          used.add(id);
          return { ...(hit ?? {}), id, name: sl.name, value: sl.value };
        });
        return d;
      },
      size: objSizeOf,
    });
  }

  // ---- nodes ----
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const wanted = new Set<string>();
  const dataKey = (n: CNode) => JSON.stringify(n.data);
  for (const w of wants) {
    const old = byId.get(w.id);
    if (old && catOf(old) !== w.cat) { err(w.line, `id "${w.id}" is used by a node the text cannot edit as this kind (${old.type})`); continue; }
    wanted.add(w.id);
    let n = old;
    if (n && (n.type !== w.type || (w.type === 'group' && n.data.variant !== w.variant))) {
      // a state became a composite (or an actor a boundary ...): rebuild the node, keep its place
      const rebuilt: CNode = { id: w.id, type: w.type, position: n.position, data: w.data(undefined), ...(n.parentId ? { parentId: n.parentId } : {}) };
      page.nodes[page.nodes.indexOf(n)] = rebuilt;
      byId.set(w.id, rebuilt);
      if (w.groupSize) { rebuilt.width = n.width ?? w.groupSize[0]; rebuilt.height = n.height ?? w.groupSize[1]; }
      else if (w.size) { const s = w.size(rebuilt.data); rebuilt.width = s.width; rebuilt.height = s.height; }
      n = rebuilt;
    } else if (!n) {
      n = { id: w.id, type: w.type, position: { x: 0, y: 0 }, data: w.data(undefined) };
      if (w.groupSize) { n.width = w.groupSize[0]; n.height = w.groupSize[1]; } else if (w.size) { const s = w.size(n.data); n.width = s.width; n.height = s.height; }
      page.nodes.push(n);
      byId.set(n.id, n);
      added.add(n.id);
      fresh.add(n.id);
    } else {
      const before = dataKey(n);
      const wasContainer = !!n.data.container;
      n.data = w.data(n.data);
      if (w.cat === 'dep' && n.data.container) {
        // a deployment container keeps the size it was laid out with; a node that just became one gets room for its content
        if (!wasContainer) { n.width = 320; n.height = 220; }
      } else if (w.size && dataKey(n) !== before) { const s = w.size(n.data); n.width = s.width; n.height = s.height; }
    }
    const container = w.cat === 'comp' && containers.has(w.id);
    if (container && !n.width) { n.width = 300; n.height = 200; }
    if (w.cat === 'dep' && depContainers.has(w.id) && added.has(w.id)) { n.width = 320; n.height = 220; }
    if ((n.parentId ?? undefined) !== w.parent) {
      if (w.parent) n.parentId = w.parent; else delete n.parentId;
      if (!added.has(n.id)) fresh.add(n.id);
    }
  }
  // unknown parents are reported once
  for (const w of wants) if (w.parent && !byId.has(w.parent)) err(w.line, `unknown parent "${w.parent}"`);
  for (const n of oldNodes) if (!wanted.has(n.id) && (anyNew || true)) removed.push(n.id);

  // ---- edges ----
  const edgeIds = new Set(page.edges.map((e) => e.id));
  interface WantEdge { s: string; t: string; uml: any; label?: string; strip?: string[] }
  const ENDS: Record<string, [string, boolean]> = { inheritance: ['hollowTriangle', false], realization: ['hollowTriangle', true], composition: ['filledDiamond', false], aggregation: ['hollowDiamond', false], dependency: ['open', true], transition: ['arrow', false], include: ['open', true], extend: ['open', true], generalization: ['hollowTriangle', false], assembly: ['none', false], note: ['none', true], communication: ['none', false], deploy: ['open', true], manifest: ['open', true], import: ['open', true], access: ['open', true], merge: ['open', true], link: ['none', false] };
  const sync = (old: CEdge[], list: WantEdge[], prefix: string): void => {
    const pool = new Map<string, CEdge[]>();
    for (const e of old) { const k = `${e.source}|${e.target}|${e.data!.uml.kind}`; pool.set(k, [...(pool.get(k) ?? []), e]); }
    const seenPair = new Map<string, number>();
    const keep = new Set<string>();
    for (const w of list) {
      const key = `${w.s}|${w.t}|${w.uml.kind}`;
      const k = seenPair.get(key) ?? 0;
      seenPair.set(key, k + 1);
      let e = pool.get(key)?.[k];
      const isNew = !e;
      if (!e) {
        e = { id: uniq(`${prefix}-${slug(w.s)}-${slug(w.t)}`, edgeIds), source: w.s, target: w.t };
        page.edges.push(e);
        added.add(e.id);
      }
      keep.add(e.id);
      if (w.label) e.label = w.label; else delete e.label;
      const u: any = { ...(e.data?.uml ?? {}), ...w.uml };
      for (const f of ['directed', 'sourceMult', 'targetMult', 'sourceRole', 'targetRole', ...(w.strip ?? [])]) if (w.uml[f] === undefined) delete u[f];
      const [end, dashed] = ENDS[u.kind] ?? [u.directed ? 'open' : 'none', false];
      const endMarker = u.kind === 'association' ? (u.directed ? 'open' : 'none') : end;
      const data: any = { ...(e.data ?? {}), uml: u };
      if (isNew || data.color === undefined) data.color = UML_COLOR;
      if (isNew || data.arrows === undefined) data.arrows = 'none';
      data.startMarker = 'none';
      data.endMarker = endMarker;
      data.strokeStyle = dashed ? 'dashed' : 'solid';
      data.dashed = dashed;
      e.data = data;
    }
    for (const e of old) if (!keep.has(e.id)) removed.push(e.id);
  };
  const stereo = (kind: string) => (kind === 'include' || kind === 'extend' || kind === 'deploy' || kind === 'manifest' || kind === 'import' || kind === 'access' || kind === 'merge' ? `«${kind}»` : undefined);
  const has = (id: string | undefined): id is string => !!id && byId.has(id);
  sync(oldEdges.cls, doc.classRels.flatMap((r) => {
    const s = classId.get(r.from), t = classId.get(r.to);
    if (!has(s) || !has(t)) return [];
    return [{ s, t, label: r.label, uml: { kind: r.kind, ...(r.directed ? { directed: true } : {}), ...(r.srcMult ? { sourceMult: r.srcMult } : {}), ...(r.dstMult ? { targetMult: r.dstMult } : {}), ...(r.srcRole ? { sourceRole: r.srcRole } : {}), ...(r.dstRole ? { targetRole: r.dstRole } : {}) } }];
  }), 'uml');
  sync(oldEdges.state, doc.transitions.filter((t) => has(t.from) && has(t.to)).map((t) => ({ s: t.from, t: t.to, label: t.label, uml: { kind: 'transition' } })), 'te');
  sync(oldEdges.uc, doc.ucRels.filter((r) => has(r.from) && has(r.to)).map((r) => ({ s: r.from, t: r.to, label: r.label ?? stereo(r.kind), uml: { kind: r.kind, ...(r.srcMult ? { sourceMult: r.srcMult } : {}), ...(r.dstMult ? { targetMult: r.dstMult } : {}) } })), 'ue');
  // components: explicit links, then the assemblies implied by provided / required interfaces
  const compEdges: WantEdge[] = doc.compLinks.filter((l) => has(l.from) && has(l.to)).map((l) => ({ s: l.from, t: l.to, label: l.label, uml: { kind: l.kind }, strip: ['sourcePort', 'targetPort'] }));
  for (const r of doc.comps) for (const name of r.requires) for (const p of doc.comps) {
    if (p.id === r.id || !p.provides.includes(name) || !has(r.id) || !has(p.id)) continue;
    const sp = (byId.get(r.id)!.data.ports ?? []).find((x: any) => x.kind === 'required' && x.name === name);
    const tp = (byId.get(p.id)!.data.ports ?? []).find((x: any) => x.kind === 'provided' && x.name === name);
    if (sp && tp) compEdges.push({ s: r.id, t: p.id, uml: { kind: 'assembly', sourcePort: sp.id, targetPort: tp.id } });
  }
  sync(oldEdges.comp, compEdges, 'ce');
  sync(oldEdges.act, doc.actFlows.filter((f) => has(f.from) && has(f.to)).map((f) => ({ s: f.from, t: f.to, label: f.note ? undefined : f.label, uml: { kind: f.note ? 'note' : 'transition' } })), 'af');
  sync(oldEdges.dep, doc.depLinks.filter((l) => has(l.from) && has(l.to)).map((l) => ({ s: l.from, t: l.to, label: l.label ?? stereo(l.kind), uml: { kind: l.kind } })), 'de');
  sync(oldEdges.pkg, doc.pkgRels.filter((r) => has(r.from) && has(r.to)).map((r) => ({ s: r.from, t: r.to, label: r.label ?? stereo(r.kind), uml: { kind: r.kind } })), 'pe');
  // communication diagram: each numbered message goes to the first link between its two objects; the link text is the messages
  const taken = new Set<unknown>();
  sync(oldEdges.obj, doc.objLinks.filter((l) => has(l.from) && has(l.to)).map((l) => {
    const mine = doc.commMsgs.filter((m) => !taken.has(m) && ((m.from === l.from && m.to === l.to) || (m.from === l.to && m.to === l.from)));
    for (const m of mine) taken.add(m);
    const messages = mine.map((m) => ({ id: `m${doc.commMsgs.indexOf(m) + 1}`, seq: m.seq, text: m.text, dir: m.from === l.from ? 'fwd' : 'back', ...(m.async ? { async: true } : {}) }));
    const label = messages.length ? messages.map((m) => `${m.seq}: ${m.text}${m.text ? ' ' : ''}${m.async ? (m.dir === 'fwd' ? '⇢' : '⇠') : m.dir === 'fwd' ? '→' : '←'}`).join('\n') : l.label;
    return { s: l.from, t: l.to, label, strip: ['messages'], uml: { kind: 'link', ...(l.srcRole ? { sourceRole: l.srcRole } : {}), ...(l.dstRole ? { targetRole: l.dstRole } : {}), ...(messages.length ? { messages } : {}) } };
  }), 'oe');
  void isImpliedAssembly;
  return owned;
}
