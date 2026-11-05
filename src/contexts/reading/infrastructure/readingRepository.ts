import { z } from "zod";
import { http } from "@/shared/api";
import { dataEnvelope, type Page, type PageRequest, pageEnvelope } from "@/shared/http";
import { type Post, type Profile, postSchema, profileSchema, type Suggestion, suggestionSchema, type Tag, tagSchema } from "../domain/post";

const arr = <S extends z.ZodType>(s: S) =>
  dataEnvelope(
    z
      .array(s)
      .nullable()
      .transform((v) => (v ?? []) as z.output<S>[]),
  );
const paging = (r: PageRequest) => ({ page: r.page, limit: r.limit, cursor: r.cursor });

/** Which list a feed shows. */
export type FeedSource =
  | { kind: "latest" }
  | { kind: "for-you" }
  | { kind: "following" }
  | { kind: "tag"; tag: string }
  | { kind: "search"; q: string }
  | { kind: "user"; username: string }
  | { kind: "bookmarks" }
  | { kind: "publication"; slug: string }
  | { kind: "list"; slug: string }
  | { kind: "mine"; status: "published" | "draft" | "scheduled" };

const feedPath = (s: FeedSource): [string, Record<string, string>] => {
  switch (s.kind) {
    case "latest":
      return ["/posts", {}];
    case "for-you":
      return ["/me/for-you", {}];
    case "following":
      return ["/me/feed", {}];
    case "tag":
      return ["/posts", { tag: s.tag }];
    case "search":
      return ["/posts", { q: s.q }];
    case "user":
      return [`/users/${encodeURIComponent(s.username)}/posts`, {}];
    case "bookmarks":
      return ["/me/bookmarks", {}];
    case "publication":
      return [`/publications/${encodeURIComponent(s.slug)}/posts`, {}];
    case "list":
      return [`/lists/${encodeURIComponent(s.slug)}/posts`, {}];
    case "mine":
      return ["/me/posts", { status: s.status }];
  }
};

export const readingRepository = {
  async feed(source: FeedSource, req: PageRequest, signal?: AbortSignal): Promise<Page<Post>> {
    const [path, q] = feedPath(source);
    return http(path, { query: { ...q, ...paging(req) }, schema: pageEnvelope(postSchema), signal });
  },
  async bySlug(slug: string, signal?: AbortSignal): Promise<Post> {
    return (await http(`/slug/${encodeURIComponent(slug)}`, { schema: dataEnvelope(postSchema), signal })).data;
  },
  async byId(id: number, signal?: AbortSignal): Promise<Post> {
    return (await http(`/posts/${id}`, { schema: dataEnvelope(postSchema), signal })).data;
  },
  async trending(signal?: AbortSignal): Promise<Post[]> {
    return (await http("/posts/trending", { query: { limit: 6 }, schema: arr(postSchema), signal })).data;
  },
  async related(id: number, signal?: AbortSignal): Promise<Post[]> {
    return (await http(`/posts/${id}/related`, { schema: arr(postSchema), signal })).data;
  },
  async tags(signal?: AbortSignal): Promise<Tag[]> {
    return (await http("/tags", { schema: arr(tagSchema), signal })).data;
  },
  async profile(username: string, signal?: AbortSignal): Promise<Profile> {
    return (await http(`/users/${encodeURIComponent(username)}`, { schema: dataEnvelope(profileSchema), signal })).data;
  },
  async suggestions(signal?: AbortSignal): Promise<Suggestion[]> {
    return (await http("/me/suggestions/users", { query: { limit: 3 }, schema: arr(suggestionSchema), signal })).data;
  },
  async view(id: number): Promise<void> {
    await http(`/posts/${id}/view`, { method: "POST" }).catch(() => undefined);
  },
  async read(id: number, progress: number): Promise<void> {
    await http(`/posts/${id}/read`, { method: "POST", body: { progress } }).catch(() => undefined);
  },
};
