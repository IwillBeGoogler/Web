import { columnSql, mapType, q, qtable, tableSql } from './renderSql';
import type { Dialect, ErColumnDef, ErSchemaDef, ErTableDef } from './types';

/**
 * Migration script that turns `before` into `after`: new / dropped tables, added / dropped columns, type, NOT NULL,
 * default and foreign-key changes. Renames read as drop + add (there is no way to tell them apart from the schemas alone).
 */
export function migrationSql(before: ErSchemaDef, after: ErSchemaDef, d: Dialect): string {
  const out: string[] = [];
  const old = new Map(before.tables.map((t) => [t.name, t]));
  const now = new Map(after.tables.map((t) => [t.name, t]));
  for (const t of after.tables) if (!old.has(t.name)) out.push(...tableSql(d, t, after));
  for (const t of after.tables) {
    const was = old.get(t.name);
    if (was) out.push(...alterTable(d, was, t));
  }
  for (const t of before.tables) if (!now.has(t.name)) out.push(`DROP TABLE ${qtable(d, t)};`);
  return out.length ? out.join('\n\n') : '-- no changes';
}

const fkKey = (c: ErColumnDef) => (c.fk ? `${c.fk.table}.${c.fk.column}|${c.fk.onDelete ?? ''}|${c.fk.onUpdate ?? ''}` : '');

function alterTable(d: Dialect, was: ErTableDef, t: ErTableDef): string[] {
  const out: string[] = [];
  const tn = qtable(d, t);
  const solo = t.columns.filter((c) => c.pk).length === 1;
  const prev = new Map(was.columns.map((c) => [c.name, c]));
  const next = new Set(t.columns.map((c) => c.name));
  const fkName = (c: ErColumnDef) => c.fk?.name ?? `fk_${t.name}_${c.name}`;
  const addFk = (c: ErColumnDef) => `ALTER TABLE ${tn} ADD CONSTRAINT ${q(d, fkName(c))} FOREIGN KEY (${q(d, c.name)}) REFERENCES ${q(d, c.fk!.table)} (${q(d, c.fk!.column || 'id')})${c.fk!.onDelete ? ` ON DELETE ${c.fk!.onDelete}` : ''}${c.fk!.onUpdate ? ` ON UPDATE ${c.fk!.onUpdate}` : ''};`;
  const dropFk = (c: ErColumnDef) => (d === 'mysql' ? `ALTER TABLE ${tn} DROP FOREIGN KEY ${q(d, fkName(c))};` : `ALTER TABLE ${tn} DROP CONSTRAINT ${q(d, fkName(c))};`);
  for (const c of t.columns) {
    const p = prev.get(c.name);
    if (!p) {
      out.push(`ALTER TABLE ${tn} ADD COLUMN ${columnSql(d, c, solo && c.pk)};`);
      if (c.fk) out.push(addFk(c));
      continue;
    }
    const typeChanged = mapType(p.type, d, p) !== mapType(c.type, d, c);
    const nullChanged = p.nullable !== c.nullable && !c.pk;
    const defChanged = (p.default ?? '') !== (c.default ?? '');
    if (d === 'mysql' && (typeChanged || nullChanged || defChanged)) out.push(`ALTER TABLE ${tn} MODIFY COLUMN ${columnSql(d, c, solo && c.pk)};`);
    else if (d === 'postgres') {
      const col = `ALTER TABLE ${tn} ALTER COLUMN ${q(d, c.name)}`;
      if (typeChanged) out.push(`${col} TYPE ${mapType(c.type, d, c)};`);
      if (nullChanged) out.push(`${col} ${c.nullable ? 'DROP' : 'SET'} NOT NULL;`);
      if (defChanged) out.push(c.default !== undefined ? `${col} SET DEFAULT ${c.default};` : `${col} DROP DEFAULT;`);
    } else if (typeChanged || nullChanged || defChanged) out.push(`-- SQLite cannot alter column ${q(d, c.name)} in place: rebuild ${tn}`);
    if (fkKey(p) !== fkKey(c)) {
      if (p.fk) out.push(d === 'sqlite' ? `-- SQLite cannot drop foreign key on ${q(d, c.name)}: rebuild ${tn}` : dropFk(p));
      if (c.fk) out.push(d === 'sqlite' ? `-- SQLite cannot add foreign key on ${q(d, c.name)}: rebuild ${tn}` : addFk(c));
    }
  }
  for (const p of was.columns) if (!next.has(p.name)) out.push(`ALTER TABLE ${tn} DROP COLUMN ${q(d, p.name)};`);
  return out;
}
