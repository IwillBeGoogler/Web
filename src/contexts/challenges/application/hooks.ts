import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { nextPageRequest, type PageRequest } from "@/shared/http";
import type { ChallengeInput, ReminderSettings } from "../domain/challenges";
import { challengesRepository, type Tab } from "../infrastructure/challengesRepository";

const LIMIT = 20;

export const challengesQuery = (tab: Tab) =>
  infiniteQueryOptions({
    queryKey: ["challenges", "list", tab],
    queryFn: ({ pageParam, signal }) => challengesRepository.list(tab, pageParam, signal),
    initialPageParam: { limit: LIMIT } as PageRequest,
    getNextPageParam: (l) => nextPageRequest(l.meta, LIMIT),
  });
export const challengeQuery = (id: number) =>
  queryOptions({ queryKey: ["challenges", "one", id], queryFn: ({ signal }) => challengesRepository.get(id, signal) });
export const runningChallengesQuery = () =>
  queryOptions({ queryKey: ["challenges", "running"], queryFn: ({ signal }) => challengesRepository.running(signal) });
export const postChallengeQuery = (postId: number) =>
  queryOptions({ queryKey: ["challenges", "post", postId], queryFn: ({ signal }) => challengesRepository.ofPost(postId, signal) });

export const certificateQuery = (id: string) =>
  queryOptions({ queryKey: ["challenges", "certificate", id], queryFn: ({ signal }) => challengesRepository.certificate(id, signal) });

/** Refetched on every return to the tab: linking finishes in Telegram. */
export const telegramQuery = (userId: number) =>
  queryOptions({
    queryKey: ["telegram", userId],
    queryFn: ({ signal }) => challengesRepository.telegram(signal),
    refetchOnWindowFocus: "always",
  });

export function useTelegramMutations() {
  const qc = useQueryClient();
  return {
    link: useMutation({ mutationFn: challengesRepository.telegramLink }),
    unlink: useMutation({
      mutationFn: challengesRepository.telegramUnlink,
      onSettled: () => qc.invalidateQueries({ queryKey: ["telegram"] }),
    }),
  };
}

export function useChallengeMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["challenges"] });
  return {
    create: useMutation({ mutationFn: challengesRepository.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Omit<ChallengeInput, "days"> }) => challengesRepository.update(id, body),
      onSuccess: refresh,
    }),
    setReminders: useMutation({
      mutationFn: ({ id, body }: { id: number; body: ReminderSettings }) => challengesRepository.setReminders(id, body),
      onSettled: refresh,
    }),
    follow: useMutation({
      mutationFn: ({ id, on }: { id: number; on: boolean }) => challengesRepository.follow(id, on),
      onSettled: refresh,
    }),
    cheer: useMutation({ mutationFn: challengesRepository.cheer, onSettled: refresh }),
    remove: useMutation({
      mutationFn: challengesRepository.remove,
      // the deleted challenge's own query must not refetch into a 404
      onSuccess: (_, id) => {
        qc.removeQueries({ queryKey: ["challenges", "one", id] });
        return refresh();
      },
    }),
    claim: useMutation({ mutationFn: challengesRepository.claim, onSettled: refresh }),
    setPost: useMutation({
      mutationFn: ({ postId, from, to }: { postId: number; from: number; to: number }) => challengesRepository.setPost(postId, from, to),
      onSettled: refresh,
    }),
  };
}
