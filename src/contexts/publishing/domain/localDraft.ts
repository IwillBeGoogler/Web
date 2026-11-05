import { z } from "zod";
import { hasAnyContent, sameStory } from "./autosave";
import type { StoryForm } from "./story";

const copySchema = z.object({
  v: z.literal(1),
  at: z.number(),
  form: z.object({
    title: z.string(),
    subtitle: z.string(),
    body: z.string(),
    status: z.enum(["draft", "published", "scheduled"]),
    publishAt: z.string(),
    publicationId: z.number(),
    coverUrl: z.string(),
    tags: z.array(z.string()),
  }),
});
export type LocalCopy = z.infer<typeof copySchema>;

/** One key per story; "new" for a story not created yet. */
export const localKey = (id: number | undefined) => `iblog.story.${id ?? "new"}`;

export const encodeCopy = (form: StoryForm, at: number): string => JSON.stringify({ v: 1, at, form } satisfies LocalCopy);

export function decodeCopy(raw: string | null): LocalCopy | null {
  if (!raw) return null;
  try {
    const r = copySchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Offer the local copy when it differs from the server's version and is newer. Without a server version, when it holds any text. */
export function shouldOfferRestore(local: LocalCopy | null, server: { form: StoryForm; updatedAt: number } | null): boolean {
  if (!local) return false;
  if (!server) return hasAnyContent(local.form);
  return !sameStory(local.form, server.form) && local.at > server.updatedAt;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export const localDraft = {
  read(id: number | undefined, store: Store | null = defaultStore()): LocalCopy | null {
    try {
      return decodeCopy(store?.getItem(localKey(id)) ?? null);
    } catch {
      return null;
    }
  },
  /** False when the browser refused (private mode, quota). */
  write(id: number | undefined, form: StoryForm, at = Date.now(), store: Store | null = defaultStore()): boolean {
    try {
      store?.setItem(localKey(id), encodeCopy(form, at));
      return !!store;
    } catch {
      return false;
    }
  },
  clear(id: number | undefined, store: Store | null = defaultStore()) {
    try {
      store?.removeItem(localKey(id));
    } catch {}
  },
};
