import { z } from "zod";

/** A term the author explained for this article. */
export const glossaryEntrySchema = z.object({
  term: z.string(),
  aliases: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((a) => a ?? []),
  definition: z.string(),
});
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;

export const postSchema = z.object({
  id: z.number(),
  title: z.string(),
  subtitle: z.string().default(""),
  slug: z.string(),
  status: z.string(),
  body: z.string().default(""),
  body_html: z.string().optional(),
  reading_time: z.number().default(1),
  published_at: z.string().nullable().optional(),
  publish_at: z.string().nullable().optional(),
  author: z.string().default(""),
  user_id: z.number().default(0),
  publication_id: z.number().default(0),
  cover_url: z.string().default(""),
  canonical_url: z.string().optional(),
  category_ids: z.array(z.number()).nullable().optional(),
  tags: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((t) => t ?? []),
  glossary: z
    .array(glossaryEntrySchema)
    .nullable()
    .default([])
    .transform((g) => g ?? []),
  likes: z.number().default(0),
  claps: z.number().default(0),
  my_claps: z.number().default(0),
  comments_count: z.number().default(0),
  views: z.number().default(0),
  bookmarked: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Post = z.infer<typeof postSchema>;

/** "/@author/slug"; anonymous posts fall back to /p/slug. */
export const postPath = (p: { author: string; slug: string }) => (p.author ? `/@${p.author}/${p.slug}` : `/p/${p.slug}`);

/** Plain-text preview of a markdown body, cut at a word boundary. */
export const excerpt = (md: string, max = 160): string => {
  const text = md
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, " ") // fenced code, live HTML blocks included
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 0 ? cut.slice(0, sp) : cut).trimEnd()}…`;
};

export const readTime = (minutes: number) => `${Math.max(1, minutes)} min`;

export const profileSchema = z.object({
  id: z.number(),
  username: z.string(),
  display_name: z.string().default(""),
  bio: z.string().default(""),
  avatar_url: z.string().default(""),
  created_at: z.string(),
  posts: z.number().default(0),
  followers: z.number().default(0),
  following: z.number().default(0),
  is_following: z.boolean().default(false),
  is_subscribed: z.boolean().default(false),
  pinned_post_id: z.number().default(0),
});
export type Profile = z.infer<typeof profileSchema>;

export const suggestionSchema = z.object({
  id: z.number(),
  username: z.string(),
  display_name: z.string().default(""),
  avatar_url: z.string().default(""),
  followers: z.number().default(0),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const tagSchema = z.object({ name: z.string(), count: z.number().default(0) });
export type Tag = z.infer<typeof tagSchema>;

/** `GET /api/stats/site`: unique view totals, counts and the five most viewed posts and public diagrams. */
export const siteStatsSchema = z.object({
  totals: z.object({
    post_views: z.number().default(0),
    diagram_views: z.number().default(0),
    visitors: z.number().default(0),
    posts: z.number().default(0),
    diagrams: z.number().default(0),
    users: z.number().default(0),
  }),
  top_posts: z
    .array(z.object({ id: z.number(), slug: z.string(), title: z.string(), author: z.string().default(""), views: z.number().default(0) }))
    .default([]),
  top_diagrams: z.array(z.object({ slug: z.string(), title: z.string(), author: z.string().default(""), views: z.number().default(0) })).default([]),
});
export type SiteStats = z.infer<typeof siteStatsSchema>;
