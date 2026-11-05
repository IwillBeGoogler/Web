import { z } from "zod";

export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().optional(),
  email_verified: z.boolean().optional().default(false),
  display_name: z.string().default(""),
  bio: z.string().default(""),
  avatar_url: z.string().default(""),
  roles: z.array(z.string()).nullable().default([]),
  created_at: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({ token: z.string().min(1), expires_at: z.string(), user: userSchema });
export type Session = z.infer<typeof sessionSchema>;

export const loginResultSchema = z.union([
  sessionSchema.transform((s) => ({ kind: "session" as const, ...s })),
  z.object({ mfa_required: z.literal(true), mfa_token: z.string().min(1) }).transform((c) => ({ kind: "mfa" as const, mfaToken: c.mfa_token })),
]);
export type LoginResult = z.infer<typeof loginResultSchema>;

const bytes = (s: string) => new TextEncoder().encode(s).length;

export const loginInputSchema = z.object({
  login: z.string().trim().min(1, "Required"),
  password: z.string().min(1, "Required"),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** Same rules as POST /auth/register. */
export const registerInputSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,32}$/, "3–32 letters, digits or _"),
  email: z.email("Enter a valid email").trim(),
  password: z
    .string()
    .refine((p) => bytes(p) >= 8, "At least 8 characters")
    .refine((p) => bytes(p) <= 72, "Too long"),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;
/** Anti-bot fields sent with signup: Turnstile token and the honeypot (must stay empty). */
export type RegisterRequest = RegisterInput & { captcha_token?: string; website?: string };

export const mfaInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,20}$/, "Enter your 6-digit code"),
});

export const displayName = (u: { username: string; display_name?: string | undefined }) => u.display_name?.trim() || u.username;

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
