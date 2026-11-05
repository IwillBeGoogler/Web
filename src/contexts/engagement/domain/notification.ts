import { z } from "zod";

export const notificationSchema = z
  .object({
    id: z.number(),
    type: z.string(),
    actor: z.string().default("Someone"),
    post_id: z.number().default(0),
    comment_id: z.number().default(0),
    // diagram_* notifications: ids are text, `text` is the sentence to show
    diagram_project_id: z.string().default(""),
    diagram_file_id: z.string().default(""),
    diagram_comment_id: z.string().default(""),
    text: z.string().default(""),
    read_at: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .transform((n) => ({ ...n, unread: !n.read_at }));
export type Notification = z.infer<typeof notificationSchema>;

const verbs: Record<string, string> = {
  follow: "followed you",
  like: "sparked your story",
  comment: "responded to your story",
  reply: "replied to your response",
  comment_like: "liked your response",
  new_post: "published a new story",
  mention: "mentioned you",
};

const diagramVerbs: Record<string, string> = {
  diagram_mention: "mentioned you in a diagram comment",
  diagram_reply: "replied to your diagram comment",
  diagram_comment: "commented on a diagram",
  diagram_clap: "clapped for your diagram",
};

export const isDiagramNotification = (n: Notification) => n.type.startsWith("diagram_");

/** Where a diagram notification leads: the file, with the comment thread to open. Null for the blog's own kinds or a file-less one. */
export const diagramTarget = (n: Notification): { fileId: string; comment?: string } | null =>
  isDiagramNotification(n) && n.diagram_file_id ? { fileId: n.diagram_file_id, ...(n.diagram_comment_id ? { comment: n.diagram_comment_id } : {}) } : null;

export const describeNotification = (n: Notification) =>
  isDiagramNotification(n) && n.text ? n.text : `${n.actor || "Someone"} ${verbs[n.type] ?? diagramVerbs[n.type] ?? "interacted with you"}`;

/** The `?comment=` value for a comment id: digits stay unquoted in the URL (the router writes strings as JSON), unless too long to survive as a number. */
export const commentSearch = (id: string): string | number => (/^[1-9]\d{0,14}$/.test(id) ? Number(id) : id);
