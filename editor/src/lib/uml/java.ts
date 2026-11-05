import { addRelation, baseName, emptyModel, ensureClass, newClassDef, type MemberDef, type UmlClassDef, type UmlParseResult } from './model';
import { splitTop } from './member';
import type { ClassKind, Visibility } from './types';

/** Blank out comments and string / char literals (keeping length and newlines) so brace matching and regexes are safe. */
export function stripJava(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && n === '*') { i += 2; out += '  '; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } i += 2; out += '  '; }
    else if (c === '"' || c === "'") {
      const q = c;
      out += q; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { out += ' '; i++; } out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += q; i++;
    } else { out += c; i++; }
  }
  return out;
}

const MODS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'native', 'synchronized', 'transient', 'volatile', 'strictfp', 'default', 'sealed', 'non-sealed']);
const COLLECTIONS = new Set(['List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'TreeSet', 'LinkedHashSet', 'Collection', 'Iterable', 'Queue', 'Deque', 'Stack', 'Vector', 'Optional_', 'Stream']);
const MAPS = new Set(['Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'ConcurrentHashMap']);

/** drop annotations: `@Inject`, `@Override`, `@Foo(a = "b")` */
function dropAnnotations(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '@' || s.slice(i, i + 10) === '@interface') { out += s[i]; continue; }
    i++;
    while (i < s.length && /[\w.]/.test(s[i])) i++;
    while (s[i] === ' ' || s[i] === '\n') i++;
    if (s[i] === '(') { let d = 0; while (i < s.length) { if (s[i] === '(') d++; else if (s[i] === ')' && --d === 0) break; i++; } } else i--;
  }
  return out;
}

function splitDecl(head: string): { mods: string[]; rest: string } {
  const words = head.trim().split(/\s+/);
  const mods: string[] = [];
  let i = 0;
  while (i < words.length && MODS.has(words[i])) mods.push(words[i++]);
  return { mods, rest: words.slice(i).join(' ') };
}

function vis(mods: string[], inInterface: boolean): Visibility {
  if (mods.includes('private')) return '-';
  if (mods.includes('protected')) return '#';
  if (mods.includes('public') || inInterface) return '+';
  return '~';
}

/** `Map<String, List<Integer>> options` / `final T value` / `String... rest` */
function parseParam(p: string): { name: string; type?: string } {
  const t = p.replace(/\bfinal\b/g, '').trim();
  let depth = 0;
  let cut = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === '>') depth++; else if (t[i] === '<') depth--;
    else if (/\s/.test(t[i]) && depth === 0) { cut = i; break; }
  }
  if (cut < 0) return { name: t };
  return { name: t.slice(cut + 1).trim(), type: t.slice(0, cut).trim().replace(/\s+\.\.\./, '...') };
}

function matching(s: string, open: number, o = '{', c = '}'): number {
  let d = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === o) d++; else if (s[i] === c && --d === 0) return i; }
  return s.length;
}

/** top-level member chunks of a class body: text up to `;` or through a `{...}` block */
function chunks(body: string): { head: string; block?: string }[] {
  const out: { head: string; block?: string }[] = [];
  let cur = '';
  let paren = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') paren++; else if (ch === ')') paren--;
    if (ch === '{' && paren === 0) {
      const end = matching(body, i);
      // array / lambda initialiser inside a field: `= { ... }` or `= new X[] {..}` belongs to the field
      if (/=\s*(new\s+[\w<>\[\], ]+)?\s*$/.test(cur)) { cur += body.slice(i, end + 1); i = end; continue; }
      out.push({ head: cur.trim(), block: body.slice(i + 1, end) });
      cur = '';
      i = end;
      continue;
    }
    if (ch === ';' && paren === 0) { out.push({ head: cur.trim() }); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push({ head: cur.trim() });
  return out.filter((c) => c.head);
}

export function parseJava(source: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const src = dropAnnotations(stripJava(source));
  const pkg = /\bpackage\s+([\w.]+)\s*;/.exec(src)?.[1];
  const pending: { owner: string; role: string; type: string }[] = [];
  const declared = new Set<string>();

  const DECL = /\b(class|interface|enum|record|@interface)\s+(\w+)\s*(<[^{(]*?>)?\s*(\([^)]*\))?\s*(?:extends\s+([^{]+?))?\s*(?:implements\s+([^{]+?))?\s*(?:permits\s+[^{]+?)?\{/g;

  const parseBody = (c: UmlClassDef, body: string, kind: ClassKind, isRecord?: string) => {
    const inInterface = kind === 'interface';
    const items = chunks(body);
    let first = true;
    for (const it of items) {
      let head = it.head.trim();
      // enum constants: everything before the first top-level `;` is the constant list
      if (kind === 'enum' && first) {
        first = false;
        const m = /^[\s\S]*?(?=;|$)/.exec(head);
        // when constants were part of the first chunk (they precede the first `;`), split them out
        const constants = splitTop(m ? m[0] : head);
        if (constants.every((x) => /^\w+(\s*\([\s\S]*\))?$/.test(x.trim())) && !it.block) {
          for (const k of constants) c.attributes.push({ visibility: '', name: k.trim().replace(/\s*\(.*$/s, '') });
          continue;
        }
      }
      first = false;
      // nested type declarations are handled by the global scan
      if (/\b(class|interface|enum|record)\s+\w+/.test(head) && it.block !== undefined && !/\(/.test(head.split(/\b(class|interface|enum|record)\b/)[0])) continue;
      const { mods, rest } = splitDecl(head);
      head = rest;
      const open = head.indexOf('(');
      if (open >= 0 && !/=/.test(head.slice(0, open))) {
        // method or constructor
        const before = head.slice(0, open).trim();
        let sig = before;
        const gen = /^<[^]*?>\s+/.exec(sig);
        if (gen) sig = sig.slice(gen[0].length);
        const words = (() => {
          let depth = 0, cut = -1;
          for (let i = sig.length - 1; i >= 0; i--) { if (sig[i] === '>') depth++; else if (sig[i] === '<') depth--; else if (/\s/.test(sig[i]) && depth === 0) { cut = i; break; } }
          return cut < 0 ? [sig] : [sig.slice(0, cut).trim(), sig.slice(cut + 1).trim()];
        })();
        const name = words[words.length - 1];
        const ret = words.length > 1 ? words[0] : undefined;
        const close = matching(head, open, '(', ')');
        const ps = splitTop(head.slice(open + 1, close)).map(parseParam);
        const isCtor = !ret;
        const m: MemberDef = {
          visibility: vis(mods, inInterface),
          name,
          params: ps,
          ...(ret ? { type: ret } : {}),
          ...(mods.includes('static') ? { static: true } : {}),
          ...(mods.includes('abstract') || (inInterface && it.block === undefined && !mods.includes('static') && !mods.includes('default')) ? { abstract: true } : {}),
        };
        if (isCtor && name !== c.name) continue;
        c.operations.push(m);
        continue;
      }
      // field(s): `Type name [= init], other [= init]`
      const eq = head.indexOf('=');
      const lhs = (eq >= 0 ? head.slice(0, eq) : head).trim();
      const init = eq >= 0 ? head.slice(eq + 1).trim() : undefined;
      const p = parseParam(lhs);
      if (!p.type || !p.name || /\s/.test(p.name)) continue;
      const def: MemberDef = {
        visibility: inInterface ? '+' : vis(mods, false), name: p.name, type: p.type,
        ...(mods.includes('static') || inInterface ? { static: true } : {}),
        ...(init && !inInterface ? { default: init.replace(/\s+/g, ' ') } : {}),
      };
      c.attributes.push(def);
      pending.push({ owner: c.name, role: p.name, type: p.type });
    }
    if (isRecord) for (const p of splitTop(isRecord.slice(1, -1)).map(parseParam)) { if (p.type) { c.attributes.push({ visibility: '-', name: p.name, type: p.type }); pending.push({ owner: c.name, role: p.name, type: p.type }); } }
  };

  let m: RegExpExecArray | null;
  while ((m = DECL.exec(src))) {
    const [, kw, name, gen, recordComps, ext, impl] = m;
    // modifiers in front of the keyword
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const preWords = src.slice(Math.max(0, src.lastIndexOf(';', m.index) + 1, src.lastIndexOf('}', m.index) + 1, src.lastIndexOf('{', m.index) + 1, lineStart), m.index).trim();
    const pre = preWords.split(/\s+/);
    const kind: ClassKind = kw === 'interface' || kw === '@interface' ? 'interface' : kw === 'enum' ? 'enum' : pre.includes('abstract') ? 'abstract' : 'class';
    const c = (() => { const e = model.classes.find((x) => x.name === name); if (e) { delete e.external; return e; } const n = newClassDef(name); model.classes.push(n); return n; })();
    c.kind = kind;
    if (gen) c.generics = gen.slice(1, -1).trim();
    if (pkg) c.package = pkg;
    declared.add(name);
    const open = m.index + m[0].length - 1;
    const close = matching(src, open);
    const body = src.slice(open + 1, close);
    // methods / fields only from this body's own level (nested types are found by the outer regex scan)
    parseBody(c, stripNested(body), kind, kw === 'record' ? recordComps : undefined);
    const link = (list: string | undefined, rkind: 'inheritance' | 'realization') => {
      for (const t of splitTop(list ?? '')) {
        const to = baseName(t.trim());
        if (!to) continue;
        if (!model.classes.some((x) => x.name === to)) ensureClass(model, to, { external: true });
        addRelation(model, { from: name, to, kind: rkind });
      }
    };
    if (kind === 'interface') link(ext, 'inheritance'); else { link(ext, 'inheritance'); link(impl, 'realization'); }
    if (kind === 'interface' && impl) link(impl, 'inheritance');
    DECL.lastIndex = open + 1;
  }

  // associations: field types that name another declared class
  const refs = (t: string, mult: string): { name: string; mult: string }[] => {
    const g = /^([\w.]+)\s*<(.*)>$/.exec(t.trim());
    const arr = /^(.*)\[\]$/.exec(t.trim());
    if (arr) return refs(arr[1], '0..*');
    if (g) {
      const n = baseName(g[1]);
      const args = splitTop(g[2]);
      if (COLLECTIONS.has(n)) return args.flatMap((a) => refs(a, '0..*'));
      if (MAPS.has(n)) return args.length ? refs(args[args.length - 1], '0..*') : [];
      if (n === 'Optional') return args.flatMap((a) => refs(a, '0..1'));
      return declared.has(n) ? [{ name: n, mult }] : [];
    }
    const n = baseName(t);
    return declared.has(n) ? [{ name: n, mult }] : [];
  };
  for (const p of pending) for (const r of refs(p.type, '1')) addRelation(model, { from: p.owner, to: r.name, kind: 'association', directed: true, toMult: r.mult, toRole: p.role });
  return { model, warnings };
}

/** body text with nested type bodies removed, so a nested class's members are not read as the outer class's */
function stripNested(body: string): string {
  let out = '';
  const re = /\b(class|interface|enum|record)\s+\w+[^{;]*\{/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const open = m.index + m[0].length - 1;
    const close = matching(body, open);
    // include modifiers before the keyword in what we remove
    const from = Math.max(last, body.lastIndexOf(';', m.index) + 1, body.lastIndexOf('}', m.index) + 1, body.lastIndexOf('{', m.index) + 1);
    out += body.slice(last, from);
    last = close + 1;
    re.lastIndex = close + 1;
  }
  return out + body.slice(last);
}
