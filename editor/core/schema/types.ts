/** The relational schema model shared by introspection, migration SQL and the Seedora export (same shape as src/lib/er/types.ts). */
export type Dialect = 'postgres' | 'mysql' | 'sqlite';
export const DIALECTS: Dialect[] = ['postgres', 'mysql', 'sqlite'];

export interface SchemaFk { table: string; column: string; onDelete?: string; onUpdate?: string; name?: string; group?: string }
export interface SchemaColumn {
  /** stable id (the diagram column id) when known: lets the migration diff detect renames exactly */
  id?: string;
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  nullable: boolean;
  default?: string;
  /** 'identity' | 'autoincrement' | 'as <expr>' */
  generated?: string;
  comment?: string;
  fk?: SchemaFk;
}
export interface SchemaIndex { name?: string; columns: string[]; unique: boolean }
export interface SchemaTable {
  /** stable id (the diagram node id) when known */
  id?: string;
  schema?: string;
  name: string;
  kind?: 'table' | 'view';
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
  checks: { name?: string; expr: string }[];
  comment?: string;
}
export interface Schema { tables: SchemaTable[]; enums: { name: string; values: string[] }[] }

export const emptySchema = (): Schema => ({ tables: [], enums: [] });
