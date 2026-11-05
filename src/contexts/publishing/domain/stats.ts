import { z } from "zod";

export const postStatSchema = z.object({
  post_id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  published_at: z.string().nullable().optional(),
  views: z.number().default(0),
  reads: z.number().default(0),
  read_ratio: z.number().default(0),
  claps: z.number().default(0),
  comments: z.number().default(0),
  bookmarks: z.number().default(0),
  highlights: z.number().default(0),
});
export type PostStat = z.infer<typeof postStatSchema>;

export const dailySchema = z.object({
  post_id: z.number(),
  days: z
    .array(z.object({ date: z.string(), views: z.number(), reads: z.number() }))
    .nullable()
    .transform((v) => v ?? []),
});
export type Daily = z.infer<typeof dailySchema>;

export const totals = (rows: PostStat[]) =>
  rows.reduce((t, r) => ({ views: t.views + r.views, reads: t.reads + r.reads, claps: t.claps + r.claps, comments: t.comments + r.comments }), {
    views: 0,
    reads: 0,
    claps: 0,
    comments: 0,
  });

/** Read ratio as a whole percentage; accepts 0–1 or 0–100 from the server. */
export const pct = (ratio: number) => `${Math.round(ratio <= 1 ? ratio * 100 : ratio)}%`;

/** Bar heights (0–100) scaled to the busiest day. */
export const bars = (days: Daily["days"]) => {
  const max = Math.max(1, ...days.map((d) => d.views));
  return days.map((d) => ({ ...d, h: Math.round((d.views / max) * 100), r: Math.round((d.reads / max) * 100) }));
};
