// rendering mirrors the Mermaid exporter; DBML subset reader written for this project.
import { cardinalityOf, isOptionalFk } from './cardinality';
import { emptySchema, findTable, newColumn, newTable, type ErColumnDef, type ErParseResult, type ErSchemaDef } from './types';
import { tokenize, type Tok } from './sqlParse';

const dq = (s: string) => (/^[A-Za-z_]\w*$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`);
const sq = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function renderDbml(s: ErSchemaDef): string {
  const out: string[] = [];
  for (const e of s.enums) out.push(`Enum ${dq(e.name)} {\n${e.values.map((v) => `  ${dq(v)}`).join('\n')}\n}\n`);
  for (const t of s.tables.filter((x) => x.kind !== 'view')) {
    const head = `Table ${t.schema ? dq(t.schema) + '.' : ''}${dq(t.name)}${t.accent ? ` [headercolor: ${t.accent}]` : ''} {`;
    const lines = t.columns.map((c) => {
      const attrs: string[] = [];
      if (c.pk) attrs.push('pk');
      if (c.generated === 'autoincrement' || c.generated === 'identity') attrs.push('increment');
      if (!c.nullable && !c.pk) attrs.push('not null');
      if (c.unique && !c.pk) attrs.push('unique');
      if (c.default !== undefined) attrs.push(`default: ${/^[-\w.]+$/.test(c.default) ? c.default : '`' + c.default.replace(/`/g, '') + '`'}`);
      if (c.comment) attrs.push(`note: ${sq(c.comment)}`);
      return `  ${dq(c.name)} ${/^[\w]+(\(\d+(,\s*\d+)?\))?$/.test(c.type) ? c.type : `"${c.type.replace(/"/g, '')}"`}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`;
    });
    const body = [...lines];
    if (t.indexes.length || t.checks.length) {
      body.push('', '  indexes {');
      for (const i of t.indexes) {
        const cols = i.columns.length > 1 || /[()\s]/.test(i.columns[0]) ? `(${i.columns.map((c) => (/[()\s]/.test(c) ? '`' + c + '`' : c)).join(', ')})` : i.columns[0];
        const attrs = [i.unique ? 'unique' : '', i.name ? `name: ${sq(i.name)}` : '', i.using ? `type: ${i.using}` : ''].filter(Boolean);
        body.push(`    ${cols}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`);
      }
      body.push('  }');
    }
    if (t.comment) body.push('', `  Note: ${sq(t.comment)}`);
    out.push(`${head}\n${body.join('\n')}\n}\n`);
  }
  const refs: string[] = [];
  for (const t of s.tables) {
    const seen = new Set<string>();
    for (const c of t.columns) {
      if (!c.fk) continue;
      const k = c.fk.group ?? c.name;
      if (seen.has(k)) continue;
      seen.add(k);
      const cols = c.fk.group ? t.columns.filter((x) => x.fk?.group === c.fk!.group) : [c];
      const parent = s.tables.find((x) => x.name === c.fk!.table);
      const ref = (col: ErColumnDef) => col.fk!.column || parent?.columns.find((x) => x.pk)?.name || 'id';
      const rel = cardinalityOf(t, cols) === '1:1' ? '-' : '>';
      const l = cols.length > 1 ? `(${cols.map((x) => dq(x.name)).join(', ')})` : dq(c.name);
      const r = cols.length > 1 ? `(${cols.map((x) => dq(ref(x))).join(', ')})` : dq(ref(c));
      const attrs = [c.fk.onDelete ? `delete: ${c.fk.onDelete.toLowerCase()}` : '', c.fk.onUpdate ? `update: ${c.fk.onUpdate.toLowerCase()}` : ''].filter(Boolean);
      refs.push(`Ref: ${dq(t.name)}.${l} ${rel} ${dq(c.fk.table)}.${r}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`);
    }
  }
  for (const l of s.loose) refs.push(`Ref: ${dq(l.from)}.id <> ${dq(l.to)}.id`);
  void isOptionalFk;
  return [...out, ...refs].join('\n') + '\n';
}

// ---- parser ----
interface Cur { toks: Tok[]; i: number }
const peek = (c: Cur) => c.toks[c.i];
const isP = (t: Tok | undefined, v: string) => !!t && t.k === 'punct' && t.v === v;

function stripDbmlComments(src: string): string {
  // `//` line comments (outside quotes) - tokenize() only knows SQL comments
  let out = '';
  let q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { out += ch; if (ch === '\\') { out += src[++i] ?? ''; } else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    out += ch;
  }
  return out;
}

function readName(c: Cur): string | undefined {
  const t = peek(c);
  if (!t || (t.k !== 'word' && t.k !== 'qident')) return undefined;
  c.i++;
  return t.v;
}
function qualified(c: Cur): string[] {
  const parts: string[] = [];
  for (;;) {
    const n = readName(c);
    if (n === undefined) break;
    parts.push(n);
    if (isP(peek(c), '.')) c.i++;
    else break;
  }
  return parts;
}
/** `[a: b, c, d: 'e']` attribute list -> [key, value][] */
function readAttrs(c: Cur): [string, string][] {
  const out: [string, string][] = [];
  if (!isP(peek(c), '[')) return out;
  c.i++;
  let key = '';
  let val: Tok[] = [];
  let hasColon = false;
  let depth = 0;
  const flush = () => { if (key || val.length) out.push([key.toLowerCase(), val.map((t, i) => (t.k === 'str' ? t.v : t.raw).replace(/^/, i > 0 && !val.some((x) => x.raw === '#') && /^(word|num)$/.test(t.k) && /^(word|num)$/.test(val[i - 1].k) ? ' ' : '')).join('')]); key = ''; val = []; hasColon = false; };
  while (c.i < c.toks.length) {
    const t = c.toks[c.i++];
    if (t.k === 'punct' && t.v === '[') depth++;
    if (t.k === 'punct' && t.v === ']') { if (depth === 0) break; depth--; }
    if (depth === 0 && isP(t, ',')) { flush(); continue; }
    if (depth === 0 && isP(t, ':') && !hasColon) { hasColon = true; continue; }
    if (!hasColon) key += (key ? ' ' : '') + t.v;
    else val.push(t);
  }
  flush();
  return out;
}

export function parseDbml(src: string): ErParseResult {
  const schema = emptySchema();
  const warnings: string[] = [];
  // backtick expressions are one token already (qident); strings may use '''multi'''
  const toks = tokenize(stripDbmlComments(src).replace(/'''([\s\S]*?)'''/g, (_m, g: string) => `'${g.replace(/'/g, "\\'")}'`));
  const c: Cur = { toks, i: 0 };
  const refs: { from: string[]; fromCols: string[]; to: string[]; toCols: string[]; rel: string; attrs: [string, string][] }[] = [];
  const colList = (): string[] => {
    if (isP(peek(c), '(')) {
      c.i++;
      const out: string[] = [];
      while (c.i < toks.length && !isP(peek(c), ')')) { const t = toks[c.i++]; if (t.k === 'word' || t.k === 'qident') out.push(t.v); }
      c.i++;
      return out;
    }
    const n = readName(c);
    return n ? [n] : [];
  };
  const readRefSide = (): { table: string[]; cols: string[] } => {
    const parts: string[] = [];
    let cols: string[] = [];
    for (;;) {
      if (isP(peek(c), '(')) { cols = colList(); break; }
      const n = readName(c);
      if (n === undefined) break;
      parts.push(n);
      if (isP(peek(c), '.')) c.i++;
      else break;
    }
    if (!cols.length && parts.length > 1) { cols = [parts.pop()!]; }
    return { table: parts, cols };
  };
  const readRef = (inline: false) => {
    void inline;
    const a = readRefSide();
    let rel = '';
    while (peek(c) && (peek(c).k === 'punct') && /^(<>|[<>\-])$/.test(peek(c).v)) rel += toks[c.i++].v;
    const b = readRefSide();
    const attrs = readAttrs(c);
    if (a.table.length && b.table.length) refs.push({ from: a.table, fromCols: a.cols, to: b.table, toCols: b.cols, rel, attrs });
  };
  const skipBlock = () => {
    if (!isP(peek(c), '{')) return;
    let d = 0;
    while (c.i < toks.length) {
      const t = toks[c.i++];
      if (isP(t, '{')) d++;
      if (isP(t, '}') && --d === 0) break;
    }
  };
  while (c.i < toks.length) {
    const t = toks[c.i++];
    if (t.k !== 'word') continue;
    const kw = t.u;
    if (kw === 'TABLE' || kw === 'TABLEGROUP') {
      if (kw === 'TABLEGROUP') { readName(c); skipBlock(); continue; }
      const name = qualified(c);
      let alias: string | undefined;
      if (isWord(peek(c), 'AS')) { c.i++; alias = readName(c); }
      const hdr = readAttrs(c);
      const table = newTable(name[name.length - 1], [], name.length > 1 ? { schema: name[name.length - 2] } : {});
      const hc = hdr.find(([k]) => k === 'headercolor');
      if (hc && /^#[0-9a-f]{3,8}$/i.test(hc[1])) table.accent = hc[1];
      void alias;
      if (!isP(peek(c), '{')) continue;
      c.i++;
      while (c.i < toks.length && !isP(peek(c), '}')) {
        const h = peek(c);
        if (h.k === 'word' && h.u === 'INDEXES' && isP(toks[c.i + 1], '{')) {
          c.i += 2;
          while (c.i < toks.length && !isP(peek(c), '}')) {
            // re-read: either (a, b) or a single name or backtick expression
            const names: string[] = [];
            if (isP(peek(c), '(')) {
              c.i++;
              while (c.i < toks.length && !isP(peek(c), ')')) { const x = toks[c.i++]; if (x.k === 'word' || x.k === 'qident') names.push(x.v); }
              c.i++;
            } else { const x = toks[c.i++]; if (x && (x.k === 'word' || x.k === 'qident')) names.push(x.v); }
            const attrs = readAttrs(c);
            if (names.length) table.indexes.push({ ...(attrs.find(([k]) => k === 'name') ? { name: attrs.find(([k]) => k === 'name')![1] } : {}), columns: names, unique: attrs.some(([k]) => k === 'unique'), ...(attrs.find(([k]) => k === 'type') ? { using: attrs.find(([k]) => k === 'type')![1] } : {}) });
          }
          c.i++;
          continue;
        }
        if (h.k === 'word' && h.u === 'NOTE' && isP(toks[c.i + 1], ':')) { c.i += 2; const s = toks[c.i++]; if (s?.k === 'str') table.comment = s.v; continue; }
        if (h.k === 'word' && h.u === 'NOTE' && isP(toks[c.i + 1], '{')) { c.i++; const sb = c.i; skipBlock(); const s = toks.slice(sb, c.i).find((x) => x.k === 'str'); if (s) table.comment = s.v; continue; }
        const cname = readName(c);
        if (cname === undefined) { c.i++; continue; }
        // type: words / quoted until `[` or newline-ish (next name) - read one type token (+ optional (n,m))
        const ty = toks[c.i++];
        let type = ty ? (ty.k === 'str' ? ty.v : ty.v) : 'text';
        while (isP(peek(c), '.') ) { c.i++; type += '.' + (toks[c.i++]?.v ?? ''); }
        if (isP(peek(c), '(')) {
          const s0 = c.i;
          let d = 0;
          while (c.i < toks.length) { const x = toks[c.i++]; if (isP(x, '(')) d++; if (isP(x, ')') && --d === 0) break; }
          type += toks.slice(s0, c.i).map((x) => x.raw).join('').replace(/,/g, ', ');
        }
        if (isP(peek(c), '[') && toks[c.i + 1]?.v === ']') { c.i += 2; type += '[]'; }
        const col = newColumn(cname, type, {});
        const attrStart = c.i;
        for (const [k, v] of readAttrs(c)) {
          if (k === 'pk' || k === 'primary key') { col.pk = true; col.nullable = false; }
          else if (k === 'not null') col.nullable = false;
          else if (k === 'null') col.nullable = true;
          else if (k === 'unique') col.unique = true;
          else if (k === 'increment') col.generated = 'autoincrement';
          else if (k === 'default') col.default = v;
          else if (k === 'note') col.comment = v;
          else if (k === 'ref' || k.startsWith('ref')) {
            const m = /^\s*([<>\-]+)\s*(.+)$/.exec(v.replace(/^ref\s*:?/, '')) ?? /^([<>\-]+)(.+)$/.exec(v);
            void m;
          }
        }
        table.columns.push(col);
        // inline refs: re-scan the attr tokens we just consumed for `ref: > t.c`
        const attrToks: Tok[] = c.i > attrStart ? toks.slice(attrStart + 1, c.i - 1) : [];
        const ri = attrToks.findIndex((x, k) => x.k === 'word' && x.u === 'REF' && isP(attrToks[k + 1], ':'));
        if (ri >= 0) {
          const sub: Cur = { toks: attrToks.slice(ri + 2), i: 0 };
          let rel = '';
          while (peek(sub) && peek(sub).k === 'punct' && /^(<>|[<>\-])$/.test(peek(sub).v)) rel += sub.toks[sub.i++].v;
          const parts: string[] = [];
          for (;;) { const n = peek(sub); if (!n || (n.k !== 'word' && n.k !== 'qident')) break; parts.push(n.v); sub.i++; if (isP(peek(sub), '.')) sub.i++; else break; }
          if (parts.length >= 2) refs.push({ from: [...(table.schema ? [table.schema] : []), table.name], fromCols: [cname], to: parts.slice(0, -1), toCols: [parts[parts.length - 1]], rel, attrs: [] });
        }
      }
      c.i++;
      schema.tables.push(table);
    } else if (kw === 'ENUM') {
      const name = qualified(c);
      if (!isP(peek(c), '{')) continue;
      c.i++;
      const values: string[] = [];
      while (c.i < toks.length && !isP(peek(c), '}')) {
        const v = toks[c.i++];
        if (v.k === 'word' || v.k === 'qident' || v.k === 'str') values.push(v.v);
        readAttrs(c);
      }
      c.i++;
      schema.enums.push({ name: name[name.length - 1], values });
    } else if (kw === 'REF') {
      if (isP(peek(c), ':')) { c.i++; readRef(false); }
      else {
        readName(c);
        if (isP(peek(c), ':')) { c.i++; readRef(false); }
        else if (isP(peek(c), '{')) { c.i++; readRef(false); skipBlock2(c); }
      }
    } else if (kw === 'PROJECT' || kw === 'NOTE') skipBlock();
  }
  for (const r of refs) {
    const fromT = findTable(schema, r.from[r.from.length - 1]);
    const toT = findTable(schema, r.to[r.to.length - 1]);
    if (!fromT || !toT) { warnings.push(`Ref to unknown table ${(!fromT ? r.from : r.to).join('.')}`); continue; }
    if (r.rel === '<>') { schema.loose.push({ from: fromT.name, to: toT.name, cardinality: 'N:M', identifying: false }); continue; }
    // `>`: from is many (child), `<`: from is one (parent), `-`: one-to-one (from holds the key)
    const childIsFrom = r.rel !== '<';
    const child = childIsFrom ? fromT : toT;
    const parent = childIsFrom ? toT : fromT;
    const childCols = childIsFrom ? r.fromCols : r.toCols;
    const parentCols = childIsFrom ? r.toCols : r.fromCols;
    const group = childCols.length > 1 ? `g${schema.tables.length}${child.name}${childCols.join('')}` : undefined;
    childCols.forEach((cn, k) => {
      const col = child.columns.find((x) => x.name === cn);
      if (!col) return;
      const get = (n: string) => r.attrs.find(([key]) => key === n)?.[1];
      col.fk = { table: parent.name, column: parentCols[k] ?? parentCols[0] ?? '', ...(get('delete') ? { onDelete: get('delete')!.toUpperCase() } : {}), ...(get('update') ? { onUpdate: get('update')!.toUpperCase() } : {}), ...(group ? { group } : {}) };
      if (r.rel === '-') col.unique = true;
    });
  }
  return { schema, warnings };
}
function isWord(t: Tok | undefined, w: string) { return !!t && t.k === 'word' && t.u === w; }
function skipBlock2(c: Cur) { while (c.i < c.toks.length) { const t = c.toks[c.i++]; if (isP(t, '}')) break; } }
