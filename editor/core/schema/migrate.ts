import type { Dialect, Schema, SchemaColumn, SchemaFk, SchemaIndex, SchemaTable } from './types';

type Change = 'type' | 'nullable' | 'default' | 'generated';
export interface ColumnAlter { name: string; from: SchemaColumn; to: SchemaColumn; changes: Change[] }
export interface PossibleRename { from: string; to: string }
export interface TableDiff {
  name: string;
  prev: SchemaTable;
  next: SchemaTable;
  /** the table was renamed (prev.name -> next.name) */
  renamed: boolean;
  addedColumns: SchemaColumn[];
  droppedColumns: SchemaColumn[];
  renamedColumns: { from: SchemaColumn; to: SchemaColumn }[];
  /** dropped + added columns of the same shape where the pairing is not unique: kept as drop + add */
  possibleRenames: PossibleRename[];
  alteredColumns: ColumnAlter[];
  pk: { from: string[]; to: string[] } | null;
  uniqueAdded: string[];
  uniqueDropped: string[];
  addedIndexes: SchemaIndex[];
  droppedIndexes: SchemaIndex[];
  addedFks: { column: string; fk: SchemaFk }[];
  droppedFks: { column: string; fk: SchemaFk }[];
}
export interface SchemaDiff {
  addedTables: SchemaTable[];
  droppedTables: SchemaTable[];
  renamedTables: { from: SchemaTable; to: SchemaTable }[];
  possibleRenames: PossibleRename[];
  tables: TableDiff[];
  isEmpty: boolean;
}
export interface DiffOptions {
  /** pair a dropped and an added column / table of the same shape (or the same diagram id) as a rename; default true */
  detectRenames?: boolean;
}

const key = (s: string) => s.toLowerCase();
const normType = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(\s*/g, '(').replace(/\s*,\s*/g, ',').trim();
const real = (s: Schema) => s.tables.filter((t) => t.kind !== 'view');
const pkOf = (t: SchemaTable) => t.columns.filter((c) => c.pk).map((c) => c.name);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => key(x) === key(b[i]));
const idxKey = (i: SchemaIndex) => `${i.unique ? 'u' : 'i'}:${i.columns.map(key).join(',')}`;
const fkSame = (a?: SchemaFk, b?: SchemaFk) => !a && !b ? true : !!a && !!b && key(a.table) === key(b.table) && key(a.column) === key(b.column) && (a.onDelete ?? '').toUpperCase() === (b.onDelete ?? '').toUpperCase() && (a.onUpdate ?? '').toUpperCase() === (b.onUpdate ?? '').toUpperCase();

/**
 * Pairs dropped and added items as renames. Items with the same stable id are paired exactly; the rest are paired by shape, but only when
 * the shape is unique on both sides. Same shape on several items is ambiguous: reported as `ambiguous` (all candidate combinations).
 */
function pairUp<T>(dropped: T[], added: T[], id: (t: T) => string | undefined, sig: (t: T, dropped: boolean) => string): { pairs: [T, T][]; ambiguous: [T, T][] } {
  const pairs: [T, T][] = [];
  const ambiguous: [T, T][] = [];
  const left = new Set(dropped), right = new Set(added);
  for (const d of dropped) {
    const i = id(d);
    if (!i) continue;
    const a = added.find((x) => right.has(x) && id(x) === i);
    if (a) { pairs.push([d, a]); left.delete(d); right.delete(a); }
  }
  const groups = new Map<string, { d: T[]; a: T[] }>();
  const slot = (k: string) => groups.get(k) ?? (groups.set(k, { d: [], a: [] }), groups.get(k)!);
  for (const d of dropped) if (left.has(d)) slot(sig(d, true)).d.push(d);
  for (const a of added) if (right.has(a)) slot(sig(a, false)).a.push(a);
  for (const g of groups.values()) {
    if (g.d.length === 1 && g.a.length === 1) pairs.push([g.d[0], g.a[0]]);
    else if (g.d.length && g.a.length) for (const d of g.d) for (const a of g.a) ambiguous.push([d, a]);
  }
  return { pairs, ambiguous };
}

export function diffSchemas(a: Schema, b: Schema, opts: DiffOptions = {}): SchemaDiff {
  const detect = opts.detectRenames !== false;
  const ta = new Map(real(a).map((t) => [key(t.name), t]));
  const tb = new Map(real(b).map((t) => [key(t.name), t]));
  let addedTables = real(b).filter((t) => !ta.has(key(t.name)));
  let droppedTables = real(a).filter((t) => !tb.has(key(t.name)));
  const out: SchemaDiff = { addedTables, droppedTables, renamedTables: [], possibleRenames: [], tables: [], isEmpty: true };
  // table renames
  const tmap = new Map<string, string>(); // prev table (lowercase) -> next name
  const matched = new Map<SchemaTable, SchemaTable>(); // next -> prev
  for (const next of real(b)) { const prev = ta.get(key(next.name)); if (prev) matched.set(next, prev); }
  if (detect && addedTables.length && droppedTables.length) {
    const tsig = (t: SchemaTable) => t.columns.map((c) => `${key(c.name)}:${colSig(c, (x) => x)}`).sort().join(';');
    const r = pairUp(droppedTables, addedTables, (t) => t.id, tsig);
    for (const [from, to] of r.pairs) { out.renamedTables.push({ from, to }); matched.set(to, from); tmap.set(key(from.name), to.name); }
    out.possibleRenames = r.ambiguous.map(([f, t]) => ({ from: f.name, to: t.name }));
    const gone = new Set(r.pairs.flat());
    addedTables = addedTables.filter((t) => !gone.has(t));
    droppedTables = droppedTables.filter((t) => !gone.has(t));
    out.addedTables = addedTables;
    out.droppedTables = droppedTables;
  }
  // column renames per matched table
  const cren = new Map<SchemaTable, { pairs: [SchemaColumn, SchemaColumn][]; ambiguous: [SchemaColumn, SchemaColumn][] }>();
  const cmap = new Map<string, Map<string, string>>(); // prev table (lowercase) -> prev column (lowercase) -> next column name
  const mapFk = (fk?: SchemaFk): SchemaFk | undefined => {
    if (!fk) return fk;
    const col = cmap.get(key(fk.table))?.get(key(fk.column));
    return { ...fk, table: tmap.get(key(fk.table)) ?? fk.table, column: col ?? fk.column };
  };
  for (const [next, prev] of matched) {
    const ca = new Map(prev.columns.map((c) => [key(c.name), c]));
    const cb = new Map(next.columns.map((c) => [key(c.name), c]));
    const dropped = prev.columns.filter((c) => !cb.has(key(c.name)));
    const added = next.columns.filter((c) => !ca.has(key(c.name)));
    const r = detect && dropped.length && added.length ? pairUp(dropped, added, (c) => c.id, (c, isDropped) => colSig(c, isDropped ? mapFk : (x) => x)) : { pairs: [], ambiguous: [] };
    cren.set(next, r);
    if (r.pairs.length) cmap.set(key(prev.name), new Map(r.pairs.map(([f, t]) => [key(f.name), t.name])));
  }
  for (const next of real(b)) {
    const prev = matched.get(next);
    if (!prev) continue;
    const { pairs, ambiguous } = cren.get(next)!;
    const cm = cmap.get(key(prev.name));
    const to2from = new Map(pairs.map(([f, t]) => [key(t.name), f]));
    const ca = new Map(prev.columns.map((c) => [key(c.name), c]));
    const cb = new Map(next.columns.map((c) => [key(c.name), c]));
    const renamedFrom = new Set(pairs.map(([f]) => f));
    const renamedTo = new Set(pairs.map(([, t]) => t));
    const d: TableDiff = { name: next.name, prev, next, renamed: key(prev.name) !== key(next.name), addedColumns: next.columns.filter((c) => !ca.has(key(c.name)) && !renamedTo.has(c)), droppedColumns: prev.columns.filter((c) => !cb.has(key(c.name)) && !renamedFrom.has(c)), renamedColumns: pairs.map(([from, to]) => ({ from, to })), possibleRenames: ambiguous.map(([f, t]) => ({ from: f.name, to: t.name })), alteredColumns: [], pk: null, uniqueAdded: [], uniqueDropped: [], addedIndexes: [], droppedIndexes: [], addedFks: [], droppedFks: [] };
    for (const c of next.columns) {
      const o = ca.get(key(c.name)) ?? to2from.get(key(c.name));
      if (!o) continue;
      const changes: Change[] = [];
      if (normType(o.type) !== normType(c.type)) changes.push('type');
      if ((o.nullable && !o.pk) !== (c.nullable && !c.pk)) changes.push('nullable');
      if ((o.default ?? '') !== (c.default ?? '')) changes.push('default');
      if ((o.generated ?? '') !== (c.generated ?? '')) changes.push('generated');
      if (changes.length) d.alteredColumns.push({ name: c.name, from: o, to: c, changes });
      if (!!o.unique && !o.pk && !(c.unique && !c.pk)) d.uniqueDropped.push(o.name);
      if (!(o.unique && !o.pk) && c.unique && !c.pk) d.uniqueAdded.push(c.name);
      if (!fkSame(mapFk(o.fk), c.fk)) {
        if (o.fk) d.droppedFks.push({ column: o.name, fk: o.fk });
        if (c.fk) d.addedFks.push({ column: c.name, fk: c.fk });
      }
    }
    for (const c of d.droppedColumns) {
      if (c.unique && !c.pk) d.uniqueDropped.push(c.name);
      if (c.fk) d.droppedFks.push({ column: c.name, fk: c.fk });
    }
    for (const c of d.addedColumns) {
      if (c.unique && !c.pk) d.uniqueAdded.push(c.name);
      if (c.fk) d.addedFks.push({ column: c.name, fk: c.fk });
    }
    const mapCol = (n: string) => cm?.get(key(n)) ?? n;
    if (!same(pkOf(prev).map(mapCol), pkOf(next))) d.pk = { from: pkOf(prev), to: pkOf(next) };
    const ia = new Map(prev.indexes.map((i) => [idxKey({ ...i, columns: i.columns.map(mapCol) }), i]));
    const ib = new Map(next.indexes.map((i) => [idxKey(i), i]));
    d.addedIndexes = next.indexes.filter((i) => !ia.has(idxKey(i)));
    d.droppedIndexes = prev.indexes.filter((i) => !ib.has(idxKey({ ...i, columns: i.columns.map(mapCol) })));
    const empty = !d.renamed && !d.renamedColumns.length && !d.addedColumns.length && !d.droppedColumns.length && !d.alteredColumns.length && !d.pk && !d.uniqueAdded.length && !d.uniqueDropped.length && !d.addedIndexes.length && !d.droppedIndexes.length && !d.addedFks.length && !d.droppedFks.length;
    if (!empty) out.tables.push(d);
  }
  out.isEmpty = !out.addedTables.length && !out.droppedTables.length && !out.tables.length;
  return out;
}

/** everything that makes a column "the same column" apart from its name */
function colSig(c: SchemaColumn, fk: (f?: SchemaFk) => SchemaFk | undefined): string {
  const f = fk(c.fk);
  return [normType(c.type), c.nullable && !c.pk ? 'null' : 'notnull', c.default ?? '', c.generated ?? '', c.pk ? 'pk' : '', c.unique && !c.pk ? 'uq' : '', f ? `${key(f.table)}.${key(f.column)}/${(f.onDelete ?? '').toUpperCase()}/${(f.onUpdate ?? '').toUpperCase()}` : ''].join('|');
}

// ------------------------------------------------------------------------------------------------ SQL
const quote = (d: Dialect) => (s: string) => (d === 'mysql' ? '`' + s.replace(/`/g, '``') + '`' : '"' + s.replace(/"/g, '""') + '"');

function colDef(c: SchemaColumn, d: Dialect, o: { explicitNull?: boolean; inlinePk?: boolean } = {}): string {
  const q = quote(d);
  const gen = c.generated === 'identity' || c.generated === 'autoincrement';
  const parts = [q(c.name), c.type || 'text'];
  if (gen && d === 'postgres') parts.push('GENERATED BY DEFAULT AS IDENTITY');
  if (o.inlinePk && d === 'sqlite' && gen) return `${q(c.name)} INTEGER PRIMARY KEY AUTOINCREMENT`;
  const notNull = !c.nullable || c.pk;
  if (notNull) parts.push('NOT NULL');
  else if (o.explicitNull) parts.push('NULL');
  if (gen && d === 'mysql') parts.push('AUTO_INCREMENT');
  if (c.generated?.startsWith('as ')) parts.push(`GENERATED ALWAYS ${c.generated.toUpperCase()}`);
  else if (c.default !== undefined && c.default !== '' && !gen) parts.push(`DEFAULT ${c.default}`);
  return parts.join(' ');
}
const fkClause = (fk: SchemaFk, d: Dialect) => `REFERENCES ${quote(d)(fk.table)} (${quote(d)(fk.column)})${fk.onDelete ? ` ON DELETE ${fk.onDelete.toUpperCase()}` : ''}${fk.onUpdate ? ` ON UPDATE ${fk.onUpdate.toUpperCase()}` : ''}`;
const fkName = (t: string, c: string, fk: SchemaFk) => fk.name ?? `fk_${t}_${c}`;
const idxName = (t: string, i: SchemaIndex) => i.name ?? `idx_${t}_${i.columns.join('_')}`;

function createTable(t: SchemaTable, d: Dialect, withFks: boolean): string[] {
  const q = quote(d);
  const pk = pkOf(t);
  const inline = d === 'sqlite' && pk.length === 1 && t.columns.find((c) => c.name === pk[0])?.generated;
  const lines = t.columns.map((c) => '  ' + colDef(c, d, { inlinePk: !!inline && c.name === pk[0] }));
  if (pk.length && !inline) lines.push(`  PRIMARY KEY (${pk.map(q).join(', ')})`);
  for (const c of t.columns) if (c.unique && !c.pk) lines.push(`  UNIQUE (${q(c.name)})`);
  if (withFks) for (const c of t.columns) if (c.fk) lines.push(`  CONSTRAINT ${q(fkName(t.name, c.name, c.fk))} FOREIGN KEY (${q(c.name)}) ${fkClause(c.fk, d)}`);
  for (const ck of t.checks) lines.push(`  ${ck.name ? `CONSTRAINT ${q(ck.name)} ` : ''}CHECK (${ck.expr})`);
  const out = [`CREATE TABLE ${q(t.name)} (\n${lines.join(',\n')}\n);`];
  for (const i of t.indexes) out.push(createIndex(t.name, i, d));
  return out;
}
const createIndex = (table: string, i: SchemaIndex, d: Dialect) => `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX ${quote(d)(idxName(table, i))} ON ${quote(d)(table)} (${i.columns.map(quote(d)).join(', ')});`;
const dropIndex = (table: string, i: SchemaIndex, d: Dialect) => (d === 'mysql' ? `DROP INDEX ${quote(d)(idxName(table, i))} ON ${quote(d)(table)};` : `DROP INDEX ${quote(d)(idxName(table, i))};`);

/** parents before children (stable); cycles fall back to input order */
function dependencyOrder(tables: SchemaTable[]): SchemaTable[] {
  const by = new Map(tables.map((t) => [key(t.name), t]));
  const done = new Set<string>();
  const out: SchemaTable[] = [];
  const visit = (t: SchemaTable, stack: Set<string>) => {
    if (done.has(key(t.name)) || stack.has(key(t.name))) return;
    stack.add(key(t.name));
    for (const c of t.columns) if (c.fk && by.has(key(c.fk.table)) && key(c.fk.table) !== key(t.name)) visit(by.get(key(c.fk.table))!, stack);
    done.add(key(t.name));
    out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

/**
 * SQL that turns schema `a` into schema `b` for one dialect. Foreign keys are dropped before columns/tables go away and added after
 * everything exists; destructive statements are marked. SQLite cannot alter most things, so those tables are rebuilt (copying the
 * surviving columns). A dropped + added column (or table) of the same shape / diagram id is a RENAME, unless the match is ambiguous (then a
 * `-- possible rename` comment is added); `detectRenames: false` switches that off. Run it backwards with `migrationSql(b, a, dialect)`.
 */
export function migrationSql(a: Schema, b: Schema, dialect: Dialect, opts: DiffOptions = {}): string {
  const q = quote(dialect);
  const diff = diffSchemas(a, b, opts);
  const head = [`-- Migration for ${dialect === 'postgres' ? 'PostgreSQL' : dialect === 'mysql' ? 'MySQL / MariaDB' : 'SQLite'}, generated by System Design Diagram. Review before running.`];
  if (diff.isEmpty) return [...head, '-- No schema changes.', ''].join('\n');
  const body: string[] = [];
  const rebuilds = new Set<string>();
  if (dialect === 'sqlite') {
    for (const t of diff.tables) {
      const needs = t.alteredColumns.length || t.pk || t.addedFks.length || t.droppedFks.length || t.droppedColumns.some((c) => c.pk || c.unique || c.fk || t.prev.indexes.some((i) => i.columns.includes(c.name))) || t.addedColumns.some((c) => c.pk || (!c.nullable && c.default === undefined) || c.fk);
      if (needs) rebuilds.add(key(t.name));
    }
  }
  const T = dialect === 'postgres' || dialect === 'sqlite';

  // 1. foreign keys that go away or change (non-SQLite)
  if (dialect !== 'sqlite')
    for (const t of diff.tables) for (const f of t.droppedFks) body.push(dialect === 'mysql' ? `ALTER TABLE ${q(t.prev.name)} DROP FOREIGN KEY ${q(fkName(t.prev.name, f.column, f.fk))};` : `ALTER TABLE ${q(t.prev.name)} DROP CONSTRAINT ${q(fkName(t.prev.name, f.column, f.fk))};`);
  // 1b. table renames (before anything refers to the new names)
  for (const r of diff.renamedTables) body.push(dialect === 'mysql' ? `RENAME TABLE ${q(r.from.name)} TO ${q(r.to.name)};` : `ALTER TABLE ${q(r.from.name)} RENAME TO ${q(r.to.name)};`);
  for (const p of diff.possibleRenames) body.push(`-- possible rename: ${p.from} -> ${p.to}`);
  // 2. new tables, parents first
  for (const t of dependencyOrder(diff.addedTables)) body.push(...createTable(t, dialect, true));
  // 3. changes of kept tables
  for (const t of diff.tables) {
    const tn = q(t.name);
    if (rebuilds.has(key(t.name))) {
      const nn = q(`${t.name}__new`);
      const src = (c: SchemaColumn) => t.renamedColumns.find((r) => r.to === c)?.from.name ?? c.name;
      const keep = t.next.columns.filter((c) => t.renamedColumns.some((r) => r.to === c) || t.prev.columns.some((p) => key(p.name) === key(c.name)));
      body.push(`-- SQLite cannot alter a column or constraint in place: ${t.name} is rebuilt.`);
      const [create, ...idx] = createTable({ ...t.next, name: `${t.name}__new`, indexes: [] }, dialect, true);
      body.push(create);
      if (keep.length) body.push(`INSERT INTO ${nn} (${keep.map((c) => q(c.name)).join(', ')}) SELECT ${keep.map((c) => q(src(c))).join(', ')} FROM ${tn};`);
      body.push('-- DESTRUCTIVE: the old table is dropped after its rows were copied', `DROP TABLE ${tn};`, `ALTER TABLE ${nn} RENAME TO ${tn};`);
      for (const i of t.next.indexes) body.push(createIndex(t.name, i, dialect));
      void idx;
      continue;
    }
    for (const p of t.possibleRenames) body.push(`-- possible rename: ${p.from} -> ${p.to}`);
    for (const r of t.renamedColumns) body.push(`ALTER TABLE ${tn} RENAME COLUMN ${q(r.from.name)} TO ${q(r.to.name)};`);
    for (const i of t.droppedIndexes) body.push(dropIndex(t.name, i, dialect));
    for (const c of t.uniqueDropped) if (!t.droppedColumns.some((d) => d.name === c)) body.push(dialect === 'mysql' ? `ALTER TABLE ${tn} DROP INDEX ${q(c)};` : `ALTER TABLE ${tn} DROP CONSTRAINT ${q(`${t.prev.name}_${c}_key`)};`);
    if (t.pk && t.pk.from.length) body.push(dialect === 'mysql' ? `ALTER TABLE ${tn} DROP PRIMARY KEY${t.pk.to.length ? `, ADD PRIMARY KEY (${t.pk.to.map(q).join(', ')})` : ''};` : `ALTER TABLE ${tn} DROP CONSTRAINT ${q(`${t.prev.name}_pkey`)};`);
    if (t.droppedColumns.length) body.push('-- DESTRUCTIVE: the data of these columns is lost');
    for (const c of t.droppedColumns) body.push(`ALTER TABLE ${tn} DROP COLUMN ${q(c.name)};`);
    for (const c of t.addedColumns) body.push(`ALTER TABLE ${tn} ADD COLUMN ${colDef(c, dialect)};`);
    for (const al of t.alteredColumns) {
      const cn = q(al.name);
      if (dialect === 'mysql') { body.push(`ALTER TABLE ${tn} MODIFY COLUMN ${colDef(al.to, dialect, { explicitNull: true })};`); continue; }
      if (al.changes.includes('type')) body.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} TYPE ${al.to.type} USING ${cn}::${al.to.type};`);
      if (al.changes.includes('nullable')) body.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} ${al.to.nullable && !al.to.pk ? 'DROP' : 'SET'} NOT NULL;`);
      if (al.changes.includes('default')) body.push(al.to.default ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET DEFAULT ${al.to.default};` : `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT;`);
      if (al.changes.includes('generated')) body.push(al.to.generated ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} ADD GENERATED BY DEFAULT AS IDENTITY;` : `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP IDENTITY IF EXISTS;`);
    }
    if (t.pk && t.pk.to.length && dialect !== 'mysql') body.push(`ALTER TABLE ${tn} ADD PRIMARY KEY (${t.pk.to.map(q).join(', ')});`);
    for (const c of t.uniqueAdded) body.push(dialect === 'mysql' ? `ALTER TABLE ${tn} ADD UNIQUE (${q(c)});` : `ALTER TABLE ${tn} ADD CONSTRAINT ${q(`${t.name}_${c}_key`)} UNIQUE (${q(c)});`);
    for (const i of t.addedIndexes) body.push(createIndex(t.name, i, dialect));
  }
  // 4. new foreign keys on kept tables
  if (dialect !== 'sqlite')
    for (const t of diff.tables) for (const f of t.addedFks) body.push(`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(fkName(t.name, f.column, f.fk))} FOREIGN KEY (${q(f.column)}) ${fkClause(f.fk, dialect)};`);
  // 5. dropped tables, children first
  if (diff.droppedTables.length) {
    body.push('-- DESTRUCTIVE: these tables and all their rows are removed');
    for (const t of [...dependencyOrder(diff.droppedTables)].reverse()) body.push(`DROP TABLE ${q(t.name)};`);
  }
  const wrap = T;
  const pragma = rebuilds.size > 0;
  return [...head, ...(pragma ? ['PRAGMA foreign_keys = OFF;'] : []), ...(wrap ? ['BEGIN;'] : []), ...body, ...(wrap ? ['COMMIT;'] : []), ...(pragma ? ['PRAGMA foreign_keys = ON;'] : []), ''].join('\n');
}
