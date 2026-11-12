import { z } from "zod";
import type { Lang } from "@/shared/i18n";

/** `GET /api/categories`: one row per topic; `parent_id` 0 is a root, `count` the published stories filed directly under it. */
export const topicSchema = z.object({
  id: z.number(),
  parent_id: z.number().default(0),
  slug: z.string(),
  name: z.string(),
  names: z
    .record(z.string(), z.string())
    .nullable()
    .default({})
    .transform((n) => n ?? {}),
  description: z.string().default(""),
  position: z.number().default(0),
  count: z.number().default(0),
});
export type Topic = z.infer<typeof topicSchema>;

export type TopicNode = Topic & { children: TopicNode[]; total: number };

/** The name in the reader's language, else English. */
export const topicName = (t: Pick<Topic, "name" | "names">, lang: Lang): string => (lang === "en" ? t.name : t.names[lang] || t.name);

/** Rows to a forest ordered by position then name; `total` sums a node's whole subtree. */
export function buildTree(rows: Topic[]): TopicNode[] {
  const byId = new Map<number, TopicNode>(rows.map((r) => [r.id, { ...r, children: [], total: r.count }]));
  const roots: TopicNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const order = (list: TopicNode[]): number => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    let sum = 0;
    for (const n of list) {
      n.total += order(n.children);
      sum += n.total;
    }
    return sum;
  };
  order(roots);
  return roots;
}

/** Root-first chain from the forest to `slug`, empty when unknown. */
export function pathTo(forest: TopicNode[], slug: string): TopicNode[] {
  for (const n of forest) {
    if (n.slug === slug) return [n];
    const rest = pathTo(n.children, slug);
    if (rest.length) return [n, ...rest];
  }
  return [];
}
