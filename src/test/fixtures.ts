import { HttpResponse, http } from "msw";
import { tokens } from "@/shared/api";
import { api, server } from "./server";

export const me = { id: 3, username: "admin", email: "a@x.dev", display_name: "Admin", bio: "", avatar_url: "", roles: [], created_at: "2026-01-01T00:00:00Z" };

export const makePost = (o: Record<string, unknown> = {}) => ({
  id: 1,
  title: "Hello iBlog",
  subtitle: "A subtitle",
  slug: "hello-iblog",
  status: "published",
  body: "Some body text here.",
  body_html: "<p>Some body text here.</p>",
  reading_time: 3,
  published_at: "2026-10-01T00:00:00Z",
  author: "ali",
  user_id: 1,
  publication_id: 0,
  cover_url: "",
  tags: ["go"],
  likes: 0,
  claps: 10,
  my_claps: 0,
  comments_count: 2,
  views: 0,
  bookmarked: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...o,
});

export const page = <T>(items: T[], meta: Record<string, unknown> = {}) =>
  HttpResponse.json({ data: items, meta: { page: 1, limit: 10, total: items.length, has_more: false, ...meta } });

export function signIn() {
  tokens.set({ token: "t", expiresAt: "2030-01-01T00:00:00Z" });
  server.use(http.get(api("/me"), () => HttpResponse.json({ data: me })));
}
