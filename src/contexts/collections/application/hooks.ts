import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { nextPageRequest, type PageRequest } from "@/shared/http";
import type { ListInput } from "../domain/collections";
import { highlightsRepository, listsRepository, publicationsRepository, seriesRepository } from "../infrastructure/collectionsRepository";

const LIMIT = 20;
const paged = <T>(queryKey: readonly unknown[], fetch: (r: PageRequest, s: AbortSignal) => Promise<import("@/shared/http").Page<T>>) =>
  infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetch(pageParam, signal),
    initialPageParam: { limit: LIMIT } as PageRequest,
    getNextPageParam: (l) => nextPageRequest(l.meta, LIMIT),
  });

export const myListsQuery = (postId?: number) => paged(["lists", "mine", postId ?? 0], (r, s) => listsRepository.mine(r, postId, s));
export const userListsQuery = (u: string) => paged(["lists", "user", u], (r, s) => listsRepository.ofUser(u, r, s));
export const listQuery = (slug: string) => queryOptions({ queryKey: ["lists", "one", slug], queryFn: ({ signal }) => listsRepository.get(slug, signal) });
export const listPostsQuery = (slug: string) => paged(["lists", "posts", slug], (r, s) => listsRepository.posts(slug, r, s));

export function useListMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["lists"] });
  return {
    create: useMutation({ mutationFn: listsRepository.create, onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ slug, body }: { slug: string; body: ListInput }) => listsRepository.update(slug, body), onSuccess: refresh }),
    remove: useMutation({ mutationFn: listsRepository.remove, onSuccess: refresh }),
    setPost: useMutation({
      mutationFn: ({ slug, postId, on }: { slug: string; postId: number; on: boolean }) => listsRepository.setPost(slug, postId, on),
      onSuccess: refresh,
    }),
  };
}

export const userSeriesQuery = (u: string) => queryOptions({ queryKey: ["series", "user", u], queryFn: ({ signal }) => seriesRepository.ofUser(u, signal) });
export const seriesQuery = (slug: string) => queryOptions({ queryKey: ["series", "one", slug], queryFn: ({ signal }) => seriesRepository.get(slug, signal) });
export const postSeriesQuery = (id: number) => queryOptions({ queryKey: ["series", "post", id], queryFn: ({ signal }) => seriesRepository.ofPost(id, signal) });

export function useSeriesMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["series"] });
  return {
    create: useMutation({ mutationFn: seriesRepository.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ slug, body }: { slug: string; body: { title: string; description: string } }) => seriesRepository.update(slug, body),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: seriesRepository.remove, onSuccess: refresh }),
    setPosts: useMutation({ mutationFn: ({ slug, ids }: { slug: string; ids: number[] }) => seriesRepository.setPosts(slug, ids), onSuccess: refresh }),
  };
}

export const highlightsQuery = (id: number) => queryOptions({ queryKey: ["highlights", id], queryFn: ({ signal }) => highlightsRepository.ofPost(id, signal) });
export function useHighlightMutations(postId: number) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["highlights", postId] });
  return {
    add: useMutation({ mutationFn: ({ start, end }: { start: number; end: number }) => highlightsRepository.add(postId, start, end), onSuccess: refresh }),
    remove: useMutation({ mutationFn: highlightsRepository.remove, onSuccess: refresh }),
  };
}

export const myPublicationsQuery = () => queryOptions({ queryKey: ["pubs", "mine"], queryFn: ({ signal }) => publicationsRepository.mine(signal) });
export const publicationQuery = (slug: string) =>
  queryOptions({ queryKey: ["pubs", "one", slug], queryFn: ({ signal }) => publicationsRepository.get(slug, signal) });
export const membersQuery = (slug: string) =>
  queryOptions({ queryKey: ["pubs", "members", slug], queryFn: ({ signal }) => publicationsRepository.members(slug, signal) });
export const publicationPostsQuery = (slug: string) => paged(["pubs", "posts", slug], (r, s) => publicationsRepository.posts(slug, r, s));

export function usePublicationMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["pubs"] });
  return {
    create: useMutation({ mutationFn: publicationsRepository.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ slug, body }: { slug: string; body: { name: string; description: string; avatar_url: string } }) =>
        publicationsRepository.update(slug, body),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: publicationsRepository.remove, onSuccess: refresh }),
    setMember: useMutation({
      mutationFn: ({ slug, u, role }: { slug: string; u: string; role: "editor" | "writer" }) => publicationsRepository.setMember(slug, u, role),
      onSuccess: refresh,
    }),
    removeMember: useMutation({ mutationFn: ({ slug, u }: { slug: string; u: string }) => publicationsRepository.removeMember(slug, u), onSuccess: refresh }),
  };
}
