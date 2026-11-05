import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { tokens } from "@/shared/api";
import type { LoginInput, RegisterRequest, Session } from "../domain/account";
import { accountRepository } from "../infrastructure/accountRepository";

export const meKey = ["me"] as const;
export const meQuery = () => queryOptions({ queryKey: meKey, queryFn: ({ signal }) => accountRepository.me(signal), staleTime: 5 * 60_000 });

export const useToken = () => useSyncExternalStore(tokens.subscribe, tokens.get, tokens.get);

/** The signed-in reader, or null when anonymous. */
export function useMe() {
  const token = useToken();
  const q = useQuery({ ...meQuery(), enabled: token !== null });
  return { me: token ? (q.data ?? null) : null, loading: token !== null && q.isPending };
}

const useStore = () => {
  const qc = useQueryClient();
  return (s: Session) => {
    tokens.set({ token: s.token, expiresAt: s.expires_at });
    qc.setQueryData(meKey, s.user);
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  };
};

export function useLogin() {
  const store = useStore();
  return useMutation({
    mutationFn: (i: LoginInput) => accountRepository.login(i),
    onSuccess: (r) => {
      if (r.kind === "session") store(r);
    },
  });
}
export function useLoginMfa() {
  const store = useStore();
  return useMutation({ mutationFn: (v: { mfaToken: string; code: string }) => accountRepository.loginMfa(v.mfaToken, v.code), onSuccess: store });
}
export function useRegister() {
  const store = useStore();
  return useMutation({ mutationFn: (i: RegisterRequest) => accountRepository.register(i), onSuccess: store });
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => accountRepository.logout(),
    onSettled: () => {
      tokens.set(null);
      qc.clear();
    },
  });
}
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountRepository.updateProfile,
    onSuccess: (u) => {
      qc.setQueryData(meKey, u);
      void qc.invalidateQueries({ queryKey: ["profile", u.username] });
    },
  });
}
