import { stripComment, tokenize, type Tok } from './lex';
import { parseTimingLine } from './parseTiming';
import { inClassBody, parseUmlLine, UML_BLOCKS, validateUml, describeFrame, type UmlBlock, type UmlCtx } from './parse2';
import { emptyDoc, type Diagnostic, type DslColumn, type DslDoc, type DslSeq, type DslTiming, type DslSeqItem, type DslTable, type RefOp, type SeqKindText } from './types';

export interface ParseResult { doc: DslDoc; diagnostics: Diagnostic[] }

const ARROWS = new Set(['->', '<->', '--', '<-']);
const REF_OPS = new Set(['>', '<', '-', '<>']);
const SEQ_KINDS = new Set(['participant', 'actor', 'boundary', 'control', 'entity', 'database']);
const FRAG_OPS = new Set(['alt', 'opt', 'loop', 'par', 'break', 'critical']);
const SECTION_WORDS: Record<string, string> = { else: 'alt', and: 'par', option: 'critical' };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seq';

type Ctx =
  | { kind: 'group'; id: string }
  | { kind: 'table'; table: DslTable }
  | { kind: 'indexes'; table: DslTable }
  | UmlCtx
  | { kind: 'timing'; tm: DslTiming }
  | { kind: 'seq'; seq: DslSeq; stack: { op: 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical'; sections: { guard: string; items: DslSeqItem[] }[] }[] };

/** key=value / flag attributes starting at toks[from]; returns the attrs and the first token it could not use */
function parseAttrs(toks: Tok[], from: number, err: (t: Tok, m: string) => void): Record<string, string> {
  const out: Record<string, string> = {};
  let i = from;
  while (i < toks.length) {
    const t = toks[i];
    if (t.k === 'sym' && t.v === ',') { i++; continue; }
    if (t.k !== 'word' && t.k !== 'str') { err(t, `unexpected "${t.v}"`); i++; continue; }
    if (toks[i + 1]?.k === 'sym' && toks[i + 1].v === '=') {
      const v = toks[i + 2];
      if (!v || (v.k === 'sym')) { err(t, `missing value for "${t.v}"`); i += 2; continue; }
      // x=10,20 style values: glue number lists
      let val = v.v;
      while (toks[i + 3]?.k === 'sym' && toks[i + 3].v === ',' && toks[i + 4] && /^-?\d/.test(toks[i + 4].v) && /^-?\d/.test(val)) { val += ',' + toks[i + 4].v; i += 2; }
      out[t.v] = val;
      i += 3;
    } else {
      out[t.v] = 'true';
      i++;
    }
  }
  return out;
}

const splitTop = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let q = '';
  let cur = '';
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const unq = (s: string): string => {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) || (t.startsWith('`') && t.endsWith('`'))) return t.slice(1, -1).replace(/\\(.)/g, '$1');
  return t;
};

function parseEnd(s: string): { table: string; column: string } | null {
  const m = /^\s*("[^"]+"|[^\s.]+)\s*\.\s*("[^"]+"|[^\s.]+)\s*$/.exec(s);
  return m ? { table: unq(m[1]), column: unq(m[2]) } : null;
}

export function parseDsl(text: string): ParseResult {
  const doc = emptyDoc();
  const diagnostics: Diagnostic[] = [];
  const diag = (line: number, col: number, message: string, severity: Diagnostic['severity'] = 'error') => diagnostics.push({ line, col, message, severity });
  const stack: Ctx[] = [];
  const ids = new Set<string>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const top = (): Ctx | undefined => stack[stack.length - 1];

  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const hdr = /^#!sdd(?:\s+(\d+))?\s*$/.exec(trimmed);
    if (hdr) {
      if (ln !== 1 && !doc.header) diag(ln, 1, 'the #!sdd header must be the first line', 'warning');
      doc.header = true;
      if (hdr[1]) doc.version = Number(hdr[1]);
      return;
    }
    const ctx = top();
    if (trimmed.startsWith('#') && !inClassBody(ctx?.kind === 'uml' ? ctx : undefined)) return;
    const src = stripComment(raw);
    if (!src.trim()) return;

    // ---- sequence block: line oriented, like Mermaid ----
    if (ctx?.kind === 'seq') return parseSeqLine(ctx, src.trim(), ln, diag, stack);
    if (ctx?.kind === 'uml') return parseUmlLine(ctx, src, ln, doc, diag, ids, stack);
    if (ctx?.kind === 'timing') { if (parseTimingLine(ctx.tm, src, ln, diag)) stack.pop(); return; }

    const lex = tokenize(src);
    if (lex.error) return diag(ln, lex.error.col, lex.error.message);
    const toks = lex.toks;
    const err = (t: Tok, m: string) => diag(ln, t.col, m);
    if (!toks.length) return;

    if (toks.length === 1 && toks[0].v === '}' && toks[0].k === 'sym') {
      if (!stack.length) diag(ln, toks[0].col, 'unexpected "}"');
      else stack.pop();
      return;
    }

    // ---- table body ----
    if (ctx?.kind === 'table') {
      const body = src.trim();
      if (ctx.table.kind === 'enum') {
        const v = unq(body.replace(/\s*\[.*\]\s*$/, ''));
        if (v) ctx.table.columns.push({ name: v, type: '', pk: false, unique: false, notNull: true, increment: false, line: ln });
        return;
      }
      if (/^indexes\s*\{$/i.test(body)) { stack.push({ kind: 'indexes', table: ctx.table }); return; }
      const note = /^note\s*:\s*(.+)$/i.exec(body);
      if (note) { ctx.table.note = unq(note[1]); return; }
      const col = parseColumn(body, ln, (c, m) => diag(ln, c, m));
      if (col) {
        if (ctx.table.columns.some((c) => c.name === col.name)) diag(ln, 1, `duplicate column "${col.name}" in table ${ctx.table.name}`);
        else ctx.table.columns.push(col);
      }
      return;
    }
    if (ctx?.kind === 'indexes') {
      const m = /^(\([^)]*\)|[^\s\[]+)\s*(?:\[(.*)\])?\s*$/.exec(src.trim());
      if (!m) return diag(ln, 1, 'expected: column  or  (a, b) [unique, name: "x"]');
      const cols = m[1].startsWith('(') ? splitTop(m[1].slice(1, -1)).map(unq) : [unq(m[1])];
      const attrs = splitTop(m[2] ?? '');
      ctx.table.indexes.push({ columns: cols, unique: attrs.some((a) => a.toLowerCase() === 'unique'), ...(() => { const n = attrs.find((a) => /^name\s*:/i.test(a)); return n ? { name: unq(n.replace(/^name\s*:\s*/i, '')) } : {}; })() });
      return;
    }

    // ---- root / group statements ----
    const first = toks[0];
    const opensBlock = toks[toks.length - 1].k === 'sym' && toks[toks.length - 1].v === '{';
    const kw = first.k === 'word' ? first.v : '';

    if (kw === 'diagram' || kw === 'page') {
      const t = toks[1];
      if (!t || t.k === 'sym') return err(first, `${kw} needs a title, e.g. ${kw} "My system"`);
      doc.title = t.v;
      return;
    }
    if (kw === 'node' || kw === 'group') {
      const idTok = toks[1];
      if (!idTok || idTok.k === 'sym') return err(first, `${kw} needs an id, e.g. ${kw} api "API"`);
      const id = idTok.v;
      let i = 2;
      let label = id;
      if (toks[i] && toks[i].k === 'str') label = toks[i++].v;
      const end = opensBlock ? toks.length - 1 : toks.length;
      const attrs = parseAttrs(toks.slice(0, end), i, err);
      if (opensBlock && kw === 'node') err(toks[toks.length - 1], 'only groups can contain nodes');
      if (ids.has(id)) { diag(ln, idTok.col, `duplicate id "${id}"`); }
      else ids.add(id);
      const parentCtx = [...stack].reverse().find((c): c is Extract<Ctx, { kind: 'group' }> => c.kind === 'group');
      const { icon, sub, ...rest } = attrs;
      doc.nodes.push({ id, label, kind: kw, ...(icon ? { icon } : {}), ...(sub ? { sub } : {}), ...(parentCtx ? { parent: parentCtx.id } : {}), attrs: rest, line: ln });
      if (opensBlock && kw === 'group') stack.push({ kind: 'group', id });
      return;
    }
    if (kw === 'table' || kw === 'enum' || kw === 'view') {
      if (ctx) err(first, `${kw} blocks must be at the top level`);
      const nameTok2 = toks[1];
      if (!nameTok2 || nameTok2.k === 'sym') return err(first, `${kw} needs a name, e.g. ${kw} users {`);
      if (!opensBlock) return err(toks[toks.length - 1], `expected "{" after the ${kw} name`);
      const table: DslTable = { name: nameTok2.v, kind: kw, columns: [], indexes: [], line: ln };
      if (doc.tables.some((t) => t.name === table.name)) diag(ln, nameTok2.col, `duplicate table "${table.name}"`);
      else doc.tables.push(table);
      stack.push({ kind: 'table', table });
      return;
    }
    if (kw === 'ref') {
      const body = src.trim().replace(/^ref\s*:?\s*/i, '');
      const m = /^(.+?)\s+(<>|>|<|-)\s+(.+?)(?:\s*\[(.*)\])?\s*$/.exec(body);
      const a = m && parseEnd(m[1]);
      const b = m && parseEnd(m[3]);
      if (!m || !a || !b) return err(first, 'expected: ref: orders.user_id > users.id');
      const attrs: Record<string, string> = {};
      for (const p of splitTop(m[4] ?? '')) { const kv = /^(\w+)\s*:\s*(.+)$/.exec(p); if (kv) attrs[kv[1]] = unq(kv[2]); }
      doc.refs.push({ from: a, op: m[2] as RefOp, to: b, attrs, line: ln });
      return;
    }
    if (UML_BLOCKS.has(kw) && toks.length === 2 && opensBlock) {
      if (ctx) err(first, `${kw} blocks must be at the top level`);
      stack.push({ kind: 'uml', block: kw as UmlBlock, frames: [], line: ln });
      return;
    }
    if (kw === 'timing') {
      if (!opensBlock) return err(first, 'expected: timing id "Title" {');
      let i = 1;
      let id = '';
      let title = '';
      if (toks[i]?.k === 'word') id = toks[i++].v;
      if (toks[i]?.k === 'str') title = toks[i++].v;
      if (!title) title = id || 'Timing';
      if (!id) id = `timing-${slug(title)}`;
      const tm: DslTiming = { id, title, unit: '', lifelines: [], changes: [], messages: [], constraints: [], line: ln };
      if (doc.timings.some((x) => x.id === id)) diag(ln, first.col, `duplicate timing "${id}"`);
      else doc.timings.push(tm);
      stack.push({ kind: 'timing', tm });
      return;
    }
    if (kw === 'seq') {
      if (!opensBlock) return err(first, 'expected: seq "Title" {');
      let i = 1;
      let id = '';
      let title = '';
      if (toks[i]?.k === 'word') id = toks[i++].v;
      if (toks[i]?.k === 'str') title = toks[i++].v;
      if (!title) title = id || 'Sequence';
      if (!id) id = `seq-${slug(title)}`;
      const seq: DslSeq = { id, title, participants: [], items: [], autonumber: false, line: ln };
      if (doc.seqs.some((s) => s.id === id)) diag(ln, first.col, `duplicate sequence "${id}"`);
      else doc.seqs.push(seq);
      stack.push({ kind: 'seq', seq, stack: [] });
      return;
    }

    // ---- edge:  a -> b "label" attrs ----
    if (toks.length >= 3 && ARROWS.has(toks[1].v) && toks[1].k === 'word') {
      const from = toks[0].v;
      const to = toks[2].v;
      let i = 3;
      let label: string | undefined;
      if (toks[i]?.k === 'str') label = toks[i++].v;
      const attrs = parseAttrs(toks, i, err);
      doc.edges.push({ from, to, ...(label ? { label } : {}), arrow: toks[1].v as '->', attrs, line: ln });
      return;
    }
    if (REF_OPS.has(toks[1]?.v) && toks[0].k === 'word' && toks[0].v.includes('.')) return err(toks[0], 'relations are written: ref: a.col > b.col');
    err(first, `unknown statement "${first.v}"`);
  });

  if (stack.length) {
    const c = stack[stack.length - 1];
    const what = c.kind === 'group' ? `group "${c.id}"` : c.kind === 'seq' ? `seq "${c.seq.title}"` : c.kind === 'timing' ? `timing "${c.tm.title}"` : c.kind === 'uml' ? describeFrame(c) : c.kind === 'table' || c.kind === 'indexes' ? `table "${c.table.name}"` : 'block';
    diag(lines.length, 1, `missing "}" to close ${what}`);
  }
  validateRefs(doc, diag);
  validateUml(doc, diag);
  return { doc, diagnostics };
}

function parseColumn(body: string, _ln: number, bad: (col: number, m: string) => void): DslColumn | null {
  const m = /^("[^"]+"|`[^`]+`|[^\s\[]+)\s+([^\[]*?)\s*(?:\[(.*)\])?\s*$/.exec(body);
  if (!m || !m[2]) {
    bad(1, 'expected a column:  name type [pk, not null, unique, default: x, ref: > table.col]');
    return null;
  }
  const col: DslColumn = { name: unq(m[1]), type: m[2].trim(), pk: false, unique: false, notNull: false, increment: false, line: _ln };
  for (const a of splitTop(m[3] ?? '')) {
    const low = a.toLowerCase();
    if (low === 'pk' || low === 'primary key') col.pk = true;
    else if (low === 'unique') col.unique = true;
    else if (low === 'not null') col.notNull = true;
    else if (low === 'null') col.notNull = false;
    else if (low === 'increment' || low === 'autoincrement') col.increment = true;
    else if (/^default\s*:/i.test(a)) col.default = unq(a.replace(/^default\s*:\s*/i, ''));
    else if (/^note\s*:/i.test(a)) col.note = unq(a.replace(/^note\s*:\s*/i, ''));
    else if (/^ref\s*:/i.test(a)) {
      const r = /^ref\s*:\s*(<>|>|<|-)\s*(.+)$/i.exec(a);
      const to = r && parseEnd(r[2]);
      if (!r || !to) bad(1, 'expected ref: > table.column');
      else col.ref = { op: r[1] as RefOp, to };
    } else bad(1, `unknown column attribute "${a}"`);
  }
  return col;
}

function validateRefs(doc: DslDoc, diag: (l: number, c: number, m: string, s?: Diagnostic['severity']) => void): void {
  const ids = new Set(doc.nodes.map((n) => n.id));
  doc.edges = doc.edges.filter((e) => {
    for (const end of [e.from, e.to]) if (!ids.has(end)) { diag(e.line, 1, `unknown node "${end}"`); return false; }
    return true;
  });
  const cols = new Map(doc.tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  const checkEnd = (e: { table: string; column: string }, line: number): boolean => {
    const c = cols.get(e.table);
    if (!c) { diag(line, 1, `unknown table "${e.table}"`); return false; }
    if (!c.has(e.column)) { diag(line, 1, `unknown column "${e.table}.${e.column}"`); return false; }
    return true;
  };
  doc.refs = doc.refs.filter((r) => checkEnd(r.from, r.line) && checkEnd(r.to, r.line));
  for (const t of doc.tables)
    for (const c of t.columns)
      if (c.ref && !checkEnd(c.ref.to, c.line)) delete c.ref;
}

// ---------------------------------------------------------------------------------------------------------------------
function parseSeqLine(ctx: Extract<Ctx, { kind: 'seq' }>, s: string, ln: number, diag: (l: number, c: number, m: string, sev?: Diagnostic['severity']) => void, stack: Ctx[]): void {
  const seq = ctx.seq;
  const cur = (): DslSeqItem[] => (ctx.stack.length ? ctx.stack[ctx.stack.length - 1].sections.slice(-1)[0].items : seq.items);
  const ensure = (id: string): void => {
    if (!seq.participants.some((p) => p.id === id)) seq.participants.push({ id, name: id, kind: 'participant' });
  };
  if (s === '}') {
    if (ctx.stack.length) diag(ln, 1, `missing "end" for ${ctx.stack[ctx.stack.length - 1].op}`);
    stack.pop();
    return;
  }
  if (/^autonumber$/i.test(s)) { seq.autonumber = true; return; }
  // a trailing `model=<id>` links the participant to a shared class model (ids are [A-Za-z0-9_.-])
  const modelM = /^(participant|actor|boundary|control|entity|database)\s.*\s+model=([A-Za-z0-9_.-]+)$/i.exec(s);
  const modelId = modelM ? modelM[2] : undefined;
  if (modelM) s = s.slice(0, s.length - modelM[2].length - 'model='.length).trimEnd();
  let m = /^(participant|actor|boundary|control|entity|database)\s+("[^"]+"|\S+)(?:\s+as\s+(.+))?$/i.exec(s);
  if (m && SEQ_KINDS.has(m[1].toLowerCase())) {
    const id = unq(m[2]);
    const name = m[3] ? unq(m[3]) : id;
    const kind = m[1].toLowerCase() as SeqKindText;
    const ex = seq.participants.find((p) => p.id === id);
    if (ex) { ex.name = name; ex.kind = kind; if (modelId) ex.modelId = modelId; else delete ex.modelId; } else seq.participants.push({ id, name, kind, ...(modelId ? { modelId } : {}) });
    return;
  }
  m = /^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(s);
  if (m) {
    const over = m[2].split(',').map((x) => unq(x.trim())).filter(Boolean);
    if (!over.length || over.length > 2) return diag(ln, 1, 'a note sits over one or two participants');
    over.forEach(ensure);
    const side = m[1].toLowerCase().startsWith('left') ? 'left' : m[1].toLowerCase().startsWith('right') ? 'right' : undefined;
    cur().push({ type: 'note', over, text: m[3], ...(side ? { side } : {}) });
    return;
  }
  m = /^(\w+)(?:\s+(.*))?$/.exec(s);
  if (m && FRAG_OPS.has(m[1].toLowerCase()) && !/->|-x/.test(s.split(':')[0])) {
    ctx.stack.push({ op: m[1].toLowerCase() as never, sections: [{ guard: (m[2] ?? '').trim(), items: [] }] });
    return;
  }
  if (m && SECTION_WORDS[m[1].toLowerCase()] && ctx.stack.length) {
    const f = ctx.stack[ctx.stack.length - 1];
    if (f.op !== SECTION_WORDS[m[1].toLowerCase()] && !(m[1].toLowerCase() === 'else' && ['alt', 'opt', 'loop', 'break'].includes(f.op))) diag(ln, 1, `"${m[1]}" does not belong in ${f.op}`, 'warning');
    f.sections.push({ guard: (m[2] ?? '').trim(), items: [] });
    return;
  }
  if (/^end$/i.test(s)) {
    const f = ctx.stack.pop();
    if (!f) return diag(ln, 1, '"end" without an open alt/opt/loop/par/break/critical');
    cur().push({ type: 'fragment', op: f.op, sections: f.sections });
    return;
  }
  m = /^("[^"]+"|[^\s:]+)\s*(-->>|-->|->>|->|-x)\s*("[^"]+"|[^\s:]+)\s*(?::\s*(.*))?$/.exec(s);
  if (m) {
    const from = unq(m[1]);
    const to = unq(m[3]);
    ensure(from);
    ensure(to);
    const kind = m[2] === '->' ? 'sync' : m[2] === '->>' ? 'async' : m[2] === '-x' ? 'destroy' : m[2] === '-->>' ? 'create' : 'return';
    cur().push({ type: 'message', from, to, text: m[4] ?? '', kind });
    return;
  }
  diag(ln, 1, `cannot read sequence statement "${s.slice(0, 40)}"`);
}
