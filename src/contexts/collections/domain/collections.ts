import { z } from "zod";

export const listSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  description: z.string().default(""),
  private: z.boolean().default(false),
  owner: z.string().default(""),
  user_id: z.number().default(0),
  posts: z.number().default(0),
  contains: z.boolean().optional(),
  updated_at: z.string().optional(),
});
export type ReadingList = z.infer<typeof listSchema>;

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Give your list a name").max(60, "At most 60 characters"),
  description: z.string().trim().max(280, "At most 280 characters"),
  private: z.boolean(),
});
export type ListInput = z.infer<typeof listInputSchema>;

export const partSchema = z.object({
  position: z.number(),
  post_id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: z.string().default("published"),
  published_at: z.string().nullable().optional(),
});
export type Part = z.infer<typeof partSchema>;

export const seriesSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  description: z.string().default(""),
  user_id: z.number().default(0),
  author: z.string().default(""),
  parts: z.number().default(0),
  posts: z
    .array(partSchema)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});
export type Series = z.infer<typeof seriesSchema>;

export const seriesInputSchema = z.object({
  title: z.string().trim().min(1, "Give your series a title").max(120, "At most 120 characters"),
  description: z.string().trim().max(500, "At most 500 characters"),
});

/** GET /posts/{id}/series: where a post sits in its series. Tolerant of shape. */
export const placeSchema = z
  .object({
    series: seriesSchema.optional(),
    position: z.number().optional(),
    prev: partSchema.nullable().optional(),
    next: partSchema.nullable().optional(),
    posts: z.array(partSchema).nullable().optional(),
  })
  .loose()
  .transform((p) => ({ series: p.series, position: p.position ?? 0, prev: p.prev ?? null, next: p.next ?? null, parts: p.posts ?? p.series?.posts ?? [] }));
export type SeriesPlace = z.infer<typeof placeSchema>;

/** Moves item at `from` to `to` (reordering series parts). */
export const move = <T>(arr: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const out = [...arr];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x as T);
  return out;
};

export const highlightSchema = z.object({ id: z.number().optional(), text: z.string(), start: z.number(), end: z.number(), count: z.number().optional() });
export type Highlight = z.infer<typeof highlightSchema>;
export const highlightsSchema = z.object({
  top: z
    .array(highlightSchema)
    .nullable()
    .transform((v) => v ?? []),
  mine: z
    .array(highlightSchema)
    .nullable()
    .transform((v) => v ?? []),
});

/**
 * Rune (code point) offsets of `selected` inside `body`, as the server
 * expects; null when the text isn't found verbatim. Whitespace runs in the
 * selection may differ from the Markdown source, so they are matched loosely.
 */
export const runeRange = (body: string, selected: string): { start: number; end: number } | null => {
  const sel = selected.trim();
  if (!sel) return null;
  const esc = sel
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s*_`]+");
  const m = new RegExp(esc).exec(body);
  if (!m) return null;
  const start = [...body.slice(0, m.index)].length;
  return { start, end: start + [...m[0]].length };
};

export const roleSchema = z.enum(["owner", "editor", "writer"]).or(z.literal(""));
export const publicationSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  description: z.string().default(""),
  avatar_url: z.string().default(""),
  members: z.number().default(0),
  posts: z.number().default(0),
  my_role: roleSchema.catch(""),
});
export type Publication = z.infer<typeof publicationSchema>;

export const memberSchema = z.object({
  user_id: z.number(),
  username: z.string(),
  display_name: z.string().default(""),
  avatar_url: z.string().default(""),
  role: z.enum(["owner", "editor", "writer"]),
});
export type Member = z.infer<typeof memberSchema>;

export const publicationInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,40}$/, "3–40 lowercase letters, digits or -"),
  name: z.string().trim().min(1, "Required").max(80, "At most 80 characters"),
  description: z.string().trim().max(500, "At most 500 characters"),
});

/** Owners manage editors and writers; editors manage writers. */
export const canManage = (me: Publication["my_role"], target: Member["role"]) =>
  me === "owner" ? target !== "owner" : me === "editor" ? target === "writer" : false;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
