import { z } from "zod";
import { type Post, postSchema } from "@/contexts/reading/domain/post";
import { http } from "@/shared/api";
import { dataEnvelope, type Page, type PageRequest, pageEnvelope } from "@/shared/http";
import { revisionDetailSchema, revisionSchema } from "../domain/revision";
import { dailySchema, type PostStat, postStatSchema } from "../domain/stats";
import type { DraftPayload } from "../domain/story";
export const storyRepository = {
  async create(body: DraftPayload): Promise<Post> {
    return (await http("/posts", { method: "POST", body, schema: dataEnvelope(postSchema) })).data;
  },
  async update(id: number, body: DraftPayload): Promise<Post> {
    return (await http(`/posts/${id}`, { method: "PUT", body, schema: dataEnvelope(postSchema) })).data;
  },
  async remove(id: number): Promise<void> {
    await http(`/posts/${id}`, { method: "DELETE" });
  },
};

/** POST /posts/preview: the body rendered and sanitized by the same server code that renders published stories. */
export async function previewBody(body: string, signal?: AbortSignal): Promise<string> {
  const r = await http("/posts/preview", { method: "POST", body: { body }, schema: dataEnvelope(z.object({ body_html: z.string() })), signal });
  return r.data.body_html;
}

export const studioRepository = {
  stats: (r: PageRequest, signal?: AbortSignal): Promise<Page<PostStat>> =>
    http("/me/stats", { query: { page: r.page, limit: r.limit, cursor: r.cursor }, schema: pageEnvelope(postStatSchema), signal }),
  daily: async (id: number, days = 30, signal?: AbortSignal) =>
    (await http(`/me/stats/${id}`, { query: { days }, schema: dataEnvelope(dailySchema), signal })).data,
  pin: (postId: number | null) =>
    (postId ? http("/me/pin", { method: "PUT", body: { post_id: postId } }) : http("/me/pin", { method: "DELETE" })).then(() => undefined),
  async importUrl(url: string): Promise<Post> {
    return (await http("/posts/import", { method: "POST", body: { url }, schema: dataEnvelope(postSchema) })).data;
  },
  revisions: async (id: number, signal?: AbortSignal) =>
    (
      await http(`/posts/${id}/revisions`, {
        schema: dataEnvelope(
          z
            .array(revisionSchema)
            .nullable()
            .transform((v) => v ?? []),
        ),
        signal,
      })
    ).data,
  revision: async (id: number, v: number, signal?: AbortSignal) =>
    (await http(`/posts/${id}/revisions/${v}`, { schema: dataEnvelope(revisionDetailSchema), signal })).data,
  restore: (id: number, v: number) => http(`/posts/${id}/revisions/${v}/restore`, { method: "POST" }).then(() => undefined),
};
