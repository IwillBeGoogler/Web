import { z } from "zod";

const list = <S extends z.ZodType>(s: S) =>
  z
    .array(s)
    .nullable()
    .default([])
    .transform((v) => (v ?? []) as z.output<S>[]);

export const revisionSchema = z.object({
  id: z.number(),
  post_id: z.number(),
  version: z.number(),
  title: z.string(),
  subtitle: z.string().default(""),
  body: z.string().optional(),
  editor_id: z.number().default(0),
  editor: z.string().default(""),
  created_at: z.string(),
});
export type Revision = z.infer<typeof revisionSchema>;

export const diffOpSchema = z.object({ op: z.enum(["=", "+", "-"]), text: z.string() });
export type DiffOp = z.infer<typeof diffOpSchema>;

export const diffStats = (ops: DiffOp[]) => ({
  added: ops.filter((o) => o.op === "+").length,
  removed: ops.filter((o) => o.op === "-").length,
});

/** GET /posts/{id}/revisions/{version}: the revision plus a diff against the current text. */
export const revisionDetailSchema = revisionSchema.extend({
  diff: z.object({
    title: list(diffOpSchema),
    subtitle: list(diffOpSchema),
    body: list(diffOpSchema),
    added: z.number().default(0),
    removed: z.number().default(0),
  }),
});
export type RevisionDetail = z.infer<typeof revisionDetailSchema>;
