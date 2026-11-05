import type { ClassMember, ClassParam, Visibility } from './types';

const VIS_NAMES: Record<string, string> = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
export const visibilityLabel = (v: Visibility): string => VIS_NAMES[v] ?? 'default';

/** `Name<T, K>` for a generic class */
export const displayName = (d: { label: string; generics?: string }): string => (d.generics?.trim() ? `${d.label}<${d.generics.trim()}>` : d.label);

/** split at commas that are not inside <> () [] {} */
export function splitTop(s: string): string[] {
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

export const formatParams = (ps: ClassParam[] = []): string => ps.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');
const vis = (m: ClassMember) => (m.visibility ? `${m.visibility} ` : '');

export function formatAttribute(m: ClassMember): string {
  return `${vis(m)}${m.name}${m.type ? `: ${m.type}` : ''}${m.default ? ` = ${m.default}` : ''}`;
}
export function formatOperation(m: ClassMember): string {
  return `${vis(m)}${m.name}(${formatParams(m.params)})${m.type ? `: ${m.type}` : ''}`;
}
/** Text shown in a row and edited inline; `static` / `abstract` words lead it so the text round-trips. */
export function memberText(m: ClassMember, kind: 'attribute' | 'operation'): string {
  const body = kind === 'attribute' ? formatAttribute(m) : formatOperation(m);
  return `${m.static ? 'static ' : ''}${m.abstract ? 'abstract ' : ''}${body}`;
}

const VIS = /^([+\-#~])\s*/;
/** Parse the text of one row ("static - id: number = 0", "abstract + run(a: A): R"); `id` is filled in by the caller. */
export function parseMember(text: string, kind: 'attribute' | 'operation'): Omit<ClassMember, 'id'> {
  let t = text.trim();
  let isStatic = false;
  let isAbstract = false;
  for (;;) {
    const w = /^(static|abstract)\s+/i.exec(t);
    if (!w) break;
    if (w[1].toLowerCase() === 'static') isStatic = true; else isAbstract = true;
    t = t.slice(w[0].length);
  }
  const v = VIS.exec(t);
  const visibility: Visibility = (v?.[1] as Visibility | undefined) ?? '+';
  if (v) t = t.slice(v[0].length);
  // modifiers may also follow the visibility symbol: "+ static x"
  for (;;) {
    const w = /^(static|abstract)\s+/i.exec(t);
    if (!w) break;
    if (w[1].toLowerCase() === 'static') isStatic = true; else isAbstract = true;
    t = t.slice(w[0].length);
  }
  const flags = { ...(isStatic ? { static: true } : {}), ...(isAbstract ? { abstract: true } : {}) };
  if (kind === 'attribute') {
    const m = /^([^:=]+?)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/.exec(t);
    return { visibility, name: (m?.[1] ?? t).trim(), ...(m?.[2] ? { type: m[2].trim() } : {}), ...(m?.[3] ? { default: m[3].trim() } : {}), ...flags };
  }
  const open = t.indexOf('(');
  if (open < 0) return { visibility, name: t.replace(/:.*$/, '').trim(), params: [], ...(/:\s*(.+)$/.exec(t) ? { type: /:\s*(.+)$/.exec(t)![1].trim() } : {}), ...flags };
  let depth = 0;
  let close = -1;
  for (let i = open; i < t.length; i++) {
    if (t[i] === '(') depth++;
    else if (t[i] === ')' && --depth === 0) { close = i; break; }
  }
  if (close < 0) close = t.length;
  const params = splitTop(t.slice(open + 1, close)).map((p): ClassParam => {
    const c = p.indexOf(':');
    return c < 0 ? { name: p.trim() } : { name: p.slice(0, c).trim(), type: p.slice(c + 1).trim() };
  });
  const ret = /^\s*:\s*(.+)$/.exec(t.slice(close + 1));
  return { visibility, name: t.slice(0, open).trim(), params, ...(ret ? { type: ret[1].trim() } : {}), ...flags };
}
