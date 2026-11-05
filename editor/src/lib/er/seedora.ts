// JSON shape of internal/model/model.go (Schema / Table / Column / Check / Ref).
import { emptySchema, newColumn, newTable, type ErParseResult, type ErSchemaDef } from './types';

interface SeedoraRef { table: string; column: string }
interface SeedoraColumn {
  name: string; type?: string; native?: string; nullable?: boolean; has_default?: boolean; generated?: boolean; unique?: boolean;
  enum_type?: string; max_len?: number; precision?: number; scale?: number; fk?: SeedoraRef | null;
}
interface SeedoraTable { schema?: string; name: string; columns?: SeedoraColumn[]; primary_key?: string[]; checks?: { name?: string; expr: string; columns?: string[] }[] }
export interface SeedoraSchema { tables?: SeedoraTable[]; enums?: Record<string, string[]> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Does this parsed JSON look like a Seedora model.Schema? */
export const looksLikeSeedora = (v: unknown): v is SeedoraSchema => isObj(v) && Array.isArray(v.tables) && (v.tables as unknown[]).every((t) => isObj(t) && typeof t.name === 'string');

export function parseSeedora(json: string | unknown): ErParseResult {
  const warnings: string[] = [];
  let raw: unknown = json;
  if (typeof json === 'string') {
    try { raw = JSON.parse(json); } catch { return { schema: emptySchema(), warnings: ['Not valid JSON'] }; }
  }
  if (!looksLikeSeedora(raw)) return { schema: emptySchema(), warnings: ['Not a Seedora schema (expected {"tables": [...]})'] };
  const schema = emptySchema();
  for (const t of raw.tables ?? []) {
    const pk = new Set(t.primary_key ?? []);
    const table = newTable(t.name, [], t.schema ? { schema: t.schema } : {});
    for (const c of t.columns ?? []) {
      const col = newColumn(c.name, (c.native && c.native.trim()) || c.type || 'text', {
        pk: pk.has(c.name),
        unique: !!c.unique && !pk.has(c.name),
        nullable: pk.has(c.name) ? false : c.nullable !== false,
      });
      if (c.generated) col.generated = 'as ()';
      else if (c.has_default && pk.size === 1 && pk.has(c.name) && /int/i.test(c.type ?? '')) col.generated = 'autoincrement';
      else if (c.has_default) col.default = '/* default */';
      if (c.fk) col.fk = { table: c.fk.table, column: c.fk.column };
      table.columns.push(col);
    }
    for (const ck of t.checks ?? []) table.checks.push({ ...(ck.name ? { name: ck.name } : {}), expr: ck.expr });
    schema.tables.push(table);
  }
  for (const [name, values] of Object.entries(raw.enums ?? {})) schema.enums.push({ name, values: [...values] });
  for (const t of schema.tables) for (const c of t.columns) if (c.fk && !schema.tables.some((x) => x.name === c.fk!.table)) warnings.push(`${t.name}.${c.name} references unknown table ${c.fk.table}`);
  return { schema, warnings };
}

export function renderSeedora(s: ErSchemaDef): string {
  const out: SeedoraSchema = {
    tables: s.tables.filter((t) => t.kind !== 'view').map((t) => ({
      ...(t.schema ? { schema: t.schema } : {}),
      name: t.name,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type.replace(/\(.*$/, '').trim(),
        native: c.type,
        nullable: c.nullable && !c.pk,
        has_default: c.default !== undefined || !!c.generated,
        generated: !!c.generated?.startsWith('as '),
        unique: c.unique,
        ...(c.fk ? { fk: { table: c.fk.table, column: c.fk.column } } : {}),
      })),
      primary_key: t.columns.filter((c) => c.pk).map((c) => c.name),
      existing_rows: 0,
      ...(t.checks.length ? { checks: t.checks.map((k) => ({ name: k.name ?? '', expr: k.expr })) } : {}),
    })),
    ...(s.enums.length ? { enums: Object.fromEntries(s.enums.map((e) => [e.name, e.values])) } : {}),
  };
  return JSON.stringify(out, null, 2) + '\n';
}
