import { z } from "zod";

/** A reader can give a post at most 50 claps (server rule). */
export const CLAP_MAX = 50;

export const addClaps = (s: { claps: number; myClaps: number }, n: number) => {
  const added = Math.max(0, Math.min(n, CLAP_MAX - s.myClaps));
  return { claps: s.claps + added, myClaps: s.myClaps + added, added };
};

export const commentSchema = z.object({
  id: z.number(),
  post_id: z.number(),
  parent_id: z.number().default(0),
  user_id: z.number().default(0),
  author: z.string().default(""),
  text: z.string(),
  created_at: z.string(),
  edited_at: z.string().nullable().optional(),
  likes: z.number().default(0),
  liked: z.boolean().default(false),
});
export type Comment = z.infer<typeof commentSchema>;
export type CommentNode = Comment & { replies: CommentNode[] };

export const commentInputSchema = z.object({ text: z.string().trim().min(1, "Write something").max(5000, "At most 5000 characters") });
export type CommentInput = z.infer<typeof commentInputSchema>;

/** Nests replies under their parent; replies whose parent is missing become top level. */
export const threadComments = (list: Comment[]): CommentNode[] => {
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const nodes = new Map<number, CommentNode>(sorted.map((c) => [c.id, { ...c, replies: [] }]));
  const roots: CommentNode[] = [];
  for (const c of sorted) {
    const node = nodes.get(c.id) as CommentNode;
    const parent = c.parent_id ? nodes.get(c.parent_id) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
};
