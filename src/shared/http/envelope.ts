import { z } from "zod";

export const pageMetaSchema = z.object({
  page: z.number().optional().default(0),
  limit: z.number().optional().default(0),
  total: z.number().optional().default(0),
  has_more: z.boolean().optional().default(false),
  next_cursor: z.string().optional(),
});

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | undefined;
}

/** A page of a list endpoint: `{data: T[], meta}`. */
export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export const dataEnvelope = <S extends z.ZodType>(schema: S) => z.object({ data: schema });

export const pageEnvelope = <S extends z.ZodType>(item: S) =>
  z.object({ data: list(item), meta: pageMetaSchema.optional() }).transform(
    (b): Page<z.infer<S>> => ({
      items: (b.data ?? []) as z.infer<S>[],
      meta: {
        page: b.meta?.page ?? 0,
        limit: b.meta?.limit ?? 0,
        total: b.meta?.total ?? (b.data ?? []).length,
        hasMore: b.meta?.has_more ?? false,
        nextCursor: b.meta?.next_cursor || undefined,
      },
    }),
  );

/** Paging request: cursor wins over page when the server returned one. */
export interface PageRequest {
  page?: number | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

/** Next request after `meta`, or undefined at the end. */
export const nextPageRequest = (meta: PageMeta, limit?: number): PageRequest | undefined => {
  if (!meta.hasMore && !meta.nextCursor) return undefined;
  if (meta.nextCursor) return { cursor: meta.nextCursor, limit };
  return { page: (meta.page || 1) + 1, limit };
};

/** Go encodes empty slices as null; treat null/missing as []. */
export const list = <S extends z.ZodType>(item: S) =>
  z
    .array(item)
    .nullish()
    .transform((v): z.output<S>[] => (v ?? []) as z.output<S>[]);
