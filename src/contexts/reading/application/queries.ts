import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { nextPageRequest, type Page, type PageRequest } from "@/shared/http";
import type { Post } from "../domain/post";
import { buildTree } from "../domain/topic";
import { type FeedSource, readingRepository } from "../infrastructure/readingRepository";

export const FEED_PAGE_SIZE = 10;
const LIMIT = FEED_PAGE_SIZE;

export const readingKeys = {
  feeds: ["feed"] as const,
  feed: (s: FeedSource) => ["feed", s] as const,
  post: (slug: string) => ["post", slug] as const,
};

export const feedQuery = (source: FeedSource) =>
  infiniteQueryOptions({
    queryKey: readingKeys.feed(source),
    queryFn: ({ pageParam, signal }) => readingRepository.feed(source, pageParam, signal),
    initialPageParam: { limit: LIMIT } as PageRequest,
    getNextPageParam: (last: Page<Post>) => nextPageRequest(last.meta, LIMIT),
  });

/** First page only, sized for preview tiles that never paginate. */
export const feedPreviewQuery = (source: FeedSource, limit: number) =>
  queryOptions({
    queryKey: ["feed-preview", source, limit],
    queryFn: async ({ signal }) => (await readingRepository.feed(source, { limit }, signal)).items,
    staleTime: 60_000,
  });

export const postQuery = (slug: string) => queryOptions({ queryKey: readingKeys.post(slug), queryFn: ({ signal }) => readingRepository.bySlug(slug, signal) });
export const postByIdQuery = (id: number) => queryOptions({ queryKey: ["post-id", id], queryFn: ({ signal }) => readingRepository.byId(id, signal) });
/** Site-wide glossary for the reader's language; it changes rarely. */
export const glossaryQuery = (lang: string) =>
  queryOptions({ queryKey: ["glossary", lang], queryFn: ({ signal }) => readingRepository.glossary(lang, signal), staleTime: 30 * 60_000 });
export const trendingQuery = () => queryOptions({ queryKey: ["trending"], queryFn: ({ signal }) => readingRepository.trending(signal), staleTime: 5 * 60_000 });
export const siteStatsQuery = () => queryOptions({ queryKey: ["site-stats"], queryFn: ({ signal }) => readingRepository.siteStats(signal), staleTime: 60_000 });
export const relatedQuery = (id: number) => queryOptions({ queryKey: ["related", id], queryFn: ({ signal }) => readingRepository.related(id, signal) });
export const tagsQuery = () =>
  queryOptions({
    queryKey: ["tags"],
    queryFn: async ({ signal }) => (await readingRepository.tags(signal)).sort((a, b) => b.count - a.count),
    staleTime: 5 * 60_000,
  });
/** The whole topic tree in one request, shared by the menu, /topics and every topic page. */
export const topicsQuery = () =>
  queryOptions({
    queryKey: ["topics"],
    queryFn: async ({ signal }) => buildTree(await readingRepository.topics(signal)),
    staleTime: 10 * 60_000,
  });
export const profileQuery = (username: string) =>
  queryOptions({ queryKey: ["profile", username], queryFn: ({ signal }) => readingRepository.profile(username, signal) });
export const suggestionsQuery = () =>
  queryOptions({ queryKey: ["suggestions"], queryFn: ({ signal }) => readingRepository.suggestions(signal), staleTime: 5 * 60_000 });
