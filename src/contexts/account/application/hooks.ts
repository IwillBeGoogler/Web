import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { meKey } from "@/contexts/identity/application/session";
import { tokens } from "@/shared/api";
import { nextPageRequest, type PageRequest } from "@/shared/http";
import type { Hidden } from "../domain/account";
import { accountSecurityRepository as repo } from "../infrastructure/accountSecurityRepository";

const paged = <T>(key: readonly unknown[], fetch: (r: PageRequest, s: AbortSignal) => Promise<import("@/shared/http").Page<T>>) =>
  infiniteQueryOptions({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetch(pageParam, signal),
    initialPageParam: { limit: 20 } as PageRequest,
    getNextPageParam: (last) => nextPageRequest(last.meta, 20),
  });

export const accountKeys = {
  mfa: ["account", "mfa"] as const,
  devices: ["account", "devices"] as const,
  blocks: ["account", "blocks"] as const,
  mutes: ["account", "mutes"] as const,
  hidden: ["account", "hidden"] as const,
  tags: ["account", "tags"] as const,
};

export const mfaQuery = () => queryOptions({ queryKey: accountKeys.mfa, queryFn: ({ signal }) => repo.mfa(signal) });
export const devicesQuery = () => queryOptions({ queryKey: accountKeys.devices, queryFn: ({ signal }) => repo.devices(signal) });
export const followedTagsQuery = () => queryOptions({ queryKey: accountKeys.tags, queryFn: ({ signal }) => repo.followedTags(signal), staleTime: 60_000 });
export const blocksQuery = () => paged(accountKeys.blocks, repo.blocks);
export const mutesQuery = () => paged(accountKeys.mutes, repo.mutes);
export const hiddenQuery = () => paged(accountKeys.hidden, repo.hidden);
export const followersQuery = (u: string, kind: "followers" | "following") =>
  paged(["people", u, kind], (r, s) => (kind === "followers" ? repo.followers(u, r, s) : repo.following(u, r, s)));

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { old_password: string; new_password: string }) => repo.changePassword(v.old_password, v.new_password),
    onSuccess: (s) => {
      tokens.set({ token: s.token, expiresAt: s.expires_at });
      void qc.invalidateQueries({ queryKey: accountKeys.devices });
    },
  });
}

export function useInvalidate(...keys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useSignOutEverywhere() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.logoutAll,
    onSettled: () => {
      tokens.set(null);
      qc.clear();
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repo.deleteAccount,
    onSuccess: () => {
      tokens.set(null);
      qc.clear();
    },
  });
}

export function useToggleTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tag, on }: { tag: string; on: boolean }) => repo.followTag(tag, on),
    onMutate: ({ tag, on }) => qc.setQueryData<string[]>(accountKeys.tags, (t = []) => (on ? [...new Set([...t, tag])] : t.filter((x) => x !== tag))),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.tags });
      void qc.invalidateQueries({ queryKey: ["feed", { kind: "for-you" }] });
    },
  });
}

export function useHide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, target, on }: { kind: Hidden["kind"]; target: string; on: boolean }) => (on ? repo.hide(kind, target) : repo.unhide(kind, target)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.hidden });
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["feed-preview"] });
    },
  });
}

export function useRelation(kind: "block" | "mute" | "subscribe") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, on }: { username: string; on: boolean }) => repo[kind](username, on),
    onSuccess: (_d, { username }) => {
      void qc.invalidateQueries({ queryKey: ["profile", username] });
      void qc.invalidateQueries({ queryKey: kind === "block" ? accountKeys.blocks : accountKeys.mutes });
      if (kind === "block") {
        void qc.invalidateQueries({ queryKey: ["feed"] });
        void qc.invalidateQueries({ queryKey: ["feed-preview"] });
      }
    },
  });
}

export { meKey };
