// scope follows internal/ddl/parse.go, rewritten as a tokenizer-based
// TypeScript parser covering PostgreSQL, MySQL / MariaDB and SQLite dialects.
import { findTable, emptySchema, newColumn, newTable, type Dialect, type ErColumnDef, type ErFk, type ErParseResult, type ErSchemaDef, type ErTableDef } from './types';

export type TokKind = 'word' | 'qident' | 'str' | 'num' | 'punct';
export interface Tok {
  k: TokKind;
  /** word: as written; qident / str: the unquoted value; punct: the symbol */
  v: string;
  /** upper-case word (words only) */
  u: string;
  /** source text (for rebuilding expressions) */
  raw: string;
}

/** Tokenise SQL: comments dropped, quoted identifiers / strings / dollar quotes kept whole. */
export function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  const n = sql.length;
  let i = 0;
  const push = (k: TokKind, v: string, raw: string) => out.push({ k, v, u: k === 'word' ? v.toUpperCase() : '', raw });
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && c2 === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '#' && !/[>\-]/.test(c2 ?? '') && /^[ \t]*$/.test(sql.slice(sql.lastIndexOf('\n', i - 1) + 1, i))) { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "'" || ((c === 'E' || c === 'e' || c === 'N' || c === 'n') && c2 === "'")) {
      const start = i;
      const esc = c !== "'" && (c === 'E' || c === 'e');
      i += c === "'" ? 1 : 2;
      let v = '';
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { v += "'"; i += 2; continue; }
        if (esc && sql[i] === '\\' && i + 1 < n) { v += sql[i + 1]; i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        v += sql[i++];
      }
      push('str', v, sql.slice(start, i));
      continue;
    }
    if (c === '"' || c === '`') {
      const start = i;
      i++;
      let v = '';
      while (i < n) {
        if (sql[i] === c && sql[i + 1] === c) { v += c; i += 2; continue; }
        if (sql[i] === c) { i++; break; }
        v += sql[i++];
      }
      push('qident', v, sql.slice(start, i));
      continue;
    }
    if (c === '[' && /[A-Za-z_]/.test(c2 ?? '')) {
      // [bracket identifier] (SQLite / SQL Server) - only where an identifier is expected, never as an array suffix
      const end = sql.indexOf(']', i);
      const prev = out[out.length - 1];
      const inner = end > 0 ? sql.slice(i + 1, end) : '';
      const asIdent = !prev || (prev.k === 'punct' && /^[(,.]$/.test(prev.v)) || /^(TABLE|ON|REFERENCES|ADD|CONSTRAINT|KEY|INDEX|EXISTS|COLUMN|TO|UNIQUE|PRIMARY|FOREIGN|AS|BY)$/.test(prev.u);
      if (end > 0 && asIdent && /^[^\[\],]+$/.test(inner)) {
        push('qident', inner, sql.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        const stop = end < 0 ? n : end + m[0].length;
        push('str', sql.slice(i + m[0].length, end < 0 ? n : end), sql.slice(i, stop));
        i = stop;
        continue;
      }
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/.exec(sql.slice(i));
      const s = m ? m[0] : c;
      push('num', s, s);
      i += s.length;
      continue;
    }
    if (/[A-Za-z_\u0080-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$\u0080-￿]/.test(sql[j])) j++;
      push('word', sql.slice(i, j), sql.slice(i, j));
      i = j;
      continue;
    }
    const two = c + (c2 ?? '');
    if (['::', '<>', '<=', '>=', '!=', '||', '->', '=>', ':='].includes(two)) {
      if (two === '->' && sql[i + 2] === '>') { push('punct', '->>', '->>'); i += 3; continue; }
      push('punct', two, two);
      i += 2;
      continue;
    }
    push('punct', c, c);
    i++;
  }
  return out;
}

/** split on top-level `;` */
function statements(toks: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  let inBody = false;
  for (const t of toks) {
    if (t.k === 'punct') {
      if (t.v === '(') depth++;
      else if (t.v === ')') depth = Math.max(0, depth - 1);
    }
    if (t.k === 'word' && t.u === 'BEGIN' && depth === 0 && cur.some((x) => x.u === 'TRIGGER' || x.u === 'PROCEDURE' || x.u === 'FUNCTION')) inBody = true;
    if (t.k === 'word' && t.u === 'END' && inBody) inBody = false;
    if (t.k === 'punct' && t.v === ';' && depth === 0 && !inBody) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

function splitTop(toks: Tok[], sep = ','): Tok[][] {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.k === 'punct') {
      if (t.v === '(' || t.v === '[') depth++;
      else if (t.v === ')' || t.v === ']') depth--;
      else if (t.v === sep && depth === 0) { out.push(cur); cur = []; continue; }
    }
    cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

const text = (toks: Tok[]): string => {
  let s = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = toks[i - 1];
    const tight = !prev || (t.k === 'punct' && /^[),.:\[\]]$|^::$/.test(t.v)) || (prev.k === 'punct' && /^[(.:\[]$|^::$/.test(prev.v)) || (t.k === 'punct' && t.v === '(' && prev.k === 'word' && !/^(AND|OR|NOT|IN|AS|ON)$/.test(prev.u));
    s += (tight ? '' : ' ') + (t.k === 'qident' ? t.raw : t.raw);
  }
  return s;
};

const isWord = (t: Tok | undefined, ...ws: string[]): boolean => !!t && t.k === 'word' && (ws.length === 0 || ws.includes(t.u));
const isP = (t: Tok | undefined, v: string): boolean => !!t && t.k === 'punct' && t.v === v;
const ident = (t: Tok | undefined): string | undefined => (t && (t.k === 'word' || t.k === 'qident') ? t.v : undefined);

/** find the index of the matching `)` for the `(` at `open` */
function closeIdx(toks: Tok[], open: number): number {
  let d = 0;
  for (let i = open; i < toks.length; i++) {
    if (isP(toks[i], '(')) d++;
    else if (isP(toks[i], ')') && --d === 0) return i;
  }
  return toks.length;
}

/** [schema.]name starting at i: returns parts and next index */
function qname(toks: Tok[], i: number): { schema?: string; name: string; next: number } | null {
  const parts: string[] = [];
  let j = i;
  for (;;) {
    const id = ident(toks[j]);
    if (!id) break;
    parts.push(id);
    j++;
    if (isP(toks[j], '.') && ident(toks[j + 1])) j++;
    else break;
  }
  if (!parts.length) return null;
  return { name: parts[parts.length - 1], schema: parts.length > 1 ? parts[parts.length - 2] : undefined, next: j };
}

function identList(toks: Tok[]): string[] {
  // column list contents "a, b DESC, lower(c)" -> names (first identifier of each entry)
  return splitTop(toks).map((e) => {
    const f = e.find((t) => t.k === 'word' || t.k === 'qident');
    if (!f) return '';
    // expression index: keep the text
    if (e.some((t) => isP(t, '('))) return text(e);
    return f.v;
  }).filter(Boolean);
}

const COL_STOP = new Set(['NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'REFERENCES', 'CHECK', 'CONSTRAINT', 'COLLATE', 'COMMENT', 'GENERATED', 'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY', 'AS', 'KEY', 'ON', 'VISIBLE', 'INVISIBLE', 'STORAGE', 'ENCODE', 'DISTKEY', 'SORTKEY']);

interface Pending {
  table: ErTableDef;
  pk?: string[];
}

function parseFkTail(toks: Tok[], i: number): { fk: Omit<ErFk, 'group'>; cols: string[]; next: number } | null {
  // REFERENCES t [(cols)] [MATCH x] [ON DELETE a] [ON UPDATE b] [DEFERRABLE ...]
  if (!isWord(toks[i], 'REFERENCES')) return null;
  const q = qname(toks, i + 1);
  if (!q) return null;
  let j = q.next;
  let cols: string[] = [];
  if (isP(toks[j], '(')) {
    const e = closeIdx(toks, j);
    cols = identList(toks.slice(j + 1, e));
    j = e + 1;
  }
  const fk: Omit<ErFk, 'group'> = { table: q.name, column: cols[0] ?? '' };
  while (j < toks.length) {
    if (isWord(toks[j], 'ON') && isWord(toks[j + 1], 'DELETE', 'UPDATE')) {
      const which = toks[j + 1].u === 'DELETE' ? 'onDelete' : 'onUpdate';
      let k = j + 2;
      const parts: string[] = [];
      if (isWord(toks[k])) {
        parts.push(toks[k].u);
        if (/^(SET|NO)$/.test(toks[k].u) && isWord(toks[k + 1])) parts.push(toks[k + 1].u);
        k += parts.length;
      }
      fk[which] = parts.join(' ');
      j = k;
    } else if (isWord(toks[j], 'MATCH')) j += 2;
    else if (isWord(toks[j], 'NOT') && isWord(toks[j + 1], 'DEFERRABLE')) j += 2;
    else if (isWord(toks[j], 'DEFERRABLE')) j++;
    else if (isWord(toks[j], 'INITIALLY')) j += 2;
    else break;
  }
  return { fk, cols, next: j };
}

function parseColumn(toks: Tok[]): ErColumnDef | null {
  const name = ident(toks[0]);
  if (!name) return null;
  let i = 1;
  // type: tokens until a constraint keyword at depth 0
  const typeToks: Tok[] = [];
  let depth = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (isP(t, '(')) depth++;
    if (isP(t, ')')) depth--;
    if (depth === 0 && t.k === 'word' && COL_STOP.has(t.u)) {
      if (t.u === 'AS' && typeToks.length === 0) break;
      if (t.u === 'ON' && !isWord(toks[i + 1], 'UPDATE', 'DELETE')) { typeToks.push(t); i++; continue; }
      if (t.u === 'KEY' || t.u === 'IDENTITY') {
        // `KEY` as a bare word only after PRIMARY/UNIQUE; IDENTITY(1,1) is SQL Server style
        if (t.u === 'KEY') { typeToks.push(t); i++; continue; }
      }
      if (t.u === 'AS' && typeToks.length > 0 && !isP(toks[i + 1], '(')) { typeToks.push(t); i++; continue; }
      break;
    }
    if (depth === 0 && t.k === 'word' && t.u === 'CHARACTER' && isWord(toks[i + 1], 'SET')) break;
    if (depth === 0 && t.k === 'word' && t.u === 'CHARSET') break;
    typeToks.push(t);
    i++;
  }
  const col = newColumn(name, text(typeToks) || 'text', { nullable: true });
  if (/^(serial|bigserial|smallserial|serial[248])$/i.test(col.type.trim())) col.generated = 'autoincrement';
  let inlineCheck: string | undefined;
  while (i < toks.length) {
    const t = toks[i];
    if (t.k !== 'word') { i++; continue; }
    switch (t.u) {
      case 'CONSTRAINT': i += 2; break;
      case 'NOT': if (isWord(toks[i + 1], 'NULL')) { col.nullable = false; i += 2; } else i++; break;
      case 'NULL': col.nullable = true; i++; break;
      case 'PRIMARY': col.pk = true; col.nullable = false; i += isWord(toks[i + 1], 'KEY') ? 2 : 1; break;
      case 'UNIQUE': col.unique = true; i += isWord(toks[i + 1], 'KEY') ? 2 : 1; break;
      case 'KEY': i++; break;
      case 'AUTO_INCREMENT': col.generated = 'autoincrement'; i++; break;
      case 'AUTOINCREMENT': col.generated = 'autoincrement'; i++; break;
      case 'IDENTITY': col.generated = 'identity'; i++; if (isP(toks[i], '(')) i = closeIdx(toks, i) + 1; break;
      case 'GENERATED': {
        let j = i + 1;
        if (isWord(toks[j], 'ALWAYS', 'BY')) j += isWord(toks[j], 'BY') ? 2 : 1;
        if (isWord(toks[j], 'AS')) {
          j++;
          if (isWord(toks[j], 'IDENTITY')) {
            col.generated = 'identity';
            j++;
            if (isP(toks[j], '(')) j = closeIdx(toks, j) + 1;
          } else if (isP(toks[j], '(')) {
            const e = closeIdx(toks, j);
            col.generated = `as ${text(toks.slice(j, e + 1))}`;
            j = e + 1;
            if (isWord(toks[j], 'STORED', 'VIRTUAL')) j++;
          }
        }
        i = j;
        break;
      }
      case 'AS':
        if (isP(toks[i + 1], '(')) {
          const e = closeIdx(toks, i + 1);
          col.generated = `as ${text(toks.slice(i + 1, e + 1))}`;
          i = e + 1;
          if (isWord(toks[i], 'STORED', 'VIRTUAL', 'PERSISTED')) i++;
        } else i++;
        break;
      case 'DEFAULT': {
        let j = i + 1;
        const buf: Tok[] = [];
        let d = 0;
        while (j < toks.length) {
          const x = toks[j];
          if (isP(x, '(')) d++;
          if (isP(x, ')')) d--;
          if (d === 0 && x.k === 'word' && buf.length > 0 && COL_STOP.has(x.u) && !(x.u === 'ON' && !isWord(toks[j + 1], 'UPDATE', 'DELETE')) && x.u !== 'AS') break;
          if (d === 0 && x.k === 'word' && buf.length > 0 && /^(GENERATED|COLLATE|COMMENT|CHECK|REFERENCES|PRIMARY|UNIQUE|CONSTRAINT)$/.test(x.u)) break;
          buf.push(x);
          j++;
        }
        col.default = text(buf);
        if (/^nextval\(/i.test(col.default)) col.generated ??= 'autoincrement';
        i = j;
        break;
      }
      case 'ON':
        if (isWord(toks[i + 1], 'UPDATE')) { i += 2; if (isWord(toks[i])) i++; if (isP(toks[i], '(')) i = closeIdx(toks, i) + 1; } else i++;
        break;
      case 'COMMENT': if (toks[i + 1]?.k === 'str') { col.comment = toks[i + 1].v; i += 2; } else i++; break;
      case 'COLLATE': i += 2; break;
      case 'CHARACTER': i += isWord(toks[i + 1], 'SET') ? 3 : 1; break;
      case 'CHARSET': i += 2; break;
      case 'CHECK': {
        if (isP(toks[i + 1], '(')) {
          const e = closeIdx(toks, i + 1);
          inlineCheck = text(toks.slice(i + 2, e));
          i = e + 1;
        } else i++;
        break;
      }
      case 'REFERENCES': {
        const r = parseFkTail(toks, i);
        if (r) { col.fk = r.fk; i = r.next; } else i++;
        break;
      }
      default: i++;
    }
  }
  if (inlineCheck) (col as ErColumnDef & { _check?: string })._check = inlineCheck;
  return col;
}

function applyTableConstraint(p: Pending, toks: Tok[], warnings: string[], fkSeq: { n: number }): void {
  let i = 0;
  let cname: string | undefined;
  if (isWord(toks[i], 'CONSTRAINT')) {
    cname = ident(toks[i + 1]);
    i += 2;
  }
  const t = p.table;
  const col = (n: string) => t.columns.find((c) => c.name === n) ?? t.columns.find((c) => c.name.toLowerCase() === n.toLowerCase());
  const head = toks[i];
  if (isWord(head, 'PRIMARY')) {
    i += isWord(toks[i + 1], 'KEY') ? 2 : 1;
    if (ident(toks[i]) && !isP(toks[i], '(') && isP(toks[i + 1], '(')) i++; // sqlite / mysql may name it
    if (isP(toks[i], '(')) {
      const e = closeIdx(toks, i);
      const names = identList(toks.slice(i + 1, e));
      for (const n of names) {
        const c = col(n);
        if (c) { c.pk = true; c.nullable = false; }
      }
      if (names.length === 1) { const c = col(names[0]); if (c) c.unique = false; }
    }
  } else if (isWord(head, 'UNIQUE') || (isWord(head, 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL') ) ) {
    const unique = isWord(head, 'UNIQUE');
    i++;
    if (isWord(toks[i], 'KEY', 'INDEX')) i++;
    let name = cname;
    if (ident(toks[i]) && !isP(toks[i], '(') && !isWord(toks[i], 'USING')) { name = ident(toks[i]); i++; }
    if (isWord(toks[i], 'USING')) i += 2;
    if (isP(toks[i], '(')) {
      const e = closeIdx(toks, i);
      const names = identList(toks.slice(i + 1, e));
      if (unique && names.length === 1 && col(names[0]) && !name) col(names[0])!.unique = true;
      else t.indexes.push({ name, columns: names, unique });
      if (unique && names.length === 1 && col(names[0]) && name) col(names[0])!.unique = col(names[0])!.unique || false;
    }
  } else if (isWord(head, 'FOREIGN')) {
    i += isWord(toks[i + 1], 'KEY') ? 2 : 1;
    let name = cname;
    if (ident(toks[i]) && !isP(toks[i], '(')) { name = ident(toks[i]); i++; }
    if (!isP(toks[i], '(')) return void warnings.push(`FOREIGN KEY in ${t.name} not understood`);
    const e = closeIdx(toks, i);
    const local = identList(toks.slice(i + 1, e));
    const r = parseFkTail(toks, e + 1);
    if (!r) return void warnings.push(`FOREIGN KEY in ${t.name} has no REFERENCES`);
    const group = local.length > 1 ? `fk${++fkSeq.n}` : undefined;
    const target = r.cols.length ? r.cols : [''];
    local.forEach((ln, k) => {
      const c = col(ln);
      if (!c) return;
      c.fk = { ...r.fk, column: target[k] ?? target[0] ?? '', ...(name ? { name } : {}), ...(group ? { group } : {}) };
    });
  } else if (isWord(head, 'CHECK')) {
    if (isP(toks[i + 1], '(')) {
      const e = closeIdx(toks, i + 1);
      t.checks.push({ ...(cname ? { name: cname } : {}), expr: text(toks.slice(i + 2, e)) });
    }
  } else if (isWord(head, 'EXCLUDE', 'LIKE', 'PERIOD')) {
    // not representable
  } else warnings.push(`Skipped unsupported table item in ${t.name}: ${text(toks).slice(0, 60)}`);
}

function parseCreateTable(toks: Tok[], schema: ErSchemaDef, warnings: string[], fkSeq: { n: number }): Pending | null {
  let i = 1; // after CREATE
  while (i < toks.length && !isWord(toks[i], 'TABLE')) i++;
  i++;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'NOT')) i += 3;
  const q = qname(toks, i);
  if (!q) return null;
  i = q.next;
  // partitions are hidden: only the partitioned parent is shown
  if (isWord(toks[i], 'PARTITION') && isWord(toks[i + 1], 'OF')) return null;
  if (isWord(toks[i], 'AS')) { warnings.push(`CREATE TABLE ${q.name} AS ... skipped`); return null; }
  const table = newTable(q.name, [], q.schema ? { schema: q.schema } : {});
  const pending: Pending = { table };
  if (isWord(toks[i], 'LIKE')) {
    // MySQL: CREATE TABLE a LIKE b
    if (!copyLike(toks.slice(i), schema, table, warnings)) return null;
    putTable(schema, table);
    return pending;
  }
  if (!isP(toks[i], '(')) return null;
  const e = closeIdx(toks, i);
  const body = toks.slice(i + 1, e);
  const items = splitTop(body);
  const deferred: Tok[][] = [];
  for (const item of items) {
    if (!item.length) continue;
    const h = item[0];
    if (isWord(h, 'LIKE')) { copyLike(item, schema, table, warnings); continue; }
    const looksLikeList = (at: number) => isP(item[at], '(') && (item[at + 1]?.k === 'word' || item[at + 1]?.k === 'qident');
    // MySQL index with an access method: INDEX USING btree (a) / KEY k USING hash (b) / UNIQUE KEY k USING btree (c)
    const usingAt = item.findIndex((t, k) => k > 0 && k <= 4 && isWord(t, 'USING'));
    const tableLevel =
      isWord(h, 'CONSTRAINT', 'PRIMARY', 'FOREIGN', 'CHECK', 'EXCLUDE', 'LIKE') ||
      (isWord(h, 'UNIQUE', 'KEY', 'INDEX', 'FULLTEXT', 'SPATIAL', 'PERIOD') &&
        (looksLikeList(1) || (usingAt > 0 && looksLikeList(usingAt + 2)) || (ident(item[1]) !== undefined && (looksLikeList(2) || (isWord(item[1], 'KEY', 'INDEX') && (looksLikeList(2) || looksLikeList(3)))))));
    if (tableLevel) { deferred.push(item); continue; }
    const c = parseColumn(item);
    if (c) {
      const chk = (c as ErColumnDef & { _check?: string })._check;
      delete (c as ErColumnDef & { _check?: string })._check;
      if (chk) table.checks.push({ expr: chk });
      table.columns.push(c);
    }
  }
  // INHERITS (parent, ...): parent columns come first
  const inh = toks.findIndex((t, k) => k > e && isWord(t, 'INHERITS'));
  if (inh > 0 && isP(toks[inh + 1], '(')) {
    const inherited: ErColumnDef[] = [];
    for (const part of splitTop(toks.slice(inh + 2, closeIdx(toks, inh + 1)))) {
      const pq = qname(part, 0);
      const parent = pq && findTable(schema, pq.name);
      if (!parent) { warnings.push(`INHERITS unknown table ${pq?.name ?? '?'} in ${q.name}`); continue; }
      for (const c of parent.columns) if (!table.columns.some((x) => x.name === c.name) && !inherited.some((x) => x.name === c.name)) inherited.push(structuredClone(c));
    }
    table.columns.unshift(...inherited);
  }
  for (const d of deferred) applyTableConstraint(pending, d, warnings, fkSeq);
  // single-column PRIMARY KEY columns are not "unique" for display
  for (const c of table.columns) if (c.pk && table.columns.filter((x) => x.pk).length === 1) c.unique = false;
  // sqlite: INTEGER PRIMARY KEY is implicitly auto-assigned
  putTable(schema, table);
  return pending;
}

function putTable(schema: ErSchemaDef, table: ErTableDef): void {
  const existing = schema.tables.findIndex((t) => t.name === table.name && t.schema === table.schema);
  if (existing >= 0) schema.tables.splice(existing, 1);
  schema.tables.push(table);
}

/** `LIKE src [INCLUDING ...]`: copy columns (deep clone, no foreign keys); INCLUDING ALL / INDEXES / CONSTRAINTS also copies indexes / checks */
function copyLike(toks: Tok[], schema: ErSchemaDef, table: ErTableDef, warnings: string[]): boolean {
  const q = qname(toks, 1);
  const src = q && findTable(schema, q.name);
  if (!src) { warnings.push(`LIKE unknown table ${q?.name ?? '?'} in ${table.name}`); return false; }
  const incl = toks.slice(q.next).filter((t) => t.k === 'word').map((t) => t.u);
  const all = incl.includes('ALL');
  for (const c of src.columns) {
    const cl = structuredClone(c);
    delete cl.fk;
    if (!table.columns.some((x) => x.name === cl.name)) table.columns.push(cl);
  }
  if (all || incl.includes('INDEXES')) table.indexes.push(...structuredClone(src.indexes));
  if (all || incl.includes('CONSTRAINTS')) table.checks.push(...structuredClone(src.checks));
  return true;
}

function parseAlterType(toks: Tok[], schema: ErSchemaDef, warnings: string[]): void {
  let i = 2;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'EXISTS')) i += 2;
  const q = qname(toks, i);
  if (!q) return;
  const en = schema.enums.find((x) => x.name === q.name);
  if (!en) { warnings.push(`ALTER TYPE on unknown type ${q.name}`); return; }
  i = q.next;
  if (isWord(toks[i], 'ADD') && isWord(toks[i + 1], 'VALUE')) {
    i += 2;
    if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'NOT')) i += 3;
    const v = toks[i];
    if (v?.k !== 'str') return;
    if (en.values.includes(v.v)) return;
    const ref = isWord(toks[i + 1], 'BEFORE', 'AFTER') && toks[i + 2]?.k === 'str' ? en.values.indexOf(toks[i + 2].v) : -1;
    if (ref >= 0) en.values.splice(isWord(toks[i + 1], 'BEFORE') ? ref : ref + 1, 0, v.v);
    else en.values.push(v.v);
  } else if (isWord(toks[i], 'RENAME') && isWord(toks[i + 1], 'VALUE')) {
    const from = toks[i + 2];
    const to = toks[i + 4];
    if (from?.k !== 'str' || to?.k !== 'str' || !isWord(toks[i + 3], 'TO')) return;
    const k = en.values.indexOf(from.v);
    if (k >= 0) en.values[k] = to.v;
  } else if (isWord(toks[i], 'RENAME') && isWord(toks[i + 1], 'TO')) {
    const to = ident(toks[i + 2]);
    if (!to) return;
    const re = new RegExp(`^((?:"?[\\w$]+"?\\.)?)"?${q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?((?:\\[\\d*\\])*)$`, 'i');
    for (const t of schema.tables) for (const c of t.columns) if (re.test(c.type.trim())) c.type = c.type.trim().replace(re, `$1${to}$2`);
    en.name = to;
  }
}

function parseAlterIndex(toks: Tok[], schema: ErSchemaDef): void {
  let i = 2;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'EXISTS')) i += 2;
  const q = qname(toks, i);
  if (!q || !isWord(toks[q.next], 'RENAME') || !isWord(toks[q.next + 1], 'TO')) return;
  const to = ident(toks[q.next + 2]);
  if (!to) return;
  for (const t of schema.tables) for (const x of t.indexes) if (x.name === q.name) x.name = to;
}

function parseAlter(toks: Tok[], schema: ErSchemaDef, warnings: string[], fkSeq: { n: number }): void {
  let i = 1;
  while (i < toks.length && !isWord(toks[i], 'TABLE')) i++;
  i++;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'EXISTS')) i += 2;
  if (isWord(toks[i], 'ONLY')) i++;
  const q = qname(toks, i);
  if (!q) return;
  const table = schema.tables.find((t) => t.name === q.name && (!q.schema || !t.schema || t.schema === q.schema)) ?? findTable(schema, q.name);
  if (!table) { warnings.push(`ALTER TABLE on unknown table ${q.name}`); return; }
  if (isWord(toks[q.next], 'RENAME') && isWord(toks[q.next + 1], 'TO')) {
    const n = qname(toks, q.next + 2);
    if (n) renameTable(schema, table.name, n.name);
    return;
  }
  const colOf = (n: string | undefined) => (n ? table.columns.find((c) => c.name === n) ?? table.columns.find((c) => c.name.toLowerCase() === n.toLowerCase()) : undefined);
  const actions = splitTop(toks.slice(q.next));
  for (const a of actions) {
    if (isWord(a[0], 'DROP')) { alterDrop(table, a, colOf); continue; }
    if (isWord(a[0], 'RENAME')) {
      let j = 1;
      if (isWord(a[j], 'CONSTRAINT')) {
        const from = ident(a[j + 1]);
        const to = ident(a[j + 3]);
        for (const x of [...table.checks, ...table.indexes]) if (x.name === from) x.name = to;
        for (const c of table.columns) if (c.fk && c.fk.name === from) c.fk.name = to;
        continue;
      }
      if (isWord(a[j], 'COLUMN')) j++;
      const c = colOf(ident(a[j]));
      const to = isWord(a[j + 1], 'TO') ? ident(a[j + 2]) : undefined;
      if (c && to) renameColumn(schema, table, c.name, to);
      continue;
    }
    if (isWord(a[0], 'ALTER', 'MODIFY', 'CHANGE')) { alterColumn(a, colOf); continue; }
    if (!isWord(a[0], 'ADD')) continue;
    let j = 1;
    if (isWord(a[j], 'COLUMN')) j++;
    if (isWord(a[j], 'IF') && isWord(a[j + 1], 'NOT')) j += 3;
    const rest = a.slice(j);
    if (isWord(rest[0], 'CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'KEY', 'INDEX')) applyTableConstraint({ table }, rest, warnings, fkSeq);
    else if (ident(rest[0])) {
      const c = parseColumn(rest);
      if (c) {
        const chk = (c as ErColumnDef & { _check?: string })._check;
        delete (c as ErColumnDef & { _check?: string })._check;
        if (chk) table.checks.push({ expr: chk });
        const old = colOf(c.name);
        if (old) Object.assign(old, c);
        else table.columns.push(c);
      }
    }
  }
}

function alterDrop(table: ErTableDef, a: Tok[], colOf: (n: string | undefined) => ErColumnDef | undefined): void {
  let j = 1;
  const what = isWord(a[j], 'COLUMN', 'CONSTRAINT', 'INDEX', 'KEY', 'FOREIGN', 'PRIMARY', 'CHECK', 'DEFAULT', 'NOT') ? a[j].u : 'COLUMN';
  if (what === 'DEFAULT' || what === 'NOT') return; // DROP DEFAULT / DROP NOT NULL only via ALTER COLUMN
  if (what !== 'COLUMN' || isWord(a[j], 'COLUMN')) j++;
  if (what === 'FOREIGN' || what === 'PRIMARY') j++; // KEY
  if (isWord(a[j], 'IF') && isWord(a[j + 1], 'EXISTS')) j += 2;
  const name = ident(a[j]);
  if (what === 'PRIMARY') { for (const c of table.columns) c.pk = false; return; }
  if (what === 'COLUMN') {
    const c = colOf(name);
    if (!c) return;
    table.columns = table.columns.filter((x) => x !== c);
    table.indexes = table.indexes.filter((x) => !x.columns.includes(c.name));
    return;
  }
  if (!name) return;
  table.checks = table.checks.filter((x) => x.name !== name);
  table.indexes = table.indexes.filter((x) => x.name !== name);
  for (const c of table.columns) if (c.fk?.name === name) delete c.fk;
}

function alterColumn(a: Tok[], colOf: (n: string | undefined) => ErColumnDef | undefined): void {
  let j = 1;
  if (isWord(a[j], 'COLUMN')) j++;
  if (a[0].u !== 'ALTER') {
    // MySQL MODIFY col <def> / CHANGE old new <def>
    const old = colOf(ident(a[j]));
    const def = parseColumn(a.slice(a[0].u === 'CHANGE' ? j + 1 : j));
    if (old && def) { delete (def as ErColumnDef & { _check?: string })._check; Object.assign(old, def); }
    return;
  }
  const c = colOf(ident(a[j]));
  if (!c) return;
  const r = a.slice(j + 1);
  if (isWord(r[0], 'ADD') && isWord(r[1], 'GENERATED')) c.generated = 'identity';
  else if (isWord(r[0], 'SET') && isWord(r[1], 'NOT')) c.nullable = false;
  else if (isWord(r[0], 'DROP') && isWord(r[1], 'NOT')) c.nullable = true;
  else if (isWord(r[0], 'DROP') && isWord(r[1], 'DEFAULT')) delete c.default;
  else if (isWord(r[0], 'SET') && isWord(r[1], 'DEFAULT')) c.default = text(r.slice(2));
  else if (isWord(r[0], 'TYPE') || (isWord(r[0], 'SET') && isWord(r[1], 'DATA'))) {
    const k = isWord(r[0], 'TYPE') ? 1 : 3;
    let e = k;
    while (e < r.length && !isWord(r[e], 'USING', 'COLLATE')) e++;
    c.type = text(r.slice(k, e));
  }
}

function renameColumn(schema: ErSchemaDef, table: ErTableDef, from: string, to: string): void {
  const c = table.columns.find((x) => x.name === from);
  if (c) c.name = to;
  for (const ix of table.indexes) ix.columns = ix.columns.map((x) => (x === from ? to : x));
  for (const t of schema.tables) for (const x of t.columns) if (x.fk && x.fk.table === table.name && x.fk.column === from) x.fk.column = to;
}

function renameTable(schema: ErSchemaDef, from: string, to: string): void {
  const t = schema.tables.find((x) => x.name === from);
  if (t) t.name = to;
  for (const x of schema.tables) for (const c of x.columns) if (c.fk?.table === from) c.fk.table = to;
}

function parseDrop(toks: Tok[], schema: ErSchemaDef): void {
  const kind = toks[1]?.u;
  let i = 2;
  if (isWord(toks[i], 'CONCURRENTLY')) i++;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'EXISTS')) i += 2;
  const names = splitTop(toks.slice(i)).map((p) => qname(p, 0)?.name).filter((n): n is string => !!n);
  for (const n of names) {
    if (kind === 'TABLE' || kind === 'VIEW') schema.tables = schema.tables.filter((t) => t.name !== n);
    else if (kind === 'INDEX') for (const t of schema.tables) t.indexes = t.indexes.filter((x) => x.name !== n);
    else if (kind === 'TYPE') schema.enums = schema.enums.filter((e) => e.name !== n);
  }
}

/** Migration files (goose / dbmate / sql-migrate) carry rollback sections; keep only the "up" parts. */
export function stripDownMigrations(sql: string): string {
  const marker = /^[ \t]*--[ \t]*(?:\+goose|\+migrate|migrate:)[ \t]*(up|down)\b.*$/gim;
  if (!marker.test(sql)) return sql;
  marker.lastIndex = 0;
  let out = '';
  let keep = true;
  let last = 0;
  for (let m = marker.exec(sql); m; m = marker.exec(sql)) {
    if (keep) out += sql.slice(last, m.index);
    keep = m[1].toLowerCase() === 'up';
    last = m.index + m[0].length;
  }
  if (keep) out += sql.slice(last);
  return out;
}

function parseCreateIndex(toks: Tok[], schema: ErSchemaDef): void {
  let i = 1;
  let unique = false;
  if (isWord(toks[i], 'UNIQUE')) { unique = true; i++; }
  if (isWord(toks[i], 'FULLTEXT', 'SPATIAL')) i++;
  i++; // INDEX
  if (isWord(toks[i], 'CONCURRENTLY')) i++;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'NOT')) i += 3;
  let name: string | undefined;
  if (!isWord(toks[i], 'ON')) {
    const q = qname(toks, i);
    name = q?.name;
    i = q?.next ?? i + 1;
  }
  if (!isWord(toks[i], 'ON')) return;
  i++;
  if (isWord(toks[i], 'ONLY')) i++;
  const tq = qname(toks, i);
  if (!tq) return;
  const table = findTable(schema, tq.name);
  if (!table) return;
  i = tq.next;
  let using: string | undefined;
  if (isWord(toks[i], 'USING')) { using = toks[i + 1]?.v; i += 2; }
  if (!isP(toks[i], '(')) return;
  const e = closeIdx(toks, i);
  const columns = identList(toks.slice(i + 1, e));
  let where: string | undefined;
  const w = toks.findIndex((t, k) => k > e && isWord(t, 'WHERE'));
  if (w > 0) where = text(toks.slice(w + 1));
  const single = columns.length === 1 && !where ? table.columns.find((c) => c.name === columns[0]) : undefined;
  if (unique && single && !using && !name?.startsWith('__')) single.unique = true;
  table.indexes.push({ ...(name ? { name } : {}), columns, unique, ...(using ? { using } : {}), ...(where ? { where } : {}) });
}

function parseCreateType(toks: Tok[], schema: ErSchemaDef): void {
  let i = 1;
  i++; // TYPE
  const q = qname(toks, i);
  if (!q) return;
  i = q.next;
  if (!isWord(toks[i], 'AS') || !isWord(toks[i + 1], 'ENUM') || !isP(toks[i + 2], '(')) return;
  const e = closeIdx(toks, i + 2);
  const values = toks.slice(i + 3, e).filter((t) => t.k === 'str').map((t) => t.v);
  schema.enums = schema.enums.filter((x) => x.name !== q.name);
  schema.enums.push({ name: q.name, values });
}

function parseCreateView(toks: Tok[], schema: ErSchemaDef): void {
  let i = 1;
  while (i < toks.length && !isWord(toks[i], 'VIEW')) i++;
  i++;
  if (isWord(toks[i], 'IF') && isWord(toks[i + 1], 'NOT')) i += 3;
  const q = qname(toks, i);
  if (!q) return;
  i = q.next;
  const cols: string[] = [];
  if (isP(toks[i], '(')) {
    const e = closeIdx(toks, i);
    cols.push(...identList(toks.slice(i + 1, e)));
    i = e + 1;
  }
  if (!cols.length) {
    // select list: take the alias / last identifier of each simple item
    const as = toks.findIndex((t, k) => k >= i && isWord(t, 'AS'));
    const sel = as >= 0 ? as + 1 : i;
    if (isWord(toks[sel], 'SELECT')) {
      const from = toks.findIndex((t, k) => k > sel && isWord(t, 'FROM'));
      const list = splitTop(toks.slice(sel + 1, from < 0 ? undefined : from));
      for (const item of list) {
        const last = item[item.length - 1];
        if (!last || item.some((t) => isP(t, '*'))) continue;
        const nm = ident(last);
        if (nm) cols.push(nm);
      }
    }
  }
  const view = newTable(q.name, cols.map((c) => newColumn(c, '', { nullable: true })), { kind: 'view', ...(q.schema ? { schema: q.schema } : {}) });
  schema.tables = schema.tables.filter((t) => t.name !== view.name);
  schema.tables.push(view);
}

function parseComment(toks: Tok[], schema: ErSchemaDef): void {
  // COMMENT ON TABLE t IS '...' / COMMENT ON COLUMN t.c IS '...'
  const kind = toks[2]?.u;
  const q = qname(toks, 3);
  if (!q) return;
  const is = toks.findIndex((t) => isWord(t, 'IS'));
  const val = toks[is + 1]?.k === 'str' ? toks[is + 1].v : undefined;
  if (val === undefined) return;
  if (kind === 'TABLE') { const t = findTable(schema, q.name); if (t) t.comment = val; }
  else if (kind === 'COLUMN') {
    // qname swallowed table.col as schema.name -> name = col, schema = table (or 3 parts)
    const parts: string[] = [];
    for (let j = 3; j < is; j++) if (ident(toks[j])) parts.push(toks[j].v);
    const colName = parts[parts.length - 1];
    const tName = parts[parts.length - 2];
    const t = tName ? findTable(schema, tName) : undefined;
    const c = t?.columns.find((x) => x.name === colName);
    if (c) c.comment = val;
  }
}

/** Resolve empty FK targets to the parent's primary key, and propagate a sole-PK column's type if missing. */
function resolveFks(schema: ErSchemaDef, warnings: string[]): void {
  for (const t of schema.tables) {
    for (const c of t.columns) {
      if (!c.fk) continue;
      const parent = findTable(schema, c.fk.table);
      if (!parent) { warnings.push(`${t.name}.${c.name} references unknown table ${c.fk.table}`); continue; }
      c.fk.table = parent.name;
      if (!c.fk.column) {
        const pks = parent.columns.filter((x) => x.pk);
        c.fk.column = pks.length === 1 ? pks[0].name : pks[t.columns.filter((x) => x.fk?.table === parent.name && x.fk.group === c.fk!.group).indexOf(c)]?.name ?? pks[0]?.name ?? '';
      }
    }
  }
}

export function detectDialect(sql: string): Dialect {
  if (/`[^`]+`|\bENGINE\s*=|\bAUTO_INCREMENT\b|\bUNSIGNED\b|\bCHARSET\b/i.test(sql)) return 'mysql';
  if (/\bAUTOINCREMENT\b|\bPRAGMA\b|\bWITHOUT\s+ROWID\b|\bSTRICT\b\s*;/i.test(sql)) return 'sqlite';
  return 'postgres';
}

/** Parse SQL DDL (PostgreSQL, MySQL / MariaDB, SQLite) into the ER model. Unknown statements are skipped. */
export function parseSql(sql: string): ErParseResult & { dialect: Dialect } {
  const schema = emptySchema();
  const warnings: string[] = [];
  const fkSeq = { n: 0 };
  const toks = tokenize(stripDownMigrations(sql));
  for (const st of statements(toks)) {
    const h = st[0];
    if (!h || h.k !== 'word') continue;
    try {
      if (h.u === 'CREATE') {
        const w = st.slice(1, 8).map((t) => t.u);
        if (w.includes('TABLE') && !w.includes('INDEX') && !w.includes('VIEW')) parseCreateTable(st, schema, warnings, fkSeq);
        else if (w.includes('VIEW')) parseCreateView(st, schema);
        else if (w.includes('INDEX') && !w.includes('TABLE')) parseCreateIndex(st, schema);
        else if (w[0] === 'TYPE' || (w[0] === 'OR' && w.includes('TYPE'))) parseCreateType(st, schema);
      } else if (h.u === 'ALTER' && isWord(st[1], 'TABLE')) parseAlter(st, schema, warnings, fkSeq);
      else if (h.u === 'ALTER' && isWord(st[1], 'TYPE')) parseAlterType(st, schema, warnings);
      else if (h.u === 'ALTER' && isWord(st[1], 'INDEX')) parseAlterIndex(st, schema);
      else if (h.u === 'DROP') parseDrop(st, schema);
      else if (h.u === 'COMMENT' && isWord(st[1], 'ON')) parseComment(st, schema);
    } catch (err) {
      warnings.push(`Failed: ${text(st).slice(0, 60)} (${(err as Error).message})`);
    }
  }
  resolveFks(schema, warnings);
  return { schema, warnings, dialect: detectDialect(sql) };
}
