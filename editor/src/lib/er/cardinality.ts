// cardinalityOf() from internal/ui/assets/app.js.
import type { MarkerKind } from '../../types';
import type { RelationData } from './tableData';
import type { Cardinality, ErColumnDef, ErTableDef } from './types';

/**
 * Cardinality of a foreign key read from the referenced (parent) table: a foreign key that is unique, or is the table's
 * whole primary key, can only point at one parent row (1:1); anything else is one parent to many children (1:N).
 */
export function cardinalityOf(table: Pick<ErTableDef, 'columns' | 'indexes'>, cols: ErColumnDef | ErColumnDef[]): '1:1' | '1:N' {
  const list = Array.isArray(cols) ? cols : [cols];
  const names = new Set(list.map((c) => c.name));
  const pk = table.columns.filter((c) => c.pk).map((c) => c.name);
  const same = (a: string[]) => a.length === names.size && a.every((x) => names.has(x));
  if (list.length === 1 && list[0].unique) return '1:1';
  if (same(pk)) return '1:1';
  if (table.indexes.some((i) => i.unique && !i.where && same(i.columns))) return '1:1';
  return '1:N';
}

/** A foreign key is optional (the parent may be absent) when its column is nullable. */
export const isOptionalFk = (cols: ErColumnDef | ErColumnDef[]): boolean => (Array.isArray(cols) ? cols : [cols]).some((c) => c.nullable && !c.pk);

export type ErMarker = 'one' | 'zeroOrOne' | 'many' | 'oneOrMany' | 'zeroOrMany';
export const ER_MARKER_KINDS: ErMarker[] = ['one', 'zeroOrOne', 'many', 'oneOrMany', 'zeroOrMany'];
export const isErMarker = (m: MarkerKind | undefined): boolean => !!m && (ER_MARKER_KINDS as string[]).includes(m);

/** Markers at the source and target end of a relation. */
export function relationEnds(r: Pick<RelationData, 'cardinality' | 'optional' | 'manyRequired'>): { start: ErMarker; end: ErMarker } {
  const one: ErMarker = r.optional ? 'zeroOrOne' : 'one';
  const many: ErMarker = r.manyRequired ? 'oneOrMany' : 'zeroOrMany';
  switch (r.cardinality) {
    case '1:1': return { start: one, end: r.manyRequired ? 'one' : 'zeroOrOne' };
    case '1:N': return { start: one, end: many };
    case 'N:1': return { start: many, end: one };
    default: return { start: many, end: many };
  }
}

export const cardinalityLabel: Record<Cardinality, string> = { '1:1': 'One to one', '1:N': 'One to many', 'N:1': 'Many to one', 'N:M': 'Many to many' };
export const flipCardinality = (c: Cardinality): Cardinality => (c === '1:N' ? 'N:1' : c === 'N:1' ? '1:N' : c);
