// model shapes follow internal/model/model.go.

/** Relation cardinality read from the edge source to the edge target. The source is the referenced ("parent") table. */
export type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:M';
export type Dialect = 'postgres' | 'mysql' | 'sqlite';
export const DIALECTS: { id: Dialect; label: string }[] = [
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL / MariaDB' },
  { id: 'sqlite', label: 'SQLite' },
];

export interface ErFk {
  /** referenced table (name, without schema) */
  table: string;
  /** referenced column; empty = the parent's primary key */
  column: string;
  onDelete?: string;
  onUpdate?: string;
  /** constraint name */
  name?: string;
  /** columns sharing one group form a composite foreign key */
  group?: string;
  identifying?: boolean;
  manyRequired?: boolean;
  label?: string;
}

export interface ErColumnDef {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  nullable: boolean;
  default?: string;
  /** 'identity' | 'autoincrement' | 'as <expr>' for a computed column */
  generated?: string;
  comment?: string;
  fk?: ErFk;
}
export interface ErIndexDef {
  name?: string;
  columns: string[];
  unique: boolean;
  /** raw method / predicate text, kept for display */
  using?: string;
  where?: string;
}
export interface ErCheckDef {
  name?: string;
  expr: string;
}
export interface ErTableDef {
  schema?: string;
  name: string;
  kind?: 'table' | 'view';
  columns: ErColumnDef[];
  indexes: ErIndexDef[];
  checks: ErCheckDef[];
  comment?: string;
  /** header colour carried through diagram round trips */
  accent?: string;
}
export interface ErEnumDef {
  name: string;
  values: string[];
}
/** A relation that has no foreign-key column behind it (a Mermaid many-to-many). */
export interface ErLooseRelation {
  from: string;
  to: string;
  cardinality: Cardinality;
  identifying: boolean;
  label?: string;
}
export interface ErSchemaDef {
  tables: ErTableDef[];
  enums: ErEnumDef[];
  loose: ErLooseRelation[];
}
export interface ErParseResult {
  schema: ErSchemaDef;
  warnings: string[];
}

export const emptySchema = (): ErSchemaDef => ({ tables: [], enums: [], loose: [] });
export const newColumn = (name: string, type = 'text', extra: Partial<ErColumnDef> = {}): ErColumnDef => ({ name, type, pk: false, unique: false, nullable: true, ...extra });
export const newTable = (name: string, columns: ErColumnDef[] = [], extra: Partial<ErTableDef> = {}): ErTableDef => ({ name, columns, indexes: [], checks: [], ...extra });

/** counts shown in the import preview */
export function schemaCounts(s: ErSchemaDef): { tables: number; views: number; columns: number; relations: number; enums: number; indexes: number } {
  const t = s.tables.filter((x) => x.kind !== 'view');
  return {
    tables: t.length,
    views: s.tables.length - t.length,
    columns: s.tables.reduce((a, x) => a + x.columns.length, 0),
    relations: s.tables.reduce((a, x) => a + new Set(x.columns.filter((c) => c.fk).map((c) => c.fk!.group ?? `${c.name}`)).size, 0) + s.loose.length,
    enums: s.enums.length,
    indexes: s.tables.reduce((a, x) => a + x.indexes.length, 0),
  };
}

export const findTable = (s: ErSchemaDef, name: string): ErTableDef | undefined => s.tables.find((t) => t.name === name) ?? s.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
