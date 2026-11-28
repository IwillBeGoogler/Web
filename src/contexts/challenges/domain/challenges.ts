import { z } from "zod";
import type { MessageKey } from "@/shared/i18n";

export const MIN_DAYS = 7;
export const MAX_DAYS = 365;
export const LENGTHS = [30, 50, 100] as const;

const list = <S extends z.ZodType>(s: S) =>
  z
    .array(s)
    .nullable()
    .optional()
    .transform((v) => (v ?? []) as z.output<S>[]);

/** The reader's link to the Telegram bot; `enabled` false hides the feature. */
export const telegramSchema = z.object({ enabled: z.boolean(), linked: z.boolean().default(false), linked_at: z.string().nullish() });
export type TelegramStatus = z.infer<typeof telegramSchema>;
/** Only a Telegram deep link is ever opened. */
export const telegramLinkSchema = z.object({ url: z.url().startsWith("https://t.me/") });

export const visibilitySchema = z.enum(["public", "private"]);
export type Visibility = z.infer<typeof visibilitySchema>;

export const challengeSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  author: z.string().default(""),
  title: z.string(),
  description: z.string().default(""),
  days: z.number(),
  visibility: visibilitySchema,
  timezone: z.string(),
  start_date: z.string(),
  days_done: z.number().default(0),
  /** Linked posts, drafts too; only on the owner's running list. */
  post_ids: list(z.number()),
});
export type Challenge = z.infer<typeof challengeSchema>;

export const daySchema = z.object({
  date: z.string(),
  n: z.number(),
  post_id: z.number(),
  title: z.string(),
  slug: z.string(),
  author: z.string(),
});
export type Day = z.infer<typeof daySchema>;

export const statsSchema = z.object({
  days_done: z.number(),
  current_streak: z.number(),
  best_streak: z.number(),
  today: z.number(),
  ended: z.boolean(),
  end_date: z.string(),
});

export const detailSchema = challengeSchema.extend({
  stats: statsSchema,
  entries: list(daySchema),
  followers: z.number().default(0),
  is_following: z.boolean().default(false),
  cheers_today: z.number().default(0),
  cheered_today: z.boolean().default(false),
  /** Reminder settings; only the owner gets them. */
  reminders: z.boolean().optional(),
  remind_at: z.string().optional(),
  /** The issued certificate, revoked or not. */
  certificate_id: z.string().optional(),
});
export type ChallengeDetail = z.infer<typeof detailSchema>;

export const certificateSchema = z.object({
  id: z.string(),
  /** Missing once the challenge is deleted or while it is private. */
  challenge_id: z.number().optional(),
  holder_name: z.string(),
  username: z.string(),
  title: z.string(),
  days: z.number(),
  days_done: z.number(),
  best_streak: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  issued_at: z.string(),
  revoked_at: z.string().optional(),
  revoke_reason: z.string().optional(),
});
export type Certificate = z.infer<typeof certificateSchema>;

export const CERTIFICATE_MIN_DAYS = 30;

/** Mirrors the server's rule: 30+ days, 90% done, ended (or the last day with every day done). */
export function canClaim({ days, stats: s }: ChallengeDetail) {
  return days >= CERTIFICATE_MIN_DAYS && s.days_done * 10 >= days * 9 && (s.ended || (s.today === days && s.days_done >= days));
}

export const placeSchema = z.object({ challenge: challengeSchema, day: z.number(), of: z.number() });
export type PostPlace = z.infer<typeof placeSchema>;

const msg = (k: MessageKey) => k;

/** Messages are i18n keys. */
export const challengeInputSchema = z.object({
  title: z.string().trim().min(1, msg("challenge.err.title")).max(120, msg("challenge.err.titleLong")),
  description: z.string().trim().max(1000, msg("challenge.err.descriptionLong")),
  days: z
    .number({ error: msg("challenge.err.days") })
    .int(msg("challenge.err.days"))
    .min(MIN_DAYS, msg("challenge.err.days"))
    .max(MAX_DAYS, msg("challenge.err.days")),
  visibility: visibilitySchema,
});
export type ChallengeInput = z.infer<typeof challengeInputSchema>;
export type ReminderSettings = { reminders?: boolean; remind_at?: string };
export type NewChallenge = ChallengeInput & { timezone: string };

export const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export type Cell = { n: number; date: string; state: "done" | "missed" | "today" | "future"; entry: Day | undefined };

/** One cell per day of the challenge, in order. */
export function cells(c: ChallengeDetail): Cell[] {
  const done = new Map(c.entries.map((e) => [e.n, e]));
  const start = Date.parse(`${c.start_date}T00:00:00Z`);
  return Array.from({ length: c.days }, (_, i) => {
    const n = i + 1;
    const entry = done.get(n);
    const past = c.stats.ended || (c.stats.today > 0 && n < c.stats.today);
    return {
      n,
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      state: entry ? "done" : n === c.stats.today ? "today" : past ? "missed" : "future",
      entry,
    };
  });
}
