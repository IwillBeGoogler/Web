import { z } from "zod";

export const feedbackKinds = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

export const FEEDBACK_MAX = 5000;

/** POST /feedback form. Messages are i18n keys: the dialog translates them. */
export const feedbackSchema = z.object({
  kind: z.enum(feedbackKinds),
  message: z.string().trim().min(1, "feedback.messageRequired").max(FEEDBACK_MAX, "feedback.messageTooLong"),
  email: z
    .string()
    .trim()
    .max(254, "feedback.emailInvalid")
    .refine((v) => v === "" || z.email().safeParse(v).success, "feedback.emailInvalid"),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
  contact_email?: string;
  page_url: string;
  user_agent: string;
  error_message?: string;
  error_stack?: string;
  captcha_token?: string;
  /** Honeypot: people never see it, bots fill it in. */
  website: string;
}

/** What a caught error contributes to a report. */
export interface ErrorDetails {
  message: string;
  stack: string;
}

export const errorDetails = (e: unknown): ErrorDetails =>
  e instanceof Error ? { message: e.message, stack: e.stack ?? "" } : { message: String(e), stack: "" };

/**
 * The page address without query string and hash (they may carry share or reset tokens),
 * and without the secret of a diagram share link (/d/s/<token>).
 */
export function pageAddress(href: string): string {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname.replace(/^(\/d\/s\/)[^/]+/, "$1…")}`;
  } catch {
    return "";
  }
}
