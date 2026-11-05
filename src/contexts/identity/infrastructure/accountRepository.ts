import { http } from "@/shared/api";
import { dataEnvelope } from "@/shared/http";
import {
  type LoginInput,
  type LoginResult,
  loginResultSchema,
  type RegisterRequest,
  type Session,
  sessionSchema,
  type User,
  userSchema,
} from "../domain/account";

export const accountRepository = {
  async login(body: LoginInput): Promise<LoginResult> {
    return (await http("/auth/login", { method: "POST", body, schema: dataEnvelope(loginResultSchema), noRefresh: true })).data;
  },
  async loginMfa(mfaToken: string, code: string): Promise<Session> {
    return (await http("/auth/login/2fa", { method: "POST", body: { mfa_token: mfaToken, code }, schema: dataEnvelope(sessionSchema), noRefresh: true })).data;
  },
  async register(body: RegisterRequest): Promise<Session> {
    return (await http("/auth/register", { method: "POST", body, schema: dataEnvelope(sessionSchema), noRefresh: true })).data;
  },
  async logout(): Promise<void> {
    await http("/auth/logout", { method: "POST", noRefresh: true }).catch(() => undefined);
  },
  async me(signal?: AbortSignal): Promise<User> {
    return (await http("/me", { schema: dataEnvelope(userSchema), signal })).data;
  },
  async updateProfile(body: { display_name: string; bio: string; avatar_url: string }): Promise<User> {
    return (await http("/me", { method: "PATCH", body, schema: dataEnvelope(userSchema) })).data;
  },
};
