/** Printers of the UML blocks (`classes`, `states`, `usecases`, `components`, `activity`, `deployment`, `packages`, `objects`) and the ownership rules shared with the builder. */
import { quote, word } from './lex';
import type { CEdge, CNode, CPage } from '../types';

export const CLASS_REL_KINDS = ['inheritance', 'realization', 'composition', 'aggregation', 'association', 'dependency'];
export const UC_REL_KINDS = ['association', 'include', 'extend', 'generalization'];
const archAttrs = (r: any): string => (r?.nodeId ? ` archRef=${attrVal(String(r.nodeId))}${r.fileId ? ` archFile=${attrVal(String(r.fileId))}` : ''}${r.pageId ? ` archPage=${attrVal(String(r.pageId))}` : ''}` : '');
export const GROUP_VARIANTS = ['package', 'composite', 'boundary', 'lane'];

const attrVal = (v: string) => (/^[A-Za-z0-9_.#/+*-]+$/.test(v) ? v : quote(v));
const uml = (e: CEdge): any => e.data?.uml;
export const isGroupOf = (n: CNode, variant: string): boolean => n.type === 'group' && n.data.variant === variant;
export const isStateLike = (n: CNode): boolean => n.type === 'state' || isGroupOf(n, 'composite');
export const isUcNode = (n: CNode): boolean => n.type === 'usecase';
export const isIfaceNode = (n: CNode): boolean => n.type === 'component' && (n.data.compKind === 'provided' || n.data.compKind === 'required');
export const isActNode = (n: CNode): boolean => n.type === 'activity';
export const isActLike = (n: CNode): boolean => isActNode(n) || isGroupOf(n, 'lane');
export const isDepNode = (n: CNode): boolean => n.type === 'deployment';
export const DEP_KINDS = ['node', 'device', 'executionEnvironment', 'artifact', 'component'];
export const DEP_LINK_KINDS = ['communication', 'deploy', 'manifest'];
export const PKG_REL_KINDS = ['import', 'access', 'merge', 'dependency'];
export const isObjNode = (n: CNode): boolean => n.type === 'object';
/** activity elements whose label defaults to the id in the text (the others default to empty) */
export const actLabelDefault = (kind: string, id: string): string => (['initial', 'final', 'flowFinal', 'fork', 'decision'].includes(kind) ? '' : id);
export const isCompNode = (n: CNode): boolean => n.type === 'component' && !isIfaceNode(n);

export const ownedClassEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter((n) => n.type === 'class').map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && CLASS_REL_KINDS.includes(uml(e)?.kind));
};
export const ownedTransitions = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isStateLike).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && uml(e)?.kind === 'transition');
};
export const ownedUcEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isUcNode).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && UC_REL_KINDS.includes(uml(e)?.kind));
};
/** assembly connectors between a required and a provided port of the same interface are implied by the ports */
export const isImpliedAssembly = (e: CEdge, byId: Map<string, CNode>): boolean => {
  const u = uml(e);
  if (u?.kind !== 'assembly' || !u.sourcePort || !u.targetPort) return false;
  const sp = (byId.get(e.source)?.data.ports ?? []).find((p: any) => p.id === u.sourcePort);
  const tp = (byId.get(e.target)?.data.ports ?? []).find((p: any) => p.id === u.targetPort);
  return !!sp && !!tp && sp.kind === 'required' && tp.kind === 'provided' && sp.name === tp.name;
};
export const ownedCompEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isCompNode).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && (uml(e)?.kind === 'dependency' || uml(e)?.kind === 'assembly'));
};

export const ownedActEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isActNode).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && (uml(e)?.kind === 'transition' || uml(e)?.kind === 'note'));
};
export const ownedDepEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isDepNode).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && DEP_LINK_KINDS.includes(uml(e)?.kind));
};
/** relations between package groups (class relations and dependencies between classes belong to `classes`) */
export const ownedPkgEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter((n) => isGroupOf(n, 'package')).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && PKG_REL_KINDS.includes(uml(e)?.kind));
};
export const ownedObjEdges = (page: Pick<CPage, 'nodes' | 'edges'>): CEdge[] => {
  const ids = new Set(page.nodes.filter(isObjNode).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && uml(e)?.kind === 'link');
};

function kidsOf(nodes: CNode[]): { kids: Map<string | undefined, CNode[]>; ids: Set<string> } {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string | undefined, CNode[]>();
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : undefined;
    kids.set(key, [...(kids.get(key) ?? []), n]);
  }
  return { kids, ids };
}

export function memberLine(m: any, op: boolean): string {
  const pre = `${m.visibility ? m.visibility + ' ' : ''}${m.static ? 'static ' : ''}${m.abstract ? 'abstract ' : ''}`;
  const name = /^[^\s:(=]+$/.test(m.name) ? m.name : quote(m.name);
  if (op) return `${pre}${name}(${(m.params ?? []).map((p: any) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')})${m.type ? `: ${m.type}` : ''}`;
  return `${pre}${name}${m.type ? `: ${m.type}` : ''}${m.default ? ` = ${m.default}` : ''}`;
}

export function printClasses(page: CPage, out: string[]): void {
  const classes = page.nodes.filter((n) => n.type === 'class');
  const pkgs = page.nodes.filter((n) => isGroupOf(n, 'package'));
  if (!classes.length && !pkgs.length) return;
  const { kids } = kidsOf([...pkgs, ...classes]);
  out.push('', 'classes {');
  const emit = (n: CNode, ind: string): void => {
    if (n.type === 'group') {
      out.push(`${ind}package ${word(n.id)} ${quote(String(n.data.label ?? ''))} {`);
      for (const k of kids.get(n.id) ?? []) emit(k, ind + '  ');
      out.push(`${ind}}`);
      return;
    }
    const d = n.data as any;
    const head = `${ind}${d.kind === 'abstract' ? 'abstract class' : d.kind === 'interface' || d.kind === 'enum' ? d.kind : 'class'} ${word(String(d.label))}${d.generics ? `<${d.generics}>` : ''}${d.stereotype ? ` ${quote(String(d.stereotype))}` : ''}${archAttrs(d.archRef)}${d.modelId ? ` model=${attrVal(String(d.modelId))}` : ''}`;
    const attrs: any[] = d.attributes ?? [];
    const ops: any[] = d.kind === 'enum' ? [] : d.operations ?? [];
    if (!attrs.length && !ops.length) return void out.push(head);
    out.push(`${head} {`);
    for (const a of attrs) out.push(`${ind}  ${memberLine(a, false)}`);
    for (const o of ops) out.push(`${ind}  ${memberLine(o, true)}`);
    out.push(`${ind}}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const name = new Map(classes.map((n) => [n.id, String(n.data.label)]));
  const edges = ownedClassEdges(page);
  if (edges.length) out.push('');
  for (const e of edges) {
    const u = uml(e);
    const op = u.kind === 'inheritance' ? '--|>' : u.kind === 'realization' ? '..|>' : u.kind === 'composition' ? '--*' : u.kind === 'aggregation' ? '--o' : u.kind === 'dependency' ? '..>' : u.directed ? '-->' : '--';
    const a: string[] = [];
    if (u.sourceMult) a.push(`srcMult=${attrVal(u.sourceMult)}`);
    if (u.targetMult) a.push(`dstMult=${attrVal(u.targetMult)}`);
    if (u.sourceRole) a.push(`srcRole=${attrVal(u.sourceRole)}`);
    if (u.targetRole) a.push(`dstRole=${attrVal(u.targetRole)}`);
    out.push(`  ${word(name.get(e.source)!)} ${op} ${word(name.get(e.target)!)}${e.label ? ` ${quote(String(e.label))}` : ''}${a.length ? ' ' + a.join(' ') : ''}`);
  }
  out.push('}');
}

export function printStates(page: CPage, out: string[]): void {
  const states = page.nodes.filter(isStateLike);
  if (!states.length) return;
  const { kids } = kidsOf(states);
  out.push('', 'states {');
  const emit = (n: CNode, ind: string): void => {
    const d = n.data as any;
    if (n.type === 'group') {
      const label = String(d.label ?? '');
      out.push(`${ind}state ${word(n.id)}${label && label !== n.id ? ` ${quote(label)}` : ''} {`);
      const ch = [...(kids.get(n.id) ?? [])].sort((a, b) => (a.data.region ?? 0) - (b.data.region ?? 0));
      let region = 0;
      for (const k of ch) {
        for (; region < (k.data.region ?? 0); region++) out.push(`${ind}  region`);
        emit(k, ind + '  ');
      }
      out.push(`${ind}}`);
      return;
    }
    const kind = d.stateKind ?? 'state';
    const label = String(d.label ?? '');
    const a: string[] = [];
    if (d.activity) a.push(`activity=${quote(String(d.activity))}`);
    if (d.vertical && (kind === 'fork' || kind === 'join')) a.push('vertical');
    out.push(`${ind}${kind} ${word(n.id)}${label && !(kind === 'state' && label === n.id) ? ` ${quote(label)}` : ''}${a.length ? ' ' + a.join(' ') : ''}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const edges = ownedTransitions(page);
  if (edges.length) out.push('');
  for (const e of edges) out.push(`  ${word(e.source)} -> ${word(e.target)}${e.label ? ` ${quote(String(e.label))}` : ''}`);
  out.push('}');
}

export function printUseCases(page: CPage, out: string[]): void {
  const nodes = page.nodes.filter((n) => isUcNode(n) || isGroupOf(n, 'boundary'));
  if (!nodes.length) return;
  const { kids } = kidsOf(nodes);
  out.push('', 'usecases {');
  const emit = (n: CNode, ind: string): void => {
    const d = n.data as any;
    const label = quote(String(d.label ?? ''));
    if (n.type === 'group') {
      out.push(`${ind}boundary ${word(n.id)} ${label} {`);
      for (const k of kids.get(n.id) ?? []) emit(k, ind + '  ');
      out.push(`${ind}}`);
    } else if (d.ucKind === 'actor') out.push(`${ind}actor ${word(n.id)} ${label}`);
    else if (d.extensionPoints?.length) {
      out.push(`${ind}usecase ${word(n.id)} ${label} {`);
      for (const p of d.extensionPoints) out.push(`${ind}  point ${quote(String(p))}`);
      out.push(`${ind}}`);
    } else out.push(`${ind}usecase ${word(n.id)} ${label}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const edges = ownedUcEdges(page);
  if (edges.length) out.push('');
  for (const e of edges) {
    const u = uml(e);
    const op = u.kind === 'association' ? '--' : u.kind === 'generalization' ? 'generalizes' : u.kind;
    const label = e.label && e.label !== `«${u.kind}»` ? ` ${quote(String(e.label))}` : '';
    const a: string[] = [];
    if (u.sourceMult) a.push(`srcMult=${attrVal(u.sourceMult)}`);
    if (u.targetMult) a.push(`dstMult=${attrVal(u.targetMult)}`);
    out.push(`  ${word(e.source)} ${op} ${word(e.target)}${label}${a.length ? ' ' + a.join(' ') : ''}`);
  }
  out.push('}');
}

export function printComponents(page: CPage, out: string[]): void {
  const comps = page.nodes.filter(isCompNode);
  if (!comps.length) return;
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const { kids } = kidsOf(comps);
  out.push('', 'components {');
  const emit = (n: CNode, ind: string): void => {
    const d = n.data as any;
    const ports: any[] = d.ports ?? [];
    const provides = ports.filter((p) => p.kind === 'provided').map((p) => word(p.name));
    const requires = ports.filter((p) => p.kind === 'required').map((p) => word(p.name));
    const children = kids.get(n.id) ?? [];
    const head = `${ind}${d.compKind ?? 'component'} ${word(n.id)} ${quote(String(d.label ?? ''))}${d.stereotype ? ` stereotype=${attrVal(String(d.stereotype))}` : ''}${archAttrs(d.archRef)}`;
    if (!provides.length && !requires.length && !children.length) return void out.push(head);
    out.push(`${head} {`);
    if (provides.length) out.push(`${ind}  provides ${provides.join(', ')}`);
    if (requires.length) out.push(`${ind}  requires ${requires.join(', ')}`);
    for (const k of children) emit(k, ind + '  ');
    out.push(`${ind}}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const edges = ownedCompEdges(page).filter((e) => !isImpliedAssembly(e, byId));
  if (edges.length) out.push('');
  for (const e of edges) out.push(`  ${word(e.source)} ${uml(e).kind === 'assembly' ? '--' : '..>'} ${word(e.target)}${e.label ? ` ${quote(String(e.label))}` : ''}`);
  out.push('}');
}

export function printActivity(page: CPage, out: string[]): void {
  const nodes = page.nodes.filter(isActLike);
  if (!nodes.length) return;
  const { kids } = kidsOf(nodes);
  out.push('', 'activity {');
  const emit = (n: CNode, ind: string): void => {
    const d = n.data as any;
    if (n.type === 'group') {
      out.push(`${ind}lane ${word(n.id)} ${quote(String(d.label ?? ''))}${d.laneOrient === 'h' ? ' orient=h' : ''} {`);
      for (const k of kids.get(n.id) ?? []) if (k.type === 'activity') emit(k, ind + '  ');
      out.push(`${ind}}`);
      return;
    }
    const kind = String(d.actKind ?? 'action');
    const label = String(d.label ?? '');
    const a: string[] = [];
    if (d.vertical && kind === 'fork') a.push('vertical');
    if (d.objectState && kind === 'object') a.push(`state=${attrVal(String(d.objectState))}`);
    out.push(`${ind}${kind} ${word(n.id)}${label !== actLabelDefault(kind, n.id) ? ` ${quote(label)}` : ''}${a.length ? ' ' + a.join(' ') : ''}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const edges = ownedActEdges(page);
  if (edges.length) out.push('');
  for (const e of edges) {
    const note = uml(e).kind === 'note';
    out.push(`  ${word(e.source)} ${note ? '--' : '->'} ${word(e.target)}${!note && e.label ? ` ${quote(String(e.label))}` : ''}`);
  }
  out.push('}');
}

export function printDeployment(page: CPage, out: string[]): void {
  const nodes = page.nodes.filter(isDepNode);
  if (!nodes.length) return;
  const { kids } = kidsOf(nodes);
  out.push('', 'deployment {');
  const emit = (n: CNode, ind: string): void => {
    const d = n.data as any;
    const children = kids.get(n.id) ?? [];
    const head = `${ind}${d.depKind ?? 'node'} ${word(n.id)} ${quote(String(d.label ?? ''))}${d.stereotype ? ` stereotype=${attrVal(String(d.stereotype))}` : ''}${d.iconId ? ` icon=${attrVal(String(d.iconId))}` : ''}`;
    if (!children.length) return void out.push(head);
    out.push(`${head} {`);
    for (const k of children) emit(k, ind + '  ');
    out.push(`${ind}}`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  const edges = ownedDepEdges(page);
  if (edges.length) out.push('');
  for (const e of edges) {
    const kind = uml(e).kind;
    const op = kind === 'communication' ? '--' : kind === 'deploy' ? '..>' : 'manifests';
    const label = e.label && e.label !== `«${kind}»` ? ` ${quote(String(e.label))}` : '';
    out.push(`  ${word(e.source)} ${op} ${word(e.target)}${label}`);
  }
  out.push('}');
}

/** only the relations between packages: the packages themselves (and their classes) are printed by `classes { }` */
export function printPackages(page: CPage, out: string[]): void {
  const edges = ownedPkgEdges(page);
  if (!edges.length) return;
  out.push('', 'packages {');
  for (const e of edges) {
    const kind = uml(e).kind;
    const op = kind === 'import' ? 'imports' : kind === 'access' ? 'access' : kind === 'merge' ? 'merges' : '..>';
    const label = e.label && e.label !== `«${kind}»` ? ` ${quote(String(e.label))}` : '';
    out.push(`  ${word(e.source)} ${op} ${word(e.target)}${label}`);
  }
  out.push('}');
}

const seqParts = (s: string): number[] => s.split('.').map(Number);
const compareSeq = (a: string, b: string): number => {
  const x = seqParts(a), y = seqParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; }
  return 0;
};

/** `objects { }`, or `communication { }` when a link carries numbered messages */
export function printObjects(page: CPage, out: string[]): void {
  const nodes = page.nodes.filter(isObjNode);
  if (!nodes.length) return;
  const edges = ownedObjEdges(page);
  const comm = edges.some((e) => (uml(e).messages ?? []).length > 0);
  out.push('', comm ? 'communication {' : 'objects {');
  for (const n of nodes) {
    const d = n.data as any;
    const label = String(d.label ?? '');
    const slots: any[] = d.slots ?? [];
    const head = `  object ${word(n.id)}${label !== n.id ? ` ${quote(label)}` : ''}${d.className ? ` class=${attrVal(String(d.className))}` : ''}${d.modelId ? ` model=${attrVal(String(d.modelId))}` : ''}`;
    if (!slots.length) { out.push(head); continue; }
    out.push(`${head} {`);
    for (const sl of slots) {
      const name = /^[^\s=]+$/.test(sl.name) ? sl.name : quote(sl.name);
      out.push(`    ${name}${sl.value ? ` = ${sl.value}` : ''}`);
    }
    out.push('  }');
  }
  // a link whose messages are listed below needs no line of its own, unless it has roles
  const lines = edges.filter((e) => { const u = uml(e); return !(u.messages ?? []).length || u.sourceRole || u.targetRole; });
  if (lines.length) out.push('');
  for (const e of lines) {
    const u = uml(e);
    const a: string[] = [];
    if (u.sourceRole) a.push(`srcRole=${attrVal(u.sourceRole)}`);
    if (u.targetRole) a.push(`dstRole=${attrVal(u.targetRole)}`);
    const plain = !(u.messages ?? []).length;
    out.push(`  ${word(e.source)} -- ${word(e.target)}${plain && e.label ? ` ${quote(String(e.label))}` : ''}${a.length ? ' ' + a.join(' ') : ''}`);
  }
  if (comm) {
    const msgs: { seq: string; from: string; to: string; text: string; async: boolean; i: number }[] = [];
    for (const e of edges) for (const m of uml(e).messages ?? []) msgs.push({ seq: m.seq, from: m.dir === 'back' ? e.target : e.source, to: m.dir === 'back' ? e.source : e.target, text: m.text ?? '', async: !!m.async, i: msgs.length });
    msgs.sort((x, y) => compareSeq(x.seq, y.seq) || x.i - y.i);
    out.push('');
    for (const m of msgs) out.push(`  ${m.seq} ${word(m.from)} -> ${word(m.to)}${m.text ? ` ${quote(m.text)}` : ''}${m.async ? ' async' : ''}`);
  }
  out.push('}');
}

/** exact text of the `timing` blocks (one per timing node) */
export function printTiming(page: CPage, out: string[]): void {
  const num = (v: number) => String(Math.round(v * 1000) / 1000);
  for (const n of page.nodes) {
    if (n.type !== 'timing') continue;
    const d = n.data as any;
    out.push('', `timing ${word(n.id)} ${quote(String(d.label ?? 'Timing'))} {`);
    if (d.unit) out.push(`  unit ${word(String(d.unit))}`);
    out.push(`  end ${num(d.end ?? 100)}`);
    for (const l of d.lifelines ?? []) {
      const nm = l.name !== l.id ? ` ${quote(l.name)}` : '';
      const states = (l.kind === 'robust' || l.kind === 'concise') && (l.states ?? []).length ? ` states ${(l.states as string[]).map((x) => (/^[A-Za-z0-9_.+-]+$/.test(x) ? x : quote(x))).join(', ')}` : '';
      out.push(`  ${l.kind} ${word(l.id)}${nm}${states}${l.kind === 'clock' && l.period ? ` period=${num(l.period)}` : ''}`);
    }
    const lifeIdx = new Map<string, number>((d.lifelines ?? []).map((l: any, i: number) => [l.id, i]));
    const state = (x: string) => (/^[A-Za-z0-9_.+-]+$/.test(x) ? x : quote(x));
    const changes = [...(d.changes ?? [])].map((c: any, i: number) => ({ c, i })).sort((a, b) => a.c.t - b.c.t || (lifeIdx.get(a.c.life) ?? 0) - (lifeIdx.get(b.c.life) ?? 0) || a.i - b.i);
    for (const { c } of changes) out.push(`  ${word(c.life)} @${num(c.t)} ${state(c.state)}`);
    for (const m of [...(d.messages ?? [])].sort((a: any, b: any) => a.t - b.t)) out.push(`  ${word(m.from)} -> ${word(m.to)} @${num(m.t)}${m.t2 !== undefined && m.t2 !== m.t ? `..${num(m.t2)}` : ''}${m.text ? ` ${quote(m.text)}` : ''}`);
    for (const k of d.durations ?? []) out.push(`  ${word(k.life)} ${num(k.t1)}..${num(k.t2)}${k.text ? ` ${quote(k.text)}` : ''}`);
    out.push('}');
  }
}
