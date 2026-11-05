/** Line parsers for the UML blocks of the `.sdd` text: `classes { }`, `states { }`, `usecases { }`, `components { }`, `activity { }`, `deployment { }`, `packages { }`, `objects { }`, `communication { }`. */
import { tokenize, type Tok } from './lex';
import type { ActKindText, DepKindText, Diagnostic, DslArchRef, DslClass, DslClassRelKind, DslDoc, DslMember, DslObject, DslUcItem, PkgRelKind, StateKindText } from './types';

export type UmlBlock = 'classes' | 'states' | 'usecases' | 'components' | 'activity' | 'deployment' | 'packages' | 'objects' | 'communication';
export const UML_BLOCKS = new Set<string>(['classes', 'states', 'usecases', 'components', 'activity', 'deployment', 'packages', 'objects', 'communication']);
type Frame =
  | { k: 'package'; id: string }
  | { k: 'class'; cls: DslClass }
  | { k: 'state'; id: string; region: number }
  | { k: 'boundary'; id: string }
  | { k: 'ucase'; item: DslUcItem }
  | { k: 'comp'; id: string }
  | { k: 'lane'; id: string }
  | { k: 'dep'; id: string }
  | { k: 'object'; obj: DslObject };
export interface UmlCtx { kind: 'uml'; block: UmlBlock; frames: Frame[]; line: number }
type Diag = (l: number, c: number, m: string, s?: Diagnostic['severity']) => void;

export const CLASS_REL_OPS: Record<string, { kind: DslClassRelKind; directed: boolean }> = {
  '--|>': { kind: 'inheritance', directed: false },
  '..|>': { kind: 'realization', directed: false },
  '--*': { kind: 'composition', directed: false },
  '--o': { kind: 'aggregation', directed: false },
  '-->': { kind: 'association', directed: true },
  '--': { kind: 'association', directed: false },
  '..>': { kind: 'dependency', directed: false },
};
const STATE_KINDS = new Set<string>(['state', 'initial', 'final', 'choice', 'fork', 'join', 'history', 'deepHistory', 'entryPoint', 'exitPoint']);
const UC_REL_WORDS: Record<string, 'include' | 'extend' | 'generalization'> = { include: 'include', extend: 'extend', generalizes: 'generalization' };
const COMP_KINDS = new Set(['component', 'node', 'artifact']);
const ACT_KINDS = new Set<string>(['initial', 'final', 'flowFinal', 'action', 'decision', 'fork', 'object', 'send', 'accept', 'note']);
/** activity elements whose label defaults to empty (the others default to their id) */
const ACT_PSEUDO = new Set<string>(['initial', 'final', 'flowFinal', 'fork', 'decision']);
const DEP_KINDS = new Set<string>(['node', 'device', 'executionEnvironment', 'artifact', 'component']);
const DEP_CONTAINERS = new Set<string>(['node', 'device', 'executionEnvironment']);
const PKG_REL_WORDS: Record<string, PkgRelKind> = { imports: 'import', access: 'access', merges: 'merge', '..>': 'dependency' };
const DEP_LINK_WORDS: Record<string, 'communication' | 'deploy' | 'manifest'> = { '--': 'communication', '..>': 'deploy', manifests: 'manifest' };

/** true while the innermost open construct is a class or object body (a `#` line is a protected member / part of a value there, not a comment) */
export const inClassBody = (ctx: UmlCtx | undefined): boolean => !!ctx && (ctx.frames[ctx.frames.length - 1]?.k === 'class' || ctx.frames[ctx.frames.length - 1]?.k === 'object');

export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let prev = '';
  for (const ch of s) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch) && !(ch === '>' && prev === '=')) depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    prev = ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const unquote = (s: string): string => {
  const t = s.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t;
};

/** `+ static name(a: A, b): R` / `- id: int = 0`; returns an error string when the line is not a member */
export function parseMember(body: string): DslMember | string {
  let t = body.trim();
  let vis: DslMember['vis'] = '';
  let st = false;
  let ab = false;
  for (;;) {
    const w = /^(static|abstract)\s+/.exec(t);
    if (w) { if (w[1] === 'static') st = true; else ab = true; t = t.slice(w[0].length); continue; }
    const v = /^([+\-#~])\s*/.exec(t);
    if (v && !vis) { vis = v[1] as DslMember['vis']; t = t.slice(v[0].length); continue; }
    break;
  }
  const nm = /^("[^"]+"|[^\s:(=]+)/.exec(t);
  if (!nm) return 'expected a member:  + name: Type  or  + name(a: A): R';
  const name = unquote(nm[1]);
  t = t.slice(nm[0].length).trimStart();
  if (t.startsWith('(')) {
    let depth = 0;
    let end = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')' && --depth === 0) { end = i; break; }
    }
    if (end < 0) return 'missing ")" in the operation';
    const params = splitTopLevel(t.slice(1, end)).map((p) => {
      const m = /^([^:\s]+)\s*(?::\s*(.+))?$/.exec(p);
      return m ? { name: m[1], ...(m[2] ? { type: m[2].trim() } : {}) } : { name: p };
    });
    const rest = /^\s*(?::\s*(.*))?$/.exec(t.slice(end + 1));
    if (!rest) return 'unexpected text after the operation';
    return { vis, static: st, abstract: ab, name, op: true, params, ...(rest[1]?.trim() ? { type: rest[1].trim() } : {}) };
  }
  const m = /^(?::\s*(.*?))?\s*(?:=\s*(.*))?$/.exec(t);
  if (!m || (t && !t.startsWith(':') && !t.startsWith('='))) return `unexpected "${t.slice(0, 20)}" after the member name`;
  return { vis, static: st, abstract: ab, name, op: false, ...(m[1]?.trim() ? { type: m[1].trim() } : {}), ...(m[2]?.trim() ? { default: m[2].trim() } : {}) };
}

const archRefOf = (a: Record<string, string>): DslArchRef | undefined => (a.archRef ? { nodeId: a.archRef, ...(a.archFile ? { fileId: a.archFile } : {}), ...(a.archPage ? { pageId: a.archPage } : {}) } : undefined);

function attrsOf(toks: Tok[], from: number, to: number, err: (t: Tok, m: string) => void): Record<string, string> {
  const out: Record<string, string> = {};
  let i = from;
  while (i < to) {
    const t = toks[i];
    if (t.k === 'sym' && t.v === ',') { i++; continue; }
    if (t.k !== 'word' && t.k !== 'str') { err(t, `unexpected "${t.v}"`); i++; continue; }
    if (toks[i + 1]?.k === 'sym' && toks[i + 1].v === '=' && i + 2 < to && toks[i + 2].k !== 'sym') { out[t.v] = toks[i + 2].v; i += 3; } else { out[t.v] = 'true'; i++; }
  }
  return out;
}

export function parseUmlLine(ctx: UmlCtx, src: string, ln: number, doc: DslDoc, diag: Diag, ids: Set<string>, stack: unknown[]): void {
  const s = src.trim();
  const frame = ctx.frames[ctx.frames.length - 1];
  if (s === '}') {
    if (ctx.frames.length) ctx.frames.pop(); else stack.pop();
    return;
  }
  // ---- class body: members ----
  if (frame?.k === 'class') {
    const m = parseMember(s);
    if (typeof m === 'string') return diag(ln, 1, m);
    const cls = frame.cls;
    if (cls.kind === 'enum') { cls.attrs.push({ ...m, op: false }); return; }
    (m.op ? cls.ops : cls.attrs).push(m);
    return;
  }
  // ---- object body: slots ----
  if (frame?.k === 'object') {
    const m = /^("[^"]+"|[^\s=]+)\s*(?:=\s*(.*))?$/.exec(s);
    if (!m) return diag(ln, 1, 'expected a slot:  attribute = value');
    frame.obj.slots.push({ name: unquote(m[1]), value: (m[2] ?? '').trim() });
    return;
  }
  const lex = tokenize(src);
  if (lex.error) return diag(ln, lex.error.col, lex.error.message);
  const toks = lex.toks;
  if (!toks.length) return;
  const err = (t: Tok, m: string) => diag(ln, t.col, m);
  const last = toks[toks.length - 1];
  const opens = last.k === 'sym' && last.v === '{';
  const end = opens ? toks.length - 1 : toks.length;
  const first = toks[0];
  const kw = first.k === 'word' ? first.v : '';
  const claim = (t: Tok): boolean => {
    if (ids.has(t.v)) { diag(ln, t.col, `duplicate id "${t.v}"`); return false; }
    ids.add(t.v);
    return true;
  };
  const parentOf = <K extends Frame['k']>(k: K): Extract<Frame, { k: K }> | undefined => [...ctx.frames].reverse().find((f): f is Extract<Frame, { k: K }> => f.k === k);

  if (ctx.block === 'classes') {
    if (kw === 'package') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, 'package needs an id, e.g. package shop "Shop" {');
      if (!opens) return err(last, 'expected "{" after the package');
      const label = toks[2]?.k === 'str' ? toks[2].v : idTok.v;
      if (claim(idTok)) doc.packages.push({ id: idTok.v, label, ...(parentOf('package') ? { parent: parentOf('package')!.id } : {}), line: ln });
      ctx.frames.push({ k: 'package', id: idTok.v });
      return;
    }
    const hm = /^(abstract\s+class|class|interface|enum)\s+("[^"]+"|[^\s<{"]+)(.*)$/.exec(s);
    if (hm) {
      const kind = hm[1].startsWith('abstract') ? 'abstract' : (hm[1] as DslClass['kind']);
      const name = unquote(hm[2]);
      let rest = hm[3];
      let generics: string | undefined;
      if (rest.startsWith('<')) {
        let depth = 0;
        let i = 0;
        for (; i < rest.length; i++) {
          if (rest[i] === '<') depth++;
          else if (rest[i] === '>' && rest[i - 1] !== '=' && --depth === 0) break;
        }
        if (i >= rest.length) return diag(ln, 1, 'missing ">" in the type parameters');
        generics = rest.slice(1, i).trim();
        rest = rest.slice(i + 1);
      }
      const rl = tokenize(rest);
      if (rl.error) return diag(ln, 1, rl.error.message);
      let rt = rl.toks;
      const ropens = rt.length > 0 && rt[rt.length - 1].k === 'sym' && rt[rt.length - 1].v === '{';
      if (ropens) rt = rt.slice(0, -1);
      let stereotype: string | undefined;
      const cls: DslClass = { name, kind, attrs: [], ops: [], line: ln };
      const sugar: { to: string; kind: DslClassRelKind }[] = [];
      let mode: 'extends' | 'implements' | '' = '';
      const hattrs: Record<string, string> = {};
      for (let ti = 0; ti < rt.length; ti++) {
        const t = rt[ti];
        if (t.k === 'word' && rt[ti + 1]?.k === 'sym' && rt[ti + 1].v === '=' && rt[ti + 2] && rt[ti + 2].k !== 'sym') { hattrs[t.v] = rt[ti + 2].v; ti += 2; }
        else if (t.k === 'str') stereotype = t.v;
        else if (t.k === 'word' && (t.v === 'extends' || t.v === 'implements')) mode = t.v;
        else if (t.k === 'word' && mode) sugar.push({ to: t.v, kind: mode === 'extends' ? 'inheritance' : 'realization' });
        else if (t.k === 'sym' && t.v === ',' && mode) continue;
        else diag(ln, t.col, `unexpected "${t.v}" in the class header`);
      }
      const ar = archRefOf(hattrs);
      if (ar) cls.archRef = ar;
      if (hattrs.model) cls.modelId = hattrs.model;
      if (doc.classes.some((c) => c.name === name)) diag(ln, 1, `duplicate class "${name}"`);
      else {
        const pkg = parentOf('package');
        if (generics) cls.generics = generics;
        if (stereotype) cls.stereotype = stereotype;
        if (pkg) cls.pkg = pkg.id;
        doc.classes.push(cls);
        for (const x of sugar) doc.classRels.push({ from: name, to: x.to, kind: x.kind, directed: false, line: ln });
      }
      if (ropens) ctx.frames.push({ k: 'class', cls });
      return;
    }
    const op = toks[1] && toks[1].k === 'word' ? CLASS_REL_OPS[toks[1].v] : undefined;
    if (op && toks.length >= 3 && toks[0].k !== 'sym') {
      let i = 3;
      let label: string | undefined;
      if (toks[i]?.k === 'str') label = toks[i++].v;
      const a = attrsOf(toks, i, toks.length, err);
      for (const k of Object.keys(a)) if (!['srcMult', 'dstMult', 'srcRole', 'dstRole'].includes(k)) diag(ln, 1, `unknown relation attribute "${k}"`, 'warning');
      doc.classRels.push({ from: toks[0].v, to: toks[2].v, kind: op.kind, directed: op.directed, ...(label ? { label } : {}), ...(a.srcMult ? { srcMult: a.srcMult } : {}), ...(a.dstMult ? { dstMult: a.dstMult } : {}), ...(a.srcRole ? { srcRole: a.srcRole } : {}), ...(a.dstRole ? { dstRole: a.dstRole } : {}), line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in classes (expected class, interface, enum, abstract class, package or a relation like A --|> B)`);
  }

  if (ctx.block === 'packages') {
    if (kw === 'package') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, 'package needs an id, e.g. package shop "Shop" {');
      const label = toks[2]?.k === 'str' ? toks[2].v : idTok.v;
      if (claim(idTok)) doc.packages.push({ id: idTok.v, label, ...(parentOf('package') ? { parent: parentOf('package')!.id } : {}), line: ln });
      if (opens) ctx.frames.push({ k: 'package', id: idTok.v });
      return;
    }
    const w = toks[1]?.k === 'word' ? toks[1].v : '';
    if (toks.length >= 3 && PKG_REL_WORDS[w]) {
      doc.pkgRels.push({ from: toks[0].v, to: toks[2].v, kind: PKG_REL_WORDS[w], ...(toks[3]?.k === 'str' && toks[3].v ? { label: toks[3].v } : {}), line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in packages (expected package, or a imports b / a access b / a merges b / a ..> b)`);
  }

  if (ctx.block === 'objects' || ctx.block === 'communication') {
    const comm = ctx.block === 'communication';
    // communication: `1.1 a -> b "text" async` is a numbered message on the link between a and b
    if (comm && /^\d+(\.\d+)*$/.test(first.v) && first.k === 'word' && toks.length >= 4 && toks[2].v === '->') {
      let i = 4;
      const text = toks[i]?.k === 'str' ? toks[i++].v : '';
      const a = attrsOf(toks, i, toks.length, err);
      for (const k of Object.keys(a)) if (k !== 'async') diag(ln, 1, `unknown message attribute "${k}"`, 'warning');
      doc.commMsgs.push({ seq: first.v, from: toks[1].v, to: toks[3].v, text, async: !!a.async, line: ln });
      return;
    }
    if (kw === 'object') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, 'object needs an id, e.g. object o1 "alice" class=User {');
      let i = 2;
      const label = toks[i]?.k === 'str' ? toks[i++].v : idTok.v;
      const a = attrsOf(toks, i, end, err);
      for (const k of Object.keys(a)) if (k !== 'class' && k !== 'model') diag(ln, 1, `unknown object attribute "${k}"`, 'warning');
      const obj: DslObject = { id: idTok.v, label, ...(a.class && a.class !== 'true' ? { className: a.class } : {}), ...(a.model && a.model !== 'true' ? { modelId: a.model } : {}), slots: [], line: ln };
      if (claim(idTok)) doc.objects.push(obj);
      if (opens) ctx.frames.push({ k: 'object', obj });
      return;
    }
    if (toks.length >= 3 && toks[1].k === 'word' && toks[1].v === '--') {
      let i = 3;
      let label: string | undefined;
      if (toks[i]?.k === 'str') label = toks[i++].v;
      const a = attrsOf(toks, i, toks.length, err);
      for (const k of Object.keys(a)) if (k !== 'srcRole' && k !== 'dstRole') diag(ln, 1, `unknown link attribute "${k}"`, 'warning');
      doc.objLinks.push({ from: toks[0].v, to: toks[2].v, ...(label ? { label } : {}), ...(a.srcRole ? { srcRole: a.srcRole } : {}), ...(a.dstRole ? { dstRole: a.dstRole } : {}), line: ln });
      return;
    }
    return err(first, comm ? `unknown statement "${first.v}" in communication (expected object, a link like a -- b, or a message like 1.1 a -> b "text" async)` : `unknown statement "${first.v}" in objects (expected object, or a link like a -- b "name")`);
  }

  if (ctx.block === 'states') {
    if (kw === 'region') {
      const st = parentOf('state');
      if (!st) return err(first, '"region" belongs inside a composite state');
      st.region++;
      return;
    }
    if (STATE_KINDS.has(kw)) {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} s1 "Name"`);
      let i = 2;
      let label = '';
      if (toks[i]?.k === 'str') label = toks[i++].v;
      else if (kw === 'state') label = idTok.v;
      const a = attrsOf(toks, i, end, err);
      const par = parentOf('state');
      if (opens && kw !== 'state') err(last, 'only a plain state can hold other states');
      if (claim(idTok)) doc.states.push({ id: idTok.v, label, kind: kw as StateKindText, composite: opens && kw === 'state', ...(par ? { parent: par.id } : {}), region: kw === 'entryPoint' || kw === 'exitPoint' ? 0 : par?.region ?? 0, ...(a.activity ? { activity: a.activity } : {}), vertical: !!a.vertical, line: ln });
      if (opens && kw === 'state') ctx.frames.push({ k: 'state', id: idTok.v, region: 0 });
      return;
    }
    if (toks.length >= 3 && toks[1].v === '->' && toks[1].k === 'word') {
      doc.transitions.push({ from: toks[0].v, to: toks[2].v, ...(toks[3]?.k === 'str' && toks[3].v ? { label: toks[3].v } : {}), line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in states (expected state, initial, final, choice, fork, join, history, deepHistory, entryPoint, exitPoint, region or a -> b "event")`);
  }

  if (ctx.block === 'usecases') {
    if (frame?.k === 'ucase') {
      if (kw === 'point' && toks[1] && toks[1].k !== 'sym') { frame.item.points.push(toks[1].v); return; }
      return err(first, 'expected: point "Extension point"');
    }
    if (kw === 'actor' || kw === 'usecase' || kw === 'boundary') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} x "Name"`);
      const label = toks[2]?.k === 'str' ? toks[2].v : idTok.v;
      if (opens && kw === 'actor') err(last, 'an actor has no body');
      const par = parentOf('boundary');
      const item: DslUcItem = { id: idTok.v, label, kind: kw, ...(par ? { parent: par.id } : {}), points: [], line: ln };
      if (kw === 'boundary' && par) err(first, 'boundaries cannot be nested');
      if (claim(idTok)) doc.ucItems.push(item);
      if (opens && kw === 'boundary') ctx.frames.push({ k: 'boundary', id: idTok.v });
      else if (opens && kw === 'usecase') ctx.frames.push({ k: 'ucase', item });
      return;
    }
    const w = toks[1]?.k === 'word' ? toks[1].v : '';
    if (toks.length >= 3 && (w === '--' || UC_REL_WORDS[w])) {
      let i = 3;
      let label: string | undefined;
      if (toks[i]?.k === 'str') label = toks[i++].v;
      const a = attrsOf(toks, i, toks.length, err);
      doc.ucRels.push({ from: toks[0].v, to: toks[2].v, kind: w === '--' ? 'association' : UC_REL_WORDS[w], ...(label ? { label } : {}), ...(a.srcMult ? { srcMult: a.srcMult } : {}), ...(a.dstMult ? { dstMult: a.dstMult } : {}), line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in usecases (expected actor, usecase, boundary, or a -- b / a include b / a extend b / a generalizes b)`);
  }

  if (ctx.block === 'activity') {
    if (kw === 'lane') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, 'lane needs an id, e.g. lane shop "Shop" {');
      if (!opens) return err(last, 'expected "{" after the lane');
      if (parentOf('lane')) err(first, 'lanes cannot be nested');
      let i = 2;
      const label = toks[i]?.k === 'str' ? toks[i++].v : idTok.v;
      const a = attrsOf(toks, i, end, err);
      for (const k of Object.keys(a)) if (k !== 'orient') diag(ln, 1, `unknown lane attribute "${k}"`, 'warning');
      if (a.orient && a.orient !== 'v' && a.orient !== 'h') diag(ln, 1, 'orient is v (columns) or h (rows)', 'warning');
      if (claim(idTok)) doc.actLanes.push({ id: idTok.v, label, orient: a.orient === 'h' ? 'h' : 'v', line: ln });
      ctx.frames.push({ k: 'lane', id: idTok.v });
      return;
    }
    if (ACT_KINDS.has(kw)) {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} x "Name"`);
      if (opens) err(last, 'an activity element has no body');
      let i = 2;
      const label = toks[i]?.k === 'str' ? toks[i++].v : ACT_PSEUDO.has(kw) ? '' : idTok.v;
      const a = attrsOf(toks, i, end, err);
      const par = parentOf('lane');
      if (claim(idTok)) doc.actNodes.push({ id: idTok.v, label, kind: kw as ActKindText, ...(par ? { lane: par.id } : {}), vertical: !!a.vertical && kw === 'fork', ...(a.state && kw === 'object' ? { state: a.state } : {}), line: ln });
      return;
    }
    const w = toks[1]?.k === 'word' ? toks[1].v : '';
    if (toks.length >= 3 && (w === '->' || w === '--')) {
      doc.actFlows.push({ from: toks[0].v, to: toks[2].v, ...(toks[3]?.k === 'str' && toks[3].v ? { label: toks[3].v } : {}), note: w === '--', line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in activity (expected lane, initial, final, flowFinal, action, decision, fork, object, send, accept, note, or a -> b "[guard]" / note -- a)`);
  }

  if (ctx.block === 'deployment') {
    if (DEP_KINDS.has(kw)) {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} x "Name"`);
      let i = 2;
      const label = toks[i]?.k === 'str' ? toks[i++].v : idTok.v;
      const a = attrsOf(toks, i, end, err);
      for (const k of Object.keys(a)) if (k !== 'stereotype' && k !== 'icon') diag(ln, 1, `unknown deployment attribute "${k}"`, 'warning');
      if (opens && !DEP_CONTAINERS.has(kw)) err(last, `only a node, device or executionEnvironment can hold other elements`);
      const par = parentOf('dep');
      if (claim(idTok)) doc.depNodes.push({ id: idTok.v, label, kind: kw as DepKindText, ...(a.stereotype ? { stereotype: a.stereotype } : {}), ...(a.icon ? { icon: a.icon } : {}), ...(par ? { parent: par.id } : {}), line: ln });
      if (opens) ctx.frames.push({ k: 'dep', id: idTok.v });
      return;
    }
    const w = toks[1]?.k === 'word' ? toks[1].v : '';
    if (toks.length >= 3 && DEP_LINK_WORDS[w]) {
      doc.depLinks.push({ from: toks[0].v, to: toks[2].v, kind: DEP_LINK_WORDS[w], ...(toks[3]?.k === 'str' && toks[3].v ? { label: toks[3].v } : {}), line: ln });
      return;
    }
    return err(first, `unknown statement "${first.v}" in deployment (expected node, device, executionEnvironment, artifact, component, or a -- b "protocol" / a ..> b / a manifests b)`);
  }

  // components
  if (frame?.k === 'comp' && (kw === 'provides' || kw === 'requires')) {
    const comp = doc.comps.find((c) => c.id === frame.id);
    if (!comp) return;
    const names = toks.slice(1).filter((t) => !(t.k === 'sym' && t.v === ',')).map((t) => t.v);
    if (!names.length) return err(first, `${kw} needs interface names, e.g. ${kw} IPayment`);
    (kw === 'provides' ? comp.provides : comp.requires).push(...names);
    return;
  }
  if (COMP_KINDS.has(kw)) {
    const idTok = toks[1];
    if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} api "API"`);
    let i = 2;
    const label = toks[i]?.k === 'str' ? toks[i++].v : idTok.v;
    const a = attrsOf(toks, i, end, err);
    const par = parentOf('comp');
    if (claim(idTok)) doc.comps.push({ id: idTok.v, label, kind: kw as 'component', ...(a.stereotype ? { stereotype: a.stereotype } : {}), ...(par ? { parent: par.id } : {}), provides: [], requires: [], ...(archRefOf(a) ? { archRef: archRefOf(a) } : {}), line: ln });
    if (opens) ctx.frames.push({ k: 'comp', id: idTok.v });
    return;
  }
  const w = toks[1]?.k === 'word' ? toks[1].v : '';
  if (toks.length >= 3 && (w === '..>' || w === '--')) {
    doc.compLinks.push({ from: toks[0].v, to: toks[2].v, kind: w === '--' ? 'assembly' : 'dependency', ...(toks[3]?.k === 'str' && toks[3].v ? { label: toks[3].v } : {}), line: ln });
    return;
  }
  err(first, `unknown statement "${first.v}" in components (expected component, node, artifact, provides, requires, or a ..> b / a -- b)`);
}

export function validateUml(doc: DslDoc, diag: Diag): void {
  const classNames = new Set(doc.classes.map((c) => c.name));
  doc.classRels = doc.classRels.filter((r) => {
    for (const end of [r.from, r.to]) if (!classNames.has(end)) { diag(r.line, 1, `unknown class "${end}"`); return false; }
    return true;
  });
  const check = <T extends { from: string; to: string; line: number }>(list: T[], known: Set<string>, what: string): T[] =>
    list.filter((r) => {
      for (const end of [r.from, r.to]) if (!known.has(end)) { diag(r.line, 1, `unknown ${what} "${end}"`); return false; }
      return true;
    });
  doc.transitions = check(doc.transitions, new Set(doc.states.map((s) => s.id)), 'state');
  doc.ucRels = check(doc.ucRels, new Set(doc.ucItems.filter((u) => u.kind !== 'boundary').map((u) => u.id)), 'actor or use case');
  doc.compLinks = check(doc.compLinks, new Set(doc.comps.map((c) => c.id)), 'component');
  doc.actFlows = check(doc.actFlows, new Set(doc.actNodes.map((n) => n.id)), 'activity element');
  doc.depLinks = check(doc.depLinks, new Set(doc.depNodes.map((n) => n.id)), 'deployment element');
  doc.pkgRels = check(doc.pkgRels, new Set(doc.packages.map((p) => p.id)), 'package');
  doc.objLinks = check(doc.objLinks, new Set(doc.objects.map((o) => o.id)), 'object');
  // a message needs the link between its two objects: declare it when the text does not
  doc.commMsgs = check(doc.commMsgs, new Set(doc.objects.map((o) => o.id)), 'object');
  for (const m of doc.commMsgs) {
    if (!doc.objLinks.some((l) => (l.from === m.from && l.to === m.to) || (l.from === m.to && l.to === m.from))) doc.objLinks.push({ from: m.from, to: m.to, line: m.line });
  }
}

export function describeFrame(ctx: UmlCtx): string {
  const f = ctx.frames[ctx.frames.length - 1];
  if (!f) return `${ctx.block} block`;
  return f.k === 'class' ? `class "${f.cls.name}"` : f.k === 'ucase' ? `usecase "${f.item.id}"` : f.k === 'object' ? `object "${f.obj.id}"` : `${f.k} "${'id' in f ? f.id : ''}"`;
}
