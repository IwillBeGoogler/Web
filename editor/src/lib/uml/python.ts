import { addRelation, baseName, emptyModel, ensureClass, newClassDef, type MemberDef, type UmlClassDef, type UmlParseResult } from './model';
import { splitTop } from './member';
import type { Visibility } from './types';

interface Line { indent: number; text: string }

/** Logical lines: comments and docstrings removed, bracketed continuations joined. */
function logicalLines(src: string): Line[] {
  const lines: Line[] = [];
  const raw = src.replace(/\r\n?/g, '\n').split('\n');
  let triple: string | null = null;
  let buf = '';
  let bufIndent = 0;
  let depth = 0;
  for (const original of raw) {
    let line = original;
    if (triple) {
      const end = line.indexOf(triple);
      if (end < 0) continue;
      line = line.slice(end + 3);
      triple = null;
      if (!line.trim()) continue;
    }
    // strip strings (keep quotes) and comments
    let out = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '#') break;
      if (c === '"' || c === "'") {
        const t3 = line.slice(i, i + 3);
        if (t3 === '"""' || t3 === "'''") {
          const end = line.indexOf(t3, i + 3);
          if (end < 0) { triple = t3; break; }
          out += '""';
          i = end + 2;
          continue;
        }
        let j = i + 1;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        out += line.slice(i, j + 1);
        i = j;
        continue;
      }
      out += c;
    }
    if (!out.trim() && !buf) continue;
    const indent = buf ? bufIndent : /^\s*/.exec(out)![0].replace(/\t/g, '    ').length;
    const text = out.trim();
    if (!buf) { bufIndent = indent; }
    buf = buf ? `${buf} ${text}` : text;
    for (const ch of text) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; }
    if (depth <= 0 && !buf.endsWith('\\')) { lines.push({ indent: bufIndent, text: buf }); buf = ''; depth = 0; }
    else if (buf.endsWith('\\')) buf = buf.slice(0, -1).trim();
  }
  if (buf) lines.push({ indent: bufIndent, text: buf });
  return lines;
}

const COLLECTIONS = new Set(['list', 'List', 'set', 'Set', 'frozenset', 'FrozenSet', 'Sequence', 'Iterable', 'Collection', 'tuple', 'Tuple', 'deque', 'Deque']);
const MAPPINGS = new Set(['dict', 'Dict', 'Mapping', 'DefaultDict', 'OrderedDict']);

const stripQuotes = (s: string) => s.trim().replace(/^["']|["']$/g, '');
const visOf = (n: string): { name: string; visibility: Visibility } =>
  /^__.*__$/.test(n) ? { name: n, visibility: '+' } : n.startsWith('__') ? { name: n.slice(2), visibility: '-' } : n.startsWith('_') ? { name: n.replace(/^_+/, ''), visibility: '#' } : { name: n, visibility: '+' };

function parseParams(s: string) {
  return splitTop(s)
    .map((p) => p.trim())
    .filter((p) => p && p !== '/' && p !== '*')
    .map((p) => {
      const noDefault = (() => { let d = 0; for (let i = 0; i < p.length; i++) { if ('[({'.includes(p[i])) d++; else if ('])}'.includes(p[i])) d--; else if (p[i] === '=' && d === 0) return p.slice(0, i); } return p; })().trim();
      const c = noDefault.indexOf(':');
      return c < 0 ? { name: noDefault } : { name: noDefault.slice(0, c).trim(), type: stripQuotes(noDefault.slice(c + 1)) };
    })
    .filter((p) => p.name !== 'self' && p.name !== 'cls');
}

export function parsePython(source: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const lines = logicalLines(source);
  const declared = new Set<string>();
  const pending: { owner: string; role: string; type: string }[] = [];

  const addAttr = (c: UmlClassDef, rawName: string, type: string | undefined, def: string | undefined, extra: Partial<MemberDef> = {}) => {
    const { name, visibility } = visOf(rawName);
    if (c.attributes.some((a) => a.name === name)) return;
    c.attributes.push({ visibility, name, ...(type ? { type } : {}), ...(def ? { default: def } : {}), ...extra });
    if (type) pending.push({ owner: c.name, role: name, type });
  };

  const parseClass = (idx: number): number => {
    const head = lines[idx];
    const m = /^class\s+(\w+)\s*(?:\((.*)\))?\s*:\s*(.*)$/.exec(head.text);
    if (!m) return idx + 1;
    const name = m[1];
    const existing = model.classes.find((x) => x.name === name);
    const c: UmlClassDef = existing ?? newClassDef(name);
    if (!existing) model.classes.push(c);
    delete c.external;
    declared.add(name);
    const bases = splitTop(m[2] ?? '').map((b) => b.trim()).filter((b) => b && !b.includes('='));
    let isEnum = false;
    const generics: string[] = [];
    const heritage: string[] = [];
    for (const b of bases) {
      const bn = baseName(b.replace(/\[.*$/, ''));
      if (bn === 'ABC' || bn === 'ABCMeta') c.kind = 'abstract';
      else if (bn === 'Protocol') { c.kind = 'interface'; const g = /\[(.*)\]/.exec(b); if (g) generics.push(g[1]); }
      else if (bn === 'Generic') { const g = /\[(.*)\]/.exec(b); if (g) generics.push(g[1]); }
      else if (/^(Enum|IntEnum|StrEnum|Flag|IntFlag)$/.test(bn)) isEnum = true;
      else if (bn !== 'object' && bn !== 'NamedTuple' && bn !== 'TypedDict') heritage.push(bn);
    }
    if (isEnum) c.kind = 'enum';
    if (generics.length) c.generics = generics.join(', ');
    // decorators in front of the class are in `lines[idx-1]` ... only @dataclass matters and needs no special handling
    let i = idx + 1;
    // one-line bodies: `class A: ...`
    if (m[3] && m[3] !== '...' && m[3] !== 'pass') { /* ignore inline body */ }
    const bodyIndent = lines[i]?.indent ?? head.indent + 4;
    const hasBody = i < lines.length && lines[i].indent > head.indent;
    let decorators: string[] = [];
    while (hasBody && i < lines.length && lines[i].indent > head.indent) {
      const ln = lines[i];
      if (ln.indent > bodyIndent) { i++; continue; }
      if (ln.text.startsWith('@')) { decorators.push(ln.text.slice(1).replace(/\(.*$/, '').trim()); i++; continue; }
      const cm = /^class\s+\w+/.exec(ln.text);
      if (cm) { i = parseClass(i); decorators = []; continue; }
      const dm = /^(?:async\s+)?def\s+(\w+)\s*\((.*)\)\s*(?:->\s*(.+?))?\s*:\s*(.*)$/.exec(ln.text);
      if (dm) {
        const [, fname, rawParams, ret] = dm;
        const isProp = decorators.some((d) => d === 'property' || d.endsWith('.getter') || d === 'cached_property');
        const isSetter = decorators.some((d) => d.endsWith('.setter') || d.endsWith('.deleter'));
        const type = ret ? stripQuotes(ret) : undefined;
        // body of the method
        let j = i + 1;
        const bodyStart = j;
        while (j < lines.length && lines[j].indent > ln.indent) j++;
        if (isProp) addAttr(c, fname, type, undefined);
        else if (!isSetter) {
          const { name, visibility } = visOf(fname);
          c.operations.push({
            visibility, name, params: parseParams(rawParams),
            ...(type ? { type } : {}),
            ...(decorators.some((d) => d === 'staticmethod' || d === 'classmethod') ? { static: true } : {}),
            ...(decorators.some((d) => d === 'abstractmethod' || d.endsWith('.abstractmethod')) ? { abstract: true } : {}),
          });
        }
        for (let k = bodyStart; k < j; k++) if (/^class\s+\w+/.test(lines[k].text)) parseClass(k);
        if (fname === '__init__') {
          const paramTypes = new Map(parseParams(rawParams).map((p) => [p.name, p.type]));
          for (let k = bodyStart; k < j; k++) {
            const am = /^self\.(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/.exec(lines[k].text);
            if (!am) continue;
            const rhs = am[3]?.trim();
            const type2 = am[2] ? stripQuotes(am[2]) : rhs && paramTypes.get(rhs) ? paramTypes.get(rhs) : undefined;
            addAttr(c, am[1], type2, undefined);
          }
        }
        i = j;
        decorators = [];
        continue;
      }
      const ann = /^(\w+)\s*:\s*([^=]+?)\s*(?:=\s*(.+))?$/.exec(ln.text);
      if (ann && !/^(if|for|while|with|try|else|elif|except|finally|return|print)\b/.test(ln.text)) {
        if (!isEnum) addAttr(c, ann[1], stripQuotes(ann[2]), ann[3]?.trim());
        i++; decorators = []; continue;
      }
      const asg = /^(\w+)\s*=\s*(.+)$/.exec(ln.text);
      if (asg) {
        if (isEnum) { if (!c.attributes.some((a) => a.name === asg[1])) c.attributes.push({ visibility: '', name: asg[1] }); }
        else addAttr(c, asg[1], undefined, asg[2].trim(), { static: true });
      }
      i++; decorators = [];
    }
    for (const h of heritage) {
      if (!model.classes.some((x) => x.name === h)) ensureClass(model, h, { external: true });
      addRelation(model, { from: name, to: h, kind: 'inheritance' });
    }
    return i;
  };

  let decorators = 0;
  for (let i = 0; i < lines.length; ) {
    const ln = lines[i];
    if (ln.text.startsWith('@')) { decorators++; i++; continue; }
    if (/^class\s+\w+/.test(ln.text)) { i = parseClass(i); continue; }
    // nested `def` bodies may declare classes too; scan on
    i++;
  }
  void decorators;

  // bases that are Protocols are realizations
  for (const r of model.relations) if (r.kind === 'inheritance' && model.classes.find((c) => c.name === r.to)?.kind === 'interface') r.kind = 'realization';

  const refs = (t: string, mult: string): { name: string; mult: string }[] => {
    let s = stripQuotes(t).trim();
    const union = splitTop(s.replace(/\|/g, ','));
    if (s.includes('|') && !s.includes('[')) {
      const parts = union.map((x) => x.trim());
      const optional = parts.includes('None');
      return parts.filter((x) => x !== 'None').flatMap((x) => refs(x, optional && mult === '1' ? '0..1' : mult));
    }
    const g = /^([\w.]+)\[(.*)\]$/s.exec(s);
    if (g) {
      const n = baseName(g[1]);
      const args = splitTop(g[2]);
      if (n === 'Optional') return args.flatMap((a) => refs(a, '0..1'));
      if (n === 'Union') { const optional = args.some((a) => a.trim() === 'None'); return args.filter((a) => a.trim() !== 'None').flatMap((a) => refs(a, optional ? '0..1' : mult)); }
      if (COLLECTIONS.has(n)) return args.flatMap((a) => refs(a, '0..*'));
      if (MAPPINGS.has(n)) return args.length ? refs(args[args.length - 1], '0..*') : [];
      return declared.has(n) ? [{ name: n, mult }] : [];
    }
    s = baseName(s);
    return declared.has(s) ? [{ name: s, mult }] : [];
  };
  for (const p of pending) for (const r of refs(p.type, '1')) addRelation(model, { from: p.owner, to: r.name, kind: 'association', directed: true, toMult: r.mult, toRole: p.role });
  return { model, warnings };
}
