import { z } from 'zod';
import type { DiagramEdge, DiagramNode } from '../../types';

export type FieldSpec =
  | { key: string; type: 'number'; label: string; min: number; max: number; default: number; step?: number; showIf?: (p: Record<string, unknown>) => boolean }
  | { key: string; type: 'select'; label: string; options: { value: string | number; label: string }[]; default: string | number; showIf?: (p: Record<string, unknown>) => boolean }
  | { key: string; type: 'boolean'; label: string; default: boolean; showIf?: (p: Record<string, unknown>) => boolean }
  | { key: string; type: 'text'; label: string; default: string; showIf?: (p: Record<string, unknown>) => boolean }
  | { key: string; type: 'topics'; label: string; default: Topic[]; showIf?: (p: Record<string, unknown>) => boolean };

export interface Topic {
  name: string;
  partitions: number;
  rf: number;
}

export interface Generated {
  /** root cluster node first, then sub-groups and members (parents before children), then external nodes */
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** id of the root cluster node */
  rootId: string;
  /** size of the cluster box */
  size: { width: number; height: number };
}

export interface ClusterProfile<P extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  tech: string;
  label: string;
  /** palette / header icon */
  iconId: string;
  accent: string;
  roles: string[];
  topologies: string[];
  fields: FieldSpec[];
  /** zod schema derived from `fields` (validates + defaults params) */
  schema: z.ZodType<P>;
  defaults: P;
  /** nodes/edges for `params`; ids are `${prefix}-...` so they stay stable across regenerations */
  generate: (params: P, prefix: string) => Generated;
  /** human readable warnings, shown as a badge on the cluster header */
  validate: (params: P) => string[];
  summarize: (params: P) => string;
}

/** Build zod schema + defaults from the field specs (single source of truth for validation and the wizard form). */
export function defineParams<P extends Record<string, unknown>>(fields: FieldSpec[]): { schema: z.ZodType<P>; defaults: P } {
  const shape: Record<string, z.ZodTypeAny> = {};
  const defaults: Record<string, unknown> = {};
  for (const f of fields) {
    defaults[f.key] = f.default;
    if (f.type === 'number') shape[f.key] = z.number().int().min(f.min).max(f.max).default(f.default);
    else if (f.type === 'boolean') shape[f.key] = z.boolean().default(f.default);
    else if (f.type === 'text') shape[f.key] = z.string().default(f.default);
    else if (f.type === 'select') shape[f.key] = z.union(f.options.map((o) => z.literal(o.value)) as unknown as [z.ZodTypeAny, z.ZodTypeAny]).default(f.default);
    else shape[f.key] = z.array(z.object({ name: z.string().min(1), partitions: z.number().int().min(1).max(256), rf: z.number().int().min(1).max(12) })).default(f.default);
  }
  return { schema: z.object(shape) as unknown as z.ZodType<P>, defaults: defaults as P };
}
