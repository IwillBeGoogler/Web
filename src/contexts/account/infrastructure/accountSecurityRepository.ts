import { z } from "zod";
import { sessionSchema } from "@/contexts/identity/domain/account";
import { http } from "@/shared/api";
import { dataEnvelope, type Page, type PageRequest, pageEnvelope } from "@/shared/http";
import {
  backupCodesSchema,
  type Device,
  deviceSchema,
  type Hidden,
  hiddenSchema,
  type MfaStatus,
  mfaSetupSchema,
  mfaStatusSchema,
  type UserSummary,
  userSummarySchema,
} from "../domain/account";

const q = (r: PageRequest) => ({ page: r.page, limit: r.limit, cursor: r.cursor });

export const accountSecurityRepository = {
  forgot: (email: string) => http("/auth/forgot-password", { method: "POST", body: { email }, noRefresh: true }).then(() => undefined),
  reset: (token: string, password: string) =>
    http("/auth/reset-password", { method: "POST", body: { token, password }, noRefresh: true }).then(() => undefined),
  verifyEmail: (code: string) => http("/auth/verify-email", { method: "POST", body: { code }, noRefresh: true }).then(() => undefined),
  resendVerification: () => http("/me/verify-email", { method: "POST" }).then(() => undefined),
  unsubscribe: (s: string, a: string, sig: string) => http("/unsubscribe", { method: "POST", query: { s, a, sig }, noRefresh: true }).then(() => undefined),
  async changePassword(old_password: string, new_password: string) {
    return (await http("/me/password", { method: "PUT", body: { old_password, new_password }, schema: dataEnvelope(sessionSchema) })).data;
  },
  deleteAccount: (password: string) => http("/me", { method: "DELETE", body: { password } }).then(() => undefined),
  logoutAll: () => http("/auth/logout-all", { method: "POST" }).then(() => undefined),
  async devices(signal?: AbortSignal): Promise<Device[]> {
    return (
      await http("/me/sessions", {
        schema: dataEnvelope(
          z
            .array(deviceSchema)
            .nullable()
            .transform((v) => v ?? []),
        ),
        signal,
      })
    ).data;
  },
  revokeDevice: (id: string) => http(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => undefined),
  async mfa(signal?: AbortSignal): Promise<MfaStatus> {
    return (await http("/me/2fa", { schema: dataEnvelope(mfaStatusSchema), signal })).data;
  },
  async mfaSetup() {
    return (await http("/me/2fa/setup", { method: "POST", schema: dataEnvelope(mfaSetupSchema) })).data;
  },
  async mfaEnable(code: string) {
    return (await http("/me/2fa/enable", { method: "POST", body: { code }, schema: dataEnvelope(backupCodesSchema) })).data.backup_codes;
  },
  mfaDisable: (password: string, code: string) => http("/me/2fa/disable", { method: "POST", body: { password, code } }).then(() => undefined),
  async mfaBackupCodes(code: string) {
    return (await http("/me/2fa/backup-codes", { method: "POST", body: { code }, schema: dataEnvelope(backupCodesSchema) })).data.backup_codes;
  },
  blocks: (r: PageRequest, signal?: AbortSignal): Promise<Page<UserSummary>> =>
    http("/me/blocks", { query: q(r), schema: pageEnvelope(userSummarySchema), signal }),
  mutes: (r: PageRequest, signal?: AbortSignal): Promise<Page<UserSummary>> =>
    http("/me/mutes", { query: q(r), schema: pageEnvelope(userSummarySchema), signal }),
  hidden: (r: PageRequest, signal?: AbortSignal): Promise<Page<Hidden>> => http("/me/hidden", { query: q(r), schema: pageEnvelope(hiddenSchema), signal }),
  hide: (kind: Hidden["kind"], target: string) => http("/me/hidden", { method: "POST", body: { kind, target } }).then(() => undefined),
  unhide: (kind: Hidden["kind"], target: string) => http(`/me/hidden/${kind}/${encodeURIComponent(target)}`, { method: "DELETE" }).then(() => undefined),
  async followedTags(signal?: AbortSignal): Promise<string[]> {
    return (
      await http("/me/tags", {
        schema: dataEnvelope(
          z
            .array(z.string())
            .nullable()
            .transform((v) => v ?? []),
        ),
        signal,
      })
    ).data;
  },
  followTag: (tag: string, on: boolean) => http(`/tags/${encodeURIComponent(tag)}/follow`, { method: on ? "POST" : "DELETE" }).then(() => undefined),
  block: (u: string, on: boolean) => http(`/users/${encodeURIComponent(u)}/block`, { method: on ? "POST" : "DELETE" }).then(() => undefined),
  mute: (u: string, on: boolean) => http(`/users/${encodeURIComponent(u)}/mute`, { method: on ? "POST" : "DELETE" }).then(() => undefined),
  subscribe: (u: string, on: boolean) => http(`/users/${encodeURIComponent(u)}/subscribe`, { method: on ? "POST" : "DELETE" }).then(() => undefined),
  followers: (u: string, r: PageRequest, signal?: AbortSignal): Promise<Page<UserSummary>> =>
    http(`/users/${encodeURIComponent(u)}/followers`, { query: q(r), schema: pageEnvelope(userSummarySchema), signal }),
  following: (u: string, r: PageRequest, signal?: AbortSignal): Promise<Page<UserSummary>> =>
    http(`/users/${encodeURIComponent(u)}/following`, { query: q(r), schema: pageEnvelope(userSummarySchema), signal }),
};
