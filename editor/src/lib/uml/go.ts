import { matching, stripCLike } from './clike';
import { splitTop } from './member';
import { addRelation, baseName, emptyModel, ensureClass, type MemberDef, type UmlClassDef, type UmlParseResult } from './model';

const exported = (name: string) => /^[A-Z]/.test(name);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** split a body into top-level lines (newline or `;`), keeping braces / brackets / parens balanced */
function lines(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of body) {
    if ('{(['.includes(ch)) depth++;
    else if ('})]'.includes(ch)) depth--;
    if ((ch === '\n' || ch === ';') && depth <= 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Go parameter list: `a, b int, c ...string` or just types */
function parseParams(text: string): { name: string; type?: string }[] {
  const items = splitTop(text).map((s) => s.trim()).filter(Boolean);
  const named = items.some((x) => /^\w+\s+\S/.test(x));
  if (!named) return items.map((t) => ({ name: t }));
  const out: { name: string; type?: string }[] = [];
  let pendingNames: string[] = [];
  for (const it of items) {
    const m = /^(\w+)\s+(\S[\s\S]*)$/.exec(it);
    if (m) {
      for (const n of pendingNames) out.push({ name: n, type: norm(m[2]) });
      pendingNames = [];
      out.push({ name: m[1], type: norm(m[2]) });
    } else pendingNames.push(it);
  }
  for (const n of pendingNames) out.push({ name: n });
  return out;
}

/** classes referenced by a field type, with multiplicity: `[]*T` -> T 0..*, `*T` -> 0..1, `map[K]V` -> V 0..* */
function refs(t: string, mult = '1'): { name: string; mult: string }[] {
  const s = t.trim();
  if (s.startsWith('*')) return refs(s.slice(1), mult === '1' ? '0..1' : mult);
  let m = /^\[[^\]]*\](.*)$/.exec(s);
  if (m) return refs(m[1], '0..*');
  m = /^map\[[^\]]*\](.*)$/.exec(s);
  if (m) return refs(m[1], '0..*');
  if (/^(chan|func|interface|struct)\b/.test(s)) return [];
  const n = baseName(s.replace(/\[.*$/s, ''));
  return /^[A-Za-z_]\w*$/.test(n) ? [{ name: n, mult }] : [];
}

export function parseGo(source: string): UmlParseResult {
  const model = emptyModel();
  const warnings: string[] = [];
  const src = stripCLike(source, { backtick: true });
  const pkg = /^\s*package\s+(\w+)/m.exec(src)?.[1];
  const declared = new Set<string>();
  const pending: { owner: string; role: string; type: string }[] = [];
  const named = new Map<string, UmlClassDef>();

  const make = (name: string): UmlClassDef => {
    const c = ensureClass(model, name);
    delete c.external;
    if (pkg) c.package = pkg;
    declared.add(name);
    return c;
  };
  const link = (from: string, embedded: string) => {
    const to = baseName(embedded.replace(/^\*/, '').replace(/\[.*$/s, ''));
    if (!to || to === from) return;
    if (!model.classes.some((x) => x.name === to)) ensureClass(model, to, { external: true });
    addRelation(model, { from, to, kind: 'inheritance', label: 'embeds' });
  };

  const structBody = (c: UmlClassDef, body: string) => {
    for (const line of lines(body)) {
      if (/[{}]/.test(line)) continue; // anonymous struct / func literal types
      if (/^\*?[\w.]+(\[[^\]]*\])?$/.test(line)) { link(c.name, line); continue; }
      const m = /^(\w+(?:\s*,\s*\w+)*)\s+(\S[\s\S]*)$/.exec(line);
      if (!m) continue;
      const type = norm(m[2].replace(/`[^`]*`/g, ''));
      for (const name of m[1].split(',').map((x) => x.trim())) {
        c.attributes.push({ visibility: exported(name) ? '+' : '-', name, type });
        pending.push({ owner: c.name, role: name, type });
      }
    }
  };
  const interfaceBody = (c: UmlClassDef, body: string) => {
    for (const line of lines(body)) {
      if (/[|~]/.test(line)) continue; // type constraints
      if (/^[\w.]+(\[[^\]]*\])?$/.test(line)) { link(c.name, line); continue; }
      const open = line.indexOf('(');
      if (open <= 0) continue;
      const name = line.slice(0, open).trim();
      if (!/^\w+$/.test(name)) continue;
      const close = matching(line, open, '(', ')');
      const rest = line.slice(close + 1).trim();
      c.operations.push({ visibility: exported(name) ? '+' : '-', name, params: parseParams(line.slice(open + 1, close)), ...(rest ? { type: norm(rest) } : {}), abstract: true });
    }
  };

  // struct / interface declarations, plain or inside `type ( ... )`
  const scan = (text: string, needType: boolean) => {
    const re = new RegExp(String.raw`${needType ? String.raw`\btype\s+` : String.raw`(?:^|\n)\s*`}(\w+)\s*(\[[^\]]*\])?\s*(struct|interface)\s*\{`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const open = m.index + m[0].length - 1;
      const close = matching(text, open);
      const c = make(m[1]);
      c.kind = m[3] === 'interface' ? 'interface' : 'class';
      if (m[2]) c.generics = m[2].slice(1, -1).trim();
      (m[3] === 'interface' ? interfaceBody : structBody)(c, text.slice(open + 1, close));
      re.lastIndex = close + 1;
    }
  };
  scan(src, true);
  const groups = /\btype\s*\(/g;
  let g: RegExpExecArray | null;
  while ((g = groups.exec(src))) {
    const open = g.index + g[0].length - 1;
    const close = matching(src, open, '(', ')');
    scan(src.slice(open + 1, close), false);
    groups.lastIndex = close + 1;
  }
  // named types: `type Money int64`, `type Color int`, `type Handler func(...)`
  const namedRe = /\btype\s+(\w+)\s*(\[[^\]]*\])?\s+(=\s*)?([^\s{(\n][^\n{]*)$/gm;
  let nm: RegExpExecArray | null;
  while ((nm = namedRe.exec(src))) {
    if (/^(struct|interface)\b/.test(nm[4])) continue;
    const c = make(nm[1]);
    c.stereotype = norm(nm[4]).slice(0, 24);
    if (nm[2]) c.generics = nm[2].slice(1, -1).trim();
    named.set(nm[1], c);
  }
  // iota-style constants turn a named type into an enum
  const constRe = /\bconst\s*\(([\s\S]*?)\n\s*\)|\bconst\s+(\w+)\s+(\w+)\s*=/g;
  let cm: RegExpExecArray | null;
  while ((cm = constRe.exec(src))) {
    if (cm[2] && cm[3]) { const c = named.get(cm[3]); if (c) { c.kind = 'enum'; delete c.stereotype; c.attributes.push({ visibility: '', name: cm[2] }); } continue; }
    let cur: string | undefined;
    for (const line of lines(cm[1])) {
      const m = /^(\w+)(?:\s+(\w+))?(?:\s*=.*)?$/.exec(line);
      if (!m) continue;
      if (m[2]) cur = m[2];
      else if (/=/.test(line)) cur = undefined;
      const c = cur ? named.get(cur) : undefined;
      if (c && m[1] !== '_') { c.kind = 'enum'; delete c.stereotype; c.attributes.push({ visibility: '', name: m[1] }); }
    }
  }
  // methods
  const fn = /\bfunc\s*\(\s*(?:\w+\s+)?\*?\s*(\w+)\s*(?:\[[^\]]*\])?\s*\)\s*(\w+)\s*(?:\[[^\]]*\])?\s*\(/g;
  let fm: RegExpExecArray | null;
  while ((fm = fn.exec(src))) {
    const open = fm.index + fm[0].length - 1;
    const close = matching(src, open, '(', ')');
    const rest = src.slice(close + 1);
    const lead = rest.length - rest.trimStart().length;
    const body = rest.slice(lead);
    let ret: string;
    if (body.startsWith('(')) ret = body.slice(0, matching(body, 0, '(', ')') + 1);
    else ret = /^[^\n{]*/.exec(body)![0].trim();
    const c = declared.has(fm[1]) ? model.classes.find((x) => x.name === fm![1])! : make(fm[1]);
    const op: MemberDef = { visibility: exported(fm[2]) ? '+' : '-', name: fm[2], params: parseParams(src.slice(open + 1, close)), ...(ret ? { type: norm(ret) } : {}) };
    c.operations.push(op);
    fn.lastIndex = close + 1;
  }
  for (const p of pending) for (const r of refs(p.type)) if (declared.has(r.name) && r.name !== p.owner) addRelation(model, { from: p.owner, to: r.name, kind: 'association', directed: true, toMult: r.mult, toRole: p.role });
  return { model, warnings };
}
