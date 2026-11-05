import { z } from "zod";
import { postSchema } from "@/contexts/reading/domain/post";
import { http } from "@/shared/api";
import { dataEnvelope, type PageRequest, pageEnvelope } from "@/shared/http";
import { highlightsSchema, type ListInput, listSchema, memberSchema, placeSchema, publicationSchema, seriesSchema } from "../domain/collections";

const q = (r: PageRequest) => ({ page: r.page, limit: r.limit, cursor: r.cursor });
const arr = <S extends z.ZodType>(s: S) =>
  dataEnvelope(
    z
      .array(s)
      .nullable()
      .transform((v) => (v ?? []) as z.output<S>[]),
  );
const e = encodeURIComponent;

export const listsRepository = {
  mine: (r: PageRequest, postId?: number, signal?: AbortSignal) =>
    http("/me/lists", { query: { ...q(r), post_id: postId }, schema: pageEnvelope(listSchema), signal }),
  ofUser: (u: string, r: PageRequest, signal?: AbortSignal) => http(`/users/${e(u)}/lists`, { query: q(r), schema: pageEnvelope(listSchema), signal }),
  get: async (slug: string, signal?: AbortSignal) => (await http(`/lists/${e(slug)}`, { schema: dataEnvelope(listSchema), signal })).data,
  posts: (slug: string, r: PageRequest, signal?: AbortSignal) => http(`/lists/${e(slug)}/posts`, { query: q(r), schema: pageEnvelope(postSchema), signal }),
  create: async (body: ListInput) => (await http("/lists", { method: "POST", body, schema: dataEnvelope(listSchema) })).data,
  update: async (slug: string, body: ListInput) => (await http(`/lists/${e(slug)}`, { method: "PATCH", body, schema: dataEnvelope(listSchema) })).data,
  remove: (slug: string) => http(`/lists/${e(slug)}`, { method: "DELETE" }).then(() => undefined),
  setPost: (slug: string, postId: number, on: boolean) => http(`/lists/${e(slug)}/posts/${postId}`, { method: on ? "PUT" : "DELETE" }).then(() => undefined),
};

export const seriesRepository = {
  ofUser: async (u: string, signal?: AbortSignal) => (await http(`/users/${e(u)}/series`, { schema: arr(seriesSchema), signal })).data,
  get: async (slug: string, signal?: AbortSignal) => (await http(`/series/${e(slug)}`, { schema: dataEnvelope(seriesSchema), signal })).data,
  /** Where a post sits in its series; null when it is in none (404). */
  async ofPost(id: number, signal?: AbortSignal) {
    try {
      return (await http(`/posts/${id}/series`, { schema: dataEnvelope(placeSchema), signal })).data;
    } catch (x) {
      if ((x as { status?: number }).status === 404) return null;
      throw x;
    }
  },
  create: async (body: { title: string; description: string }) => (await http("/series", { method: "POST", body, schema: dataEnvelope(seriesSchema) })).data,
  update: async (slug: string, body: { title: string; description: string }) =>
    (await http(`/series/${e(slug)}`, { method: "PATCH", body, schema: dataEnvelope(seriesSchema) })).data,
  remove: (slug: string) => http(`/series/${e(slug)}`, { method: "DELETE" }).then(() => undefined),
  setPosts: (slug: string, post_ids: number[]) => http(`/series/${e(slug)}/posts`, { method: "PUT", body: { post_ids } }).then(() => undefined),
};

export const highlightsRepository = {
  ofPost: async (id: number, signal?: AbortSignal) => (await http(`/posts/${id}/highlights`, { schema: dataEnvelope(highlightsSchema), signal })).data,
  add: (id: number, start: number, end: number) => http(`/posts/${id}/highlights`, { method: "POST", body: { start, end } }).then(() => undefined),
  remove: (hid: number) => http(`/highlights/${hid}`, { method: "DELETE" }).then(() => undefined),
};

export const publicationsRepository = {
  mine: async (signal?: AbortSignal) => (await http("/me/publications", { schema: arr(publicationSchema), signal })).data,
  get: async (slug: string, signal?: AbortSignal) => (await http(`/publications/${e(slug)}`, { schema: dataEnvelope(publicationSchema), signal })).data,
  members: async (slug: string, signal?: AbortSignal) =>
    (await http(`/publications/${e(slug)}/members`, { schema: z.object({ data: z.array(memberSchema).nullable() }).loose(), signal })).data ?? [],
  posts: (slug: string, r: PageRequest, signal?: AbortSignal) =>
    http(`/publications/${e(slug)}/posts`, { query: q(r), schema: pageEnvelope(postSchema), signal }),
  create: async (body: { slug: string; name: string; description: string; avatar_url?: string }) =>
    (await http("/publications", { method: "POST", body, schema: dataEnvelope(publicationSchema) })).data,
  update: async (slug: string, body: { name: string; description: string; avatar_url: string }) =>
    (await http(`/publications/${e(slug)}`, { method: "PATCH", body, schema: dataEnvelope(publicationSchema) })).data,
  remove: (slug: string) => http(`/publications/${e(slug)}`, { method: "DELETE" }).then(() => undefined),
  setMember: (slug: string, u: string, role: "editor" | "writer") =>
    http(`/publications/${e(slug)}/members/${e(u)}`, { method: "PUT", body: { role } }).then(() => undefined),
  removeMember: (slug: string, u: string) => http(`/publications/${e(slug)}/members/${e(u)}`, { method: "DELETE" }).then(() => undefined),
};
