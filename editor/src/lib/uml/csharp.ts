import { chunks, matching, splitTypeName, stripCLike, stripNested } from './clike';
import { splitTop } from './member';
import { addRelation, baseName, emptyModel, ensureClass, newClassDef, type MemberDef, type UmlClassDef, type UmlParseResult } from './model';
import type { ClassKind, Visibility } from './types';

const MODS = new Set(['public', 'private', 'protected', 'internal', 'static', 'abstract', 'virtual', 'override', 'sealed', 'readonly', 'const', 'async', 'partial', 'new', 'extern', 'unsafe', 'volatile', 'required', 'file']);
const COLLECTIONS = new Set(['List', 'IList', 'IEnumerable', 'ICollection', 'IReadOnlyList', 'IReadOnlyCollection', 'HashSet', 'ISet', 'Queue', 'Stack', 'Collection', 'ObservableCollection', 'ImmutableList', 'ReadOnlyCollection', 'LinkedList', 'SortedSet', 'IAsyncEnumerable', 'ImmutableArray', 'Span', 'Memory']);
const MAPS = new Set(['Dictionary', 'IDictionary', 'IReadOnlyDictionary', 'SortedDictionary', 'ConcurrentDictionary', 'ImmutableDictionary']);
const NESTED = /\b(?:class|interface|struct|record|enum)\s+\w+[^{;]*\{/;

/** drop `[Attribute(...)]` groups that precede a declaration (not array types) */
function dropAttributes(s: string): string {
  let prev = '';
  let cur = s;
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(/(^|[;{}\n])(\s*)\[[^\[\]]*\]/g, '$1$2');
  }
  return cur;
}

function splitMods(head: string): { mods: string[]; rest: string } {
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
  if (mods.includes('internal')) return '~';
  return '-';
}
function param(p: string): { name: string; type?: string } {
  const t = p.replace(/\[[^\]]*\](?=\s)/g, '').replace(/^\s*(this|ref|out|in|params|scoped)\s+/g, '').replace(/\s*=[\s\S]*$/, '').trim();
  return splitTypeName(t);
}

export function parseCSharp(source: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const src = dropAttributes(stripCLike(source));
  const ns = /\bnamespace\s+([\w.]+)/.exec(src)?.[1];
  const declared = new Set<string>();
  const pending: { owner: string; role: string; type: string }[] = [];
  const bases: { owner: string; kind: ClassKind; list: string[] }[] = [];

  const parseBody = (c: UmlClassDef, body: string, kind: ClassKind) => {
    const inInterface = kind === 'interface';
    if (kind === 'enum') {
      for (const part of splitTop(body)) {
        const name = part.replace(/=[\s\S]*$/, '').trim();
        if (/^\w+$/.test(name)) c.attributes.push({ visibility: '', name });
      }
      return;
    }
    let lastProp: MemberDef | undefined;
    for (const it of chunks(body, /(=\s*(new\b[^;{]*)?|=>\s*)$/)) {
      let head = it.head.trim();
      if (head.startsWith('=') && !head.startsWith('=>')) { if (lastProp && !lastProp.default) lastProp.default = head.slice(1).trim().replace(/\s+/g, ' '); lastProp = undefined; continue; }
      lastProp = undefined;
      if (/^(using|namespace|delegate|event)\b/.test(head) || /\boperator\b|\bthis\s*\[/.test(head)) continue;
      if (NESTED.test(`${head} {`) && /^(\w+\s+)*(class|interface|struct|record|enum)\s/.test(head)) continue;
      const { mods, rest } = splitMods(head);
      head = rest;
      if (!head) continue;
      const open = head.indexOf('(');
      const arrow = head.indexOf('=>');
      const eq = head.indexOf('=');
      const firstAssign = [arrow, eq].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), Infinity);
      if (open >= 0 && open < firstAssign) {
        const before = head.slice(0, open).trim();
        const m = /^(.*?)([\w.]+)\s*(<[^()]*>)?\s*$/.exec(before);
        if (!m) continue;
        const name = m[2].replace(/^.*\./, '');
        const ret = m[1].trim();
        if (!ret && name !== c.name) continue;
        const close = matching(head, open, '(', ')');
        const ps = splitTop(head.slice(open + 1, close)).map(param);
        c.operations.push({
          visibility: vis(mods, inInterface),
          name,
          params: ps,
          ...(ret ? { type: ret } : {}),
          ...(mods.includes('static') ? { static: true } : {}),
          ...(mods.includes('abstract') || (inInterface && it.block === undefined && !mods.includes('static')) ? { abstract: true } : {}),
        });
        continue;
      }
      // property or field
      const lhs = (firstAssign === Infinity ? head : head.slice(0, firstAssign)).trim();
      const p = splitTypeName(lhs);
      if (!p.type || !/^\w+$/.test(p.name)) continue;
      const init = eq >= 0 && (arrow < 0 || eq < arrow) ? head.slice(eq + 1).trim() : undefined;
      const def: MemberDef = {
        visibility: vis(mods, inInterface), name: p.name, type: p.type,
        ...(mods.includes('static') || mods.includes('const') ? { static: true } : {}),
        ...(init ? { default: init.replace(/\s+/g, ' ') } : {}),
      };
      c.attributes.push(def);
      pending.push({ owner: c.name, role: p.name, type: p.type });
      lastProp = def;
    }
  };

  const DECL = /\b(class|interface|struct|record(?:\s+(?:class|struct))?|enum)\s+(\w+)\s*(<[^{(;:]*?>)?\s*(\([^)]*\))?\s*(?::\s*([^{;]+?))?\s*(\{|;)/g;
  let m: RegExpExecArray | null;
  while ((m = DECL.exec(src))) {
    const [, kw, name, gen, recordParams, baseList, term] = m;
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const from = Math.max(src.lastIndexOf(';', m.index) + 1, src.lastIndexOf('}', m.index) + 1, src.lastIndexOf('{', m.index) + 1, lineStart);
    const pre = src.slice(from, m.index).trim().split(/\s+/);
    const isRecord = kw.startsWith('record');
    const isStruct = kw === 'struct' || /struct$/.test(kw);
    const kind: ClassKind = kw === 'interface' ? 'interface' : kw === 'enum' ? 'enum' : pre.includes('abstract') ? 'abstract' : 'class';
    const existing = model.classes.find((x) => x.name === name);
    const c = existing ?? (() => { const n = newClassDef(name); model.classes.push(n); return n; })();
    delete c.external;
    c.kind = kind;
    if (isRecord) c.stereotype = 'record'; else if (isStruct) c.stereotype = 'struct';
    if (gen) c.generics = gen.slice(1, -1).trim();
    if (ns) c.package = ns;
    declared.add(name);
    if (isRecord && recordParams) {
      for (const p of splitTop(recordParams.slice(1, -1)).map(param)) if (p.type) { c.attributes.push({ visibility: '+', name: p.name, type: p.type }); pending.push({ owner: name, role: p.name, type: p.type }); }
    }
    if (baseList && kind !== 'enum') bases.push({ owner: name, kind, list: splitTop(baseList.replace(/\bwhere\b[\s\S]*$/, '')).map((b) => b.trim()).filter(Boolean) });
    if (term === '{') {
      const open = m.index + m[0].length - 1;
      const close = matching(src, open);
      parseBody(c, stripNested(src.slice(open + 1, close), NESTED), kind);
      DECL.lastIndex = open + 1;
    }
  }
  // base lists: a class extends one class and implements interfaces; an interface only extends
  const kindOf = (n: string): ClassKind | undefined => model.classes.find((x) => x.name === n && !x.external)?.kind;
  for (const b of bases) {
    for (const raw of b.list) {
      const to = baseName(raw);
      if (!to) continue;
      if (!model.classes.some((x) => x.name === to)) ensureClass(model, to, { external: true });
      const isIface = kindOf(to) === 'interface' || (kindOf(to) === undefined && /^I[A-Z]/.test(to));
      addRelation(model, { from: b.owner, to, kind: b.kind === 'interface' ? 'inheritance' : isIface ? 'realization' : 'inheritance' });
    }
  }
  // associations from member types that name another declared type
  const refs = (t: string, mult: string): { name: string; mult: string }[] => {
    let s = t.trim();
    if (s.endsWith('?')) { s = s.slice(0, -1); mult = mult === '1' ? '0..1' : mult; }
    const arr = /^(.*)\[[,\s]*\]$/.exec(s);
    if (arr) return refs(arr[1], '0..*');
    const g = /^([\w.]+)\s*<(.*)>$/.exec(s);
    if (g) {
      const n = baseName(g[1]);
      const args = splitTop(g[2]);
      if (COLLECTIONS.has(n)) return args.flatMap((a) => refs(a, '0..*'));
      if (MAPS.has(n)) return args.length ? refs(args[args.length - 1], '0..*') : [];
      if (n === 'Nullable' || n === 'Lazy') return args.flatMap((a) => refs(a, mult === '1' ? '0..1' : mult));
      return declared.has(n) ? [{ name: n, mult }] : [];
    }
    const n = baseName(s);
    return declared.has(n) ? [{ name: n, mult }] : [];
  };
  for (const p of pending) for (const r of refs(p.type, '1')) if (r.name !== p.owner) addRelation(model, { from: p.owner, to: r.name, kind: 'association', directed: true, toMult: r.mult, toRole: p.role });
  return { model, warnings };
}
