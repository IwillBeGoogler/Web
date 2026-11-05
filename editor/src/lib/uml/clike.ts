/** Helpers shared by the lightweight Go and C# parsers (tokenizer-level work: blanking literals, brace matching, member chunks). */

/** Blank out comments and string / char literals (and Go raw strings) keeping length and newlines. */
export function stripCLike(src: string, opts: { backtick?: boolean } = {}): string {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && n === '*') { i += 2; out += '  '; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } i += 2; out += '  '; }
    else if (c === '"' || c === "'" || (opts.backtick && c === '`')) {
      const q = c;
      out += q; i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\' && q !== '`') { out += ' '; i++; }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += q; i++;
    } else { out += c; i++; }
  }
  return out;
}

/** index of the bracket that closes the one at `open` (s.length when unbalanced) */
export function matching(s: string, open: number, o = '{', c = '}'): number {
  let d = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === o) d++; else if (s[i] === c && --d === 0) return i; }
  return s.length;
}

/** top-level member chunks of a type body: text up to `;` or through a `{...}` block; `cont` says a `{` continues the current chunk (initialiser) */
export function chunks(body: string, cont: RegExp): { head: string; block?: string }[] {
  const out: { head: string; block?: string }[] = [];
  let cur = '';
  let paren = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') paren++; else if (ch === ')') paren--;
    if (ch === '{' && paren === 0) {
      const end = matching(body, i);
      if (cont.test(cur)) { cur += body.slice(i, end + 1); i = end; continue; }
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

/** body text with the bodies of nested types removed (`kw` matches the opening of a nested type) */
export function stripNested(body: string, kw: RegExp): string {
  let out = '';
  const re = new RegExp(kw.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const open = m.index + m[0].length - 1;
    const close = matching(body, open);
    const from = Math.max(last, body.lastIndexOf(';', m.index) + 1, body.lastIndexOf('}', m.index) + 1, body.lastIndexOf('{', m.index) + 1);
    out += body.slice(last, from);
    last = close + 1;
    re.lastIndex = close + 1;
  }
  return out + body.slice(last);
}

/** `Type name` split at the last whitespace outside <> and [] */
export function splitTypeName(p: string): { name: string; type?: string } {
  const t = p.trim();
  let depth = 0;
  let cut = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    const ch = t[i];
    if (ch === '>' || ch === ']') depth++; else if (ch === '<' || ch === '[') depth--;
    else if (/\s/.test(ch) && depth === 0) { cut = i; break; }
  }
  if (cut < 0) return { name: t };
  return { name: t.slice(cut + 1).trim(), type: t.slice(0, cut).trim() };
}
