import type { DiagramEdge, DiagramNode } from '../../types';
import type { Cardinality, ErCheckDef, ErFk, ErIndexDef } from './types';

/** One column of a table node. `id` is stable (edges point at it), `name` can change freely. */
export interface TableColumn {
  id: string;
  name: string;
  type: string;
  pk: boolean;
  fk?: ErFk;
  unique: boolean;
  nullable: boolean;
  default?: string;
  generated?: string;
  comment?: string;
}
export type TableVariant = 'table' | 'view' | 'enum';
/** `label` holds the table name (so rename, search and the generic validators keep working). */
export interface TableNodeData {
  label: string;
  schema?: string;
  tableKind?: TableVariant;
  columns: TableColumn[];
  indexes: ErIndexDef[];
  checks: ErCheckDef[];
  accent: string;
  collapsed: boolean;
  comment?: string;
}
export const isTableNode = (n: DiagramNode | undefined): n is DiagramNode & { data: TableNodeData } => n?.type === 'table';
export const tableOf = (n: DiagramNode): TableNodeData => n.data as unknown as TableNodeData;

/** What an ER relation edge stores in `edge.data.relation`. The edge source is the referenced ("parent") table. */
export interface RelationData {
  /** column id on the source table (undefined: header / no column, e.g. an N:M) */
  fromCol?: string;
  /** column id on the target table (the foreign-key column for 1:N / 1:1) */
  toCol?: string;
  /** further column pairs of a composite foreign key (legacy: new diagrams draw one edge per pair, tied by `group`) */
  pairs?: { fromCol: string; toCol: string }[];
  /** edges between the same two tables with the same group are the column pairs of one composite foreign key */
  group?: string;
  /** an N:M edge standing in for a junction table (its id): the table and its two foreign-key edges are hidden */
  via?: string;
  cardinality: Cardinality;
  /** drawn solid when true (the child cannot exist without the parent), dashed otherwise */
  identifying: boolean;
  /** the "one" end may be absent (a nullable foreign key) */
  optional: boolean;
  /** the "many" end needs at least one row (one-or-many instead of zero-or-many) */
  manyRequired?: boolean;
  name?: string;
}
export const relationOf = (e: DiagramEdge): RelationData | undefined => (e.data?.relation as RelationData | undefined);
export const isRelationEdge = (e: DiagramEdge): boolean => !!e.data?.relation;

export const ACCENTS = ['#2f6fdb', '#0f9d8f', '#e8710a', '#8e5bd6', '#d1344a', '#4b5563', '#16a34a', '#c026d3'] as const;
export const DEFAULT_ACCENT = ACCENTS[0];
