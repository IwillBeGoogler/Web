import { z } from "zod";

const bytes = (s: string) => new TextEncoder().encode(s).length;
const okUrl = (u: string) => !u || u.startsWith("/api/uploads/") || /^https?:\/\//i.test(u);
/** `<input type="datetime-local">` value is a future instant. */
const isFuture = (local: string, now = Date.now()) => {
  const t = new Date(local).getTime();
  return !Number.isNaN(t) && t > now;
};

/** datetime-local value <-> RFC 3339. */
export const toRFC3339 = (local: string) => (local ? new Date(local).toISOString() : null);
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const normTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

export const storyFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give your story a title")
      .refine((s) => bytes(s) <= 200, "Title is too long"),
    subtitle: z
      .string()
      .trim()
      .refine((s) => bytes(s) <= 300, "Subtitle is too long"),
    body: z.string().refine((s) => bytes(s) <= 100_000, "Story is too long"),
    status: z.enum(["draft", "published", "scheduled"]),
    publishAt: z.string(),
    publicationId: z.number().int().min(0),
    coverUrl: z.string().trim().refine(okUrl, "Use an uploaded image or an http(s) URL"),
    tags: z.array(z.string()).refine((t) => normTags(t).length <= 5, "Up to 5 topics"),
  })
  .refine((v) => v.status === "draft" || v.body.trim().length > 0, { path: ["body"], message: "Write something before publishing" })
  .refine((v) => v.status !== "scheduled" || isFuture(v.publishAt), { path: ["publishAt"], message: "Pick a time in the future" });
export type StoryForm = z.infer<typeof storyFormSchema>;

export const emptyStory = (): StoryForm => ({ title: "", subtitle: "", body: "", status: "draft", coverUrl: "", tags: [], publishAt: "", publicationId: 0 });

export const toDraft = (f: StoryForm) => ({
  title: f.title.trim(),
  subtitle: f.subtitle.trim(),
  body: f.body,
  status: f.status,
  cover_url: f.coverUrl.trim(),
  tags: normTags(f.tags),
  publish_at: f.status === "scheduled" ? toRFC3339(f.publishAt) : null,
  publication_id: f.publicationId,
});
export type DraftPayload = ReturnType<typeof toDraft>;

export const storyToForm = (p: {
  title: string;
  subtitle: string;
  body: string;
  status: string;
  cover_url: string;
  tags: string[];
  publish_at?: string | null | undefined;
  publication_id?: number | undefined;
}): StoryForm => ({
  title: p.title,
  subtitle: p.subtitle,
  body: p.body,
  status: p.status === "draft" ? "draft" : p.status === "scheduled" ? "scheduled" : "published",
  coverUrl: p.cover_url,
  tags: p.tags,
  publishAt: toLocalInput(p.publish_at),
  publicationId: p.publication_id ?? 0,
});
