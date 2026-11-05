import { z } from "zod";

const bytes = (s: string) => new TextEncoder().encode(s).length;
export const newPassword = z
  .string()
  .refine((p) => bytes(p) >= 8, "At least 8 characters")
  .refine((p) => bytes(p) <= 72, "Too long");

export const passwordChangeSchema = z
  .object({ old_password: z.string().min(1, "Required"), new_password: newPassword, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => v.new_password !== v.old_password, { path: ["new_password"], message: "Choose a different password" });
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

export const resetSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const emailSchema = z.object({ email: z.email("Enter a valid email").trim() });

/** TOTP (6 digits) or a backup code. */
export const codeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{6,20}$/, "Enter the 6-digit code");

export const mfaStatusSchema = z.object({ enabled: z.boolean(), backup_codes_left: z.number().default(0) });
export type MfaStatus = z.infer<typeof mfaStatusSchema>;
export const mfaSetupSchema = z.object({ secret: z.string(), otpauth_url: z.string() });
export const backupCodesSchema = z.object({ backup_codes: z.array(z.string()) }).or(z.array(z.string()).transform((c) => ({ backup_codes: c })));

/** Groups a TOTP secret in fours for manual entry: "ABCD EFGH …". */
export const groupSecret = (s: string) =>
  s
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();

export const deviceSchema = z.object({
  id: z.string(),
  ip: z.string().default(""),
  user_agent: z.string().default(""),
  created_at: z.string(),
  last_seen_at: z.string(),
  current: z.boolean().default(false),
});
export type Device = z.infer<typeof deviceSchema>;

/** "Chrome on macOS" from a user agent; falls back to "Unknown device". */
export const describeDevice = (ua: string): string => {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl\//.test(ua)
              ? "curl"
              : "";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || ua.slice(0, 40);
};

export const userSummarySchema = z.object({ id: z.number(), username: z.string(), display_name: z.string().default(""), avatar_url: z.string().default("") });
export type UserSummary = z.infer<typeof userSummarySchema>;

export const hiddenSchema = z.object({ kind: z.enum(["post", "author", "tag"]), target: z.string(), created_at: z.string() });
export type Hidden = z.infer<typeof hiddenSchema>;

export type DeviceKind = "mobile" | "tablet" | "desktop" | "cli" | "unknown";
/** Device type from a user agent; drives the session icon. */
export const deviceKind = (ua: string): DeviceKind => {
  if (!ua) return "unknown";
  if (/curl\/|Wget|HTTPie|PostmanRuntime|Go-http-client|python-requests|okhttp|bot|spider/i.test(ua)) return "cli";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS|X11/.test(ua)) return "desktop";
  return "unknown";
};
