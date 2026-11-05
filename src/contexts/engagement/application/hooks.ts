import { type InfiniteData, infiniteQueryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { Post } from "@/contexts/reading/domain/post";
import { nextPageRequest, type Page, type PageRequest } from "@/shared/http";
import { addClaps, type Comment } from "../domain/engagement";
import type { FeedbackPayload } from "../domain/feedback";
import type { ReportTarget } from "../domain/report";
import { engagementRepository } from "../infrastructure/engagementRepository";

type Patch = (p: Post) => Post;

/** Applies a change to a post everywhere it is cached (feeds and detail). */
export function usePatchPost() {
  const qc = useQueryClient();
  return (id: number, patch: Patch) => {
    qc.setQueriesData<Post>({ queryKey: ["post"] }, (p) => (p && p.id === id ? patch(p) : p));
    qc.setQueriesData<InfiniteData<Page<Post>>>({ queryKey: ["feed"] }, (d) =>
      d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, items: pg.items.map((p) => (p.id === id ? patch(p) : p)) })) } : d,
    );
  };
}

/**
 * Clapping: the count rises immediately; taps within 600ms are batched
 * into one POST /clap (max 50 per reader, enforced in the domain).
 */
export function useClap(post: Pick<Post, "id" | "claps" | "my_claps">) {
  const patch = usePatchPost();
  const pending = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = useMutation({
    mutationFn: (n: number) => engagementRepository.clap(post.id, n),
    onSuccess: (p) => patch(p.id, (old) => ({ ...old, claps: p.claps, my_claps: p.my_claps })),
  });
  return () => {
    const r = addClaps({ claps: post.claps, myClaps: post.my_claps }, 1);
    if (!r.added) return 0;
    pending.current += 1;
    patch(post.id, (p) => ({ ...p, claps: p.claps + 1, my_claps: p.my_claps + 1 }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const n = pending.current;
      pending.current = 0;
      send.mutate(n);
    }, 600);
    return 1;
  };
}

export function useBookmark() {
  const patch = usePatchPost();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => engagementRepository.bookmark(id, on),
    onMutate: ({ id, on }) => patch(id, (p) => ({ ...p, bookmarked: on })),
    onError: (_e, { id, on }) => patch(id, (p) => ({ ...p, bookmarked: !on })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed", { kind: "bookmarks" }] }),
  });
}

export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, on }: { username: string; on: boolean }) => engagementRepository.follow(username, on),
    onSettled: (_d, _e, { username }) => {
      void qc.invalidateQueries({ queryKey: ["profile", username] });
      void qc.invalidateQueries({ queryKey: ["suggestions"] });
      void qc.invalidateQueries({ queryKey: ["feed", { kind: "following" }] });
    },
  });
}

export const commentsQuery = (postId: number) =>
  infiniteQueryOptions({
    queryKey: ["comments", postId],
    queryFn: ({ pageParam, signal }) => engagementRepository.comments(postId, pageParam, signal),
    initialPageParam: { limit: 50 } as PageRequest,
    getNextPageParam: (last) => nextPageRequest(last.meta, 50),
  });

export function useComment(postId: number) {
  const qc = useQueryClient();
  const patch = usePatchPost();
  return useMutation({
    mutationFn: (v: { text: string; parent_id?: number }) => engagementRepository.comment(postId, v),
    onSuccess: () => {
      patch(postId, (p) => ({ ...p, comments_count: p.comments_count + 1 }));
      return qc.invalidateQueries({ queryKey: ["comments", postId] });
    },
  });
}

export function useDeleteComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: engagementRepository.deleteComment, onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }) });
}

export const notificationsQuery = () =>
  infiniteQueryOptions({
    queryKey: ["notifications"],
    queryFn: ({ pageParam, signal }) => engagementRepository.notifications(pageParam, signal),
    initialPageParam: { limit: 20 } as PageRequest,
    getNextPageParam: (last) => nextPageRequest(last.meta, 20),
    refetchInterval: 60_000,
  });

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: engagementRepository.markAllRead, onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
}

type NotifPages = { pages: { items: { id: number; unread: boolean; read_at?: string | null }[]; unread: number }[]; pageParams: unknown[] };

/** Mark one notification read: the list updates at once (and the unread count drops), a failure puts it back. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: engagementRepository.markRead,
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueriesData<NotifPages>({ queryKey: ["notifications"] });
      qc.setQueriesData<NotifPages>({ queryKey: ["notifications"] }, (d) => {
        if (!d?.pages) return d;
        const hit = d.pages.some((pg) => pg.items.some((n) => n.id === id && n.unread));
        if (!hit) return d;
        return {
          ...d,
          pages: d.pages.map((pg, i) => ({
            ...pg,
            unread: i === 0 ? Math.max(0, pg.unread - 1) : pg.unread,
            items: pg.items.map((n) => (n.id === id ? { ...n, unread: false, read_at: n.read_at ?? new Date().toISOString() } : n)),
          })),
        };
      });
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      for (const [k, v] of ctx?.prev ?? []) qc.setQueryData(k, v);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useEditComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => engagementRepository.editComment(id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
  });
}

export function useLikeComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => engagementRepository.likeComment(id, on),
    onMutate: ({ id, on }) =>
      qc.setQueryData<InfiniteData<Page<Comment>>>(["comments", postId], (d) =>
        d
          ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === id ? { ...c, liked: on, likes: c.likes + (on ? 1 : -1) } : c)) })) }
          : d,
      ),
    onError: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
  });
}

export const useSendFeedback = () => useMutation({ mutationFn: (p: FeedbackPayload) => engagementRepository.feedback(p) });

export const useReport = () =>
  useMutation({ mutationFn: (v: { target: ReportTarget; reason: string; note: string }) => engagementRepository.report(v.target, v.reason, v.note) });
