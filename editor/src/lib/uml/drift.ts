/**
 * Code ↔ UML drift: compare a class diagram on the canvas with a class model parsed from source code (the code is the reference).
 * Classes and members are matched by name (operations by name and parameter count, so overloads stay apart). Pure: nothing here
 * touches the store; `driftApply.ts` applies single changes.
 */
import type { DiagramEdge, DiagramNode } from '../../types';
import { classOf } from './geometry';
import type { MemberDef, UmlClassDef, UmlModel, UmlRelDef } from './model';
import type { ClassMember } from './types';
import { umlOf } from './edges';

export type Status = 'added' | 'removed' | 'changed';
export type Comp = 'attributes' | 'operations';

export interface MemberChange {
  comp: Comp;
  /** `a:name` / `o:name/paramCount` */
  key: string;
  name: string;
  status: Status;
  /** the member on the canvas (with its id) */
  before?: ClassMember;
  /** the member in the code */
  after?: MemberDef;
  /** what differs: type, visibility, default, static, abstract, params */
  fields: string[];
}
export interface ClassChange {
  name: string;
  status: Status | 'same';
  nodeId?: string;
  /** the class in the code (added / changed) */
  after?: UmlClassDef;
  /** the class on the canvas is the same class under another name in the code: [canvas name, code name] (accepting renames the node, keeping its id, position, links and shared model) */
  header: { name?: [string, string]; kind?: [string, string]; generics?: [string | undefined, string | undefined]; stereotype?: [string | undefined, string | undefined] };
  members: MemberChange[];
}
export interface RelChange { key: string; status: 'added' | 'removed'; rel: UmlRelDef; edgeId?: string }
export interface Drift { classes: ClassChange[]; relations: RelChange[]; isEmpty: boolean }
export interface DriftOptions {
  /** also report classes of the diagram that the code does not contain (off: a partial re-import must not flag everything else) */
  removed?: boolean;
}

const memberKey = (comp: Comp, m: { name: string; params?: unknown[] }) => (comp === 'attributes' ? `a:${m.name}` : `o:${m.name}/${(m.params ?? []).length}`);
const paramText = (m: { params?: { name: string; type?: string }[] }) => (m.params ?? []).map((p) => `${p.name}:${p.type ?? ''}`).join(',');

function memberFields(a: ClassMember, b: MemberDef): string[] {
  const out: string[] = [];
  if ((a.type ?? '') !== (b.type ?? '')) out.push('type');
  if ((a.visibility ?? '') !== (b.visibility ?? '')) out.push('visibility');
  if ((a.default ?? '') !== (b.default ?? '')) out.push('default');
  if (!!a.static !== !!b.static) out.push('static');
  if (!!a.abstract !== !!b.abstract) out.push('abstract');
  if (paramText(a) !== paramText(b)) out.push('params');
  return out;
}

const relKey = (r: Pick<UmlRelDef, 'from' | 'to' | 'kind'>) => `${r.from}>${r.to}:${r.kind}`;
const HIERARCHY = new Set(['inheritance', 'realization']);

export function computeDrift(nodes: DiagramNode[], edges: DiagramEdge[], code: UmlModel, opts: DriftOptions = {}): Drift {
  const onCanvas = nodes.filter((n) => n.type === 'class');
  const byName = new Map(onCanvas.map((n) => [classOf(n).label, n]));
  const declared = code.classes.filter((c) => !c.external);
  const codeNames = new Set(declared.map((c) => c.name));
  const classes: ClassChange[] = [];

  // a class that is new in the code and a class that is gone from it, with (nearly) the same members, is a rename: pair them 1:1, best match first
  const renamed = new Map<string, DiagramNode>();
  {
    const keysOf = (comps: { attributes: { name: string; params?: unknown[] }[]; operations: { name: string; params?: unknown[] }[] }) =>
      new Set<string>([...comps.attributes.map((m) => memberKey('attributes', m)), ...comps.operations.map((m) => memberKey('operations', m))]);
    const fresh = declared.filter((c) => !byName.has(c.name));
    const orphans = onCanvas.filter((n) => !codeNames.has(classOf(n).label));
    const pairs: { c: UmlClassDef; n: DiagramNode; score: number }[] = [];
    for (const c of fresh) for (const n of orphans) {
      const a = keysOf(classOf(n)), b = keysOf(c);
      const union = new Set([...a, ...b]).size;
      const same = [...a].filter((k) => b.has(k)).length;
      // empty classes carry no evidence; a rename must keep most members
      if (!union || !same) continue;
      const score = same / union;
      if (score >= 0.6 && classOf(n).kind === c.kind) pairs.push({ c, n, score });
    }
    pairs.sort((x, y) => y.score - x.score);
    const usedN = new Set<string>();
    for (const p of pairs) if (!renamed.has(p.c.name) && !usedN.has(p.n.id)) { renamed.set(p.c.name, p.n); usedN.add(p.n.id); }
  }

  for (const c of declared) {
    const node = byName.get(c.name) ?? renamed.get(c.name);
    if (!node) { classes.push({ name: c.name, status: 'added', after: c, header: {}, members: [] }); continue; }
    const d = classOf(node);
    const header: ClassChange['header'] = {};
    if (d.label !== c.name) header.name = [d.label, c.name];
    if (d.kind !== c.kind) header.kind = [d.kind, c.kind];
    if ((d.generics ?? '') !== (c.generics ?? '')) header.generics = [d.generics, c.generics];
    if ((d.stereotype ?? '') !== (c.stereotype ?? '')) header.stereotype = [d.stereotype, c.stereotype];
    const members: MemberChange[] = [];
    for (const comp of ['attributes', 'operations'] as Comp[]) {
      const have = new Map<string, ClassMember>();
      for (const m of d[comp]) have.set(memberKey(comp, m), m);
      const want = new Map<string, MemberDef>();
      for (const m of c[comp]) want.set(memberKey(comp, m), m);
      for (const [key, m] of want) {
        const b = have.get(key);
        if (!b) members.push({ comp, key, name: m.name, status: 'added', after: m, fields: [] });
        else {
          const fields = memberFields(b, m);
          if (fields.length) members.push({ comp, key, name: m.name, status: 'changed', before: b, after: m, fields });
        }
      }
      for (const [key, b] of have) if (!want.has(key)) members.push({ comp, key, name: b.name, status: 'removed', before: b, fields: [] });
    }
    const changed = members.length > 0 || Object.keys(header).length > 0;
    classes.push({ name: c.name, status: changed ? 'changed' : 'same', nodeId: node.id, after: c, header, members });
  }
  const renamedIds = new Set([...renamed.values()].map((n) => n.id));
  if (opts.removed) for (const n of onCanvas) if (!codeNames.has(classOf(n).label) && !renamedIds.has(n.id)) classes.push({ name: classOf(n).label, status: 'removed', nodeId: n.id, header: {}, members: [] });

  // relations
  const nameOf = new Map(onCanvas.map((n) => [n.id, classOf(n).label]));
  for (const [name, n] of renamed) nameOf.set(n.id, name); // relations of a renamed class are compared under its new name
  const haveRel = new Map<string, DiagramEdge>();
  for (const e of edges) {
    const u = umlOf(e);
    const a = nameOf.get(e.source), b = nameOf.get(e.target);
    if (!u || u.kind === 'note' || !a || !b) continue;
    haveRel.set(relKey({ from: a, to: b, kind: u.kind }), e);
  }
  const wantRel = new Map<string, UmlRelDef>();
  for (const r of code.relations) if (r.kind !== 'note' && codeNames.has(r.from) && (codeNames.has(r.to) || byName.has(r.to))) wantRel.set(relKey(r), r);
  const relations: RelChange[] = [];
  for (const [key, rel] of wantRel) if (!haveRel.has(key)) relations.push({ key, status: 'added', rel });
  for (const [key, e] of haveRel) {
    if (wantRel.has(key)) continue;
    const [from, rest] = key.split('>');
    const to = rest.split(':')[0];
    const kind = umlOf(e)!.kind;
    // only hierarchy edges are certain enough to call stale; associations drawn by hand are not proof of drift
    if (HIERARCHY.has(kind) && codeNames.has(from) && (codeNames.has(to) || opts.removed)) relations.push({ key, status: 'removed', rel: { from, to, kind }, edgeId: e.id });
  }
  const isEmpty = classes.every((c) => c.status === 'same') && relations.length === 0;
  return { classes, relations, isEmpty };
}

/** a stable id for one reviewable item */
export function driftKey(item: { class?: ClassChange; member?: MemberChange; relation?: RelChange }): string {
  if (item.relation) return `r:${item.relation.key}:${item.relation.status}`;
  if (item.class && item.member) return `m:${item.class.name}:${item.member.key}`;
  return `c:${item.class!.name}:${item.class!.status}`;
}
