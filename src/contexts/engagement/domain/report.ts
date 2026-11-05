import { z } from "zod";

export const reasons = ["spam", "abuse", "harassment", "off_topic", "other"] as const;
export const reasonLabels: Record<(typeof reasons)[number], string> = {
  spam: "Spam",
  abuse: "Abusive or hateful",
  harassment: "Harassment",
  off_topic: "Off topic",
  other: "Something else",
};

/** POST /reports: note is required for "other" (server rule). */
export const reportSchema = z
  .object({ reason: z.enum(reasons), note: z.string().trim().max(1000, "At most 1000 characters") })
  .refine((v) => v.reason !== "other" || v.note.length > 0, { path: ["note"], message: "Tell us what's wrong" });
export type ReportInput = z.infer<typeof reportSchema>;
export type ReportTarget = { type: "post" | "comment" | "user"; id: number } | { type: "diagram"; fileId: string };
