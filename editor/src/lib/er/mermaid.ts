// Mermaid(), relationships() and mermaidType() in internal/ddl/render.go.
import { cardinalityOf, isOptionalFk } from './cardinality';
import { emptySchema, findTable, newColumn, newTable, type Cardinality, type ErParseResult, type ErSchemaDef } from './types';

const ident = (s: string) => (s ? s.replace(/[^A-Za-z0-9_]/g, '_') : 'unnamed');
const mtype = (t: string) => ident((t || 'unknown').split(/[( ]/)[0] || 'unknown');

/** left-hand token (source end) and right-hand token (target end) for a relation */
function tokens(card: Cardinality, optional: boolean, manyRequired?: boolean): [string, string] {
  const one = optional ? '|o' : '||';
  const many = manyRequired ? '|{' : 'o{';
  const manyL = manyRequired ? '}|' : '}o';
  switch (card) {
    case '1:1': return [one, manyRequired ? '||' : 'o|'];
    case '1:N': return [one, many];
    case 'N:1': return [manyL, optional ? 'o|' : '||'];
    default: return [manyL, many];
  }
}

export function renderMermaid(s: ErSchemaDef): string {
  const out = ['erDiagram'];
  for (const t of s.tables) {
    out.push(`  ${ident(t.name)} {`);
    for (const c of t.columns) {
      const marks = [c.pk ? 'PK' : '', c.fk ? 'FK' : '', c.unique && !c.pk ? 'UK' : ''].filter(Boolean).join(',');
      out.push(`    ${mtype(c.type)} ${ident(c.name)}${marks ? ' ' + marks : ''}${c.comment ? ` "${c.comment.replace(/"/g, "'")}"` : ''}`);
    }
    out.push('  }');
  }
  const rels: string[] = [];
  for (const t of s.tables) {
    const seen = new Set<string>();
    for (const c of t.columns) {
      if (!c.fk) continue;
      const k = c.fk.group ?? c.name;
      if (seen.has(k)) continue;
      seen.add(k);
      const cols = c.fk.group ? t.columns.filter((x) => x.fk?.group === c.fk!.group) : [c];
      const [l, r] = tokens(cardinalityOf(t, cols), isOptionalFk(cols), c.fk.manyRequired);
      const line = c.fk.identifying ?? cols.every((x) => x.pk) ? '--' : '..';
      rels.push(`  ${ident(c.fk.table)} ${l}${line}${r} ${ident(t.name)} : ${ident(c.fk.label ?? c.name)}`);
    }
  }
  for (const l of s.loose) {
    const [a, b] = tokens(l.cardinality, false);
    rels.push(`  ${ident(l.from)} ${a}${l.identifying ? '--' : '..'}${b} ${ident(l.to)} : ${ident(l.label ?? 'relates')}`);
  }
  return [...out, ...rels.sort()].join('\n') + '\n';
}

type End = { many: boolean; optional: boolean };
const endOf = (tok: string): End | null => {
  if (tok === '||') return { many: false, optional: false };
  if (tok === '|o' || tok === 'o|') return { many: false, optional: true };
  if (tok === '}o' || tok === 'o{') return { many: true, optional: true };
  if (tok === '}|' || tok === '|{') return { many: true, optional: false };
  return null;
};

/** Parse a Mermaid erDiagram. Relations become foreign-key columns on the "many" (or second) side. */
export function parseMermaid(src: string): ErParseResult {
  const schema = emptySchema();
  const warnings: string[] = [];
  const lines = src.replace(/%%.*$/gm, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !/^erDiagram\b/i.test(lines[0])) warnings.push('Missing "erDiagram" header');
  const unq = (s: string) => s.replace(/^"|"$/g, '');
  const ensure = (name: string) => {
    let t = findTable(schema, name);
    if (!t) { t = newTable(name); schema.tables.push(t); }
    return t;
  };
  const rels: { a: string; b: string; l: End; r: End; identifying: boolean; label: string }[] = [];
  let cur: ReturnType<typeof newTable> | null = null;
  for (const line of lines.slice(1)) {
    if (cur) {
      if (line === '}') { cur = null; continue; }
      const m = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?\s*$/.exec(line);
      if (!m) { warnings.push(`Unreadable attribute: ${line}`); continue; }
      const marks = (m[3] ?? '').split(/\s*,\s*/);
      const col = newColumn(m[2], m[1], { pk: marks.includes('PK'), unique: marks.includes('UK'), nullable: !marks.includes('PK'), ...(m[4] ? { comment: m[4] } : {}) });
      if (marks.includes('FK')) col.fk = { table: '', column: '' };
      cur.columns.push(col);
      continue;
    }
    const ent = /^("[^"]+"|[\w.-]+)(?:\s*\[[^\]]*\])?\s*\{\s*$/.exec(line);
    if (ent) { cur = ensure(unq(ent[1])); continue; }
    const rel = /^("[^"]+"|[\w.-]+)\s+([|}o][|o{]|[|o][|o])\s*(--|\.\.)\s*([|o][|o]|[|o{][|o{]|o\{|\|\{)\s+("[^"]+"|[\w.-]+)\s*(?::\s*(.*))?$/.exec(line);
    const rel2 = rel ?? /^("[^"]+"|[\w.-]+)\s+(\S{2})(--|\.\.)(\S{2})\s+("[^"]+"|[\w.-]+)\s*(?::\s*(.*))?$/.exec(line);
    if (rel2) {
      const l = endOf(rel2[2]);
      const r = endOf(rel2[4]);
      if (!l || !r) { warnings.push(`Unknown relation symbol: ${line}`); continue; }
      ensure(unq(rel2[1]));
      ensure(unq(rel2[5]));
      rels.push({ a: unq(rel2[1]), b: unq(rel2[5]), l, r, identifying: rel2[3] === '--', label: unq((rel2[6] ?? '').trim()) });
      continue;
    }
    if (/^(\w+|"[^"]+")$/.test(line)) { ensure(unq(line)); continue; }
    warnings.push(`Skipped: ${line}`);
  }
  // relations -> FK columns (child = the many side; for 1:1 / many-many-less cases the second entity)
  for (const r of rels) {
    if (r.l.many && r.r.many) { schema.loose.push({ from: r.a, to: r.b, cardinality: 'N:M', identifying: r.identifying, ...(r.label ? { label: r.label } : {}) }); continue; }
    const aIsParent = !r.l.many; // left end is "one"
    const parentName = aIsParent ? r.a : r.b;
    const childName = aIsParent ? r.b : r.a;
    const oneEnd = aIsParent ? r.l : r.r;
    const manyEnd = aIsParent ? r.r : r.l;
    const parent = ensure(parentName);
    const child = ensure(childName);
    let pk = parent.columns.find((c) => c.pk);
    if (!pk) { pk = newColumn('id', 'int', { pk: true, nullable: false }); parent.columns.unshift(pk); }
    const labelCol = r.label && child.columns.find((c) => c.name === r.label);
    const declared = labelCol || child.columns.find((c) => c.fk && !c.fk.table && (c.name === `${parentName}_${pk!.name}` || c.name.toLowerCase().startsWith(parentName.toLowerCase().replace(/s$/, ''))))
      || child.columns.find((c) => c.fk && !c.fk.table);
    let col = declared;
    if (!col) {
      col = newColumn(`${parentName.toLowerCase().replace(/s$/, '')}_${pk.name}`, pk.type, {});
      child.columns.push(col);
    }
    col.fk = { table: parentName, column: pk.name, identifying: r.identifying, ...(!manyEnd.optional ? { manyRequired: true } : {}), ...(r.label && r.label !== col.name ? { label: r.label } : {}) };
    col.nullable = col.pk ? false : oneEnd.optional;
    if (!manyEnd.many) col.unique = true;
  }
  for (const t of schema.tables) for (const c of t.columns) if (c.fk && !c.fk.table) { warnings.push(`${t.name}.${c.name} is marked FK but no relation uses it`); c.fk = undefined; }
  return { schema, warnings };
}
