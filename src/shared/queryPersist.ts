import { type DehydratedState, dehydrate, hydrate, type Query, type QueryClient } from "@tanstack/react-query";

// Keeps the public first-screen data (trending, tags, the latest stories, landing teasers) in localStorage, so a repeat
// visit paints them at once and refreshes in the background (restored entries keep their age, so they are stale and refetch).
// Only public, successful queries are kept, infinite feeds only their first page; signing out clears the cache, and with it this copy.

const KEY = "iwbg:queries:v1";
const MAX_AGE = 24 * 60 * 60_000;
const MAX_BYTES = 1_500_000;

const isPublic = (q: Query) => {
  const [head, arg] = q.queryKey as [unknown, unknown];
  if (head === "trending" || head === "tags" || head === "landing") return true;
  return head === "feed" && (arg as { kind?: string } | undefined)?.kind === "latest" && Object.keys(arg as object).length === 1;
};

type Saved = { at: number; state: DehydratedState };

const firstPage = (data: unknown) => {
  const d = data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
  return d && Array.isArray(d.pages) && Array.isArray(d.pageParams) ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : data;
};

/** Restores the saved queries into `client`, then keeps the copy up to date. Call once at startup, before the first render. */
export function persistQueries(client: QueryClient, storage: Storage | undefined = globalThis.localStorage) {
  if (!storage) return () => {};
  try {
    const raw = storage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    if (saved && Date.now() - saved.at < MAX_AGE) hydrate(client, saved.state);
    else if (raw) storage.removeItem(KEY);
  } catch {
    // unreadable or blocked storage: start empty
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    try {
      const state = dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === "success" && isPublic(q) });
      for (const q of state.queries) q.state = { ...q.state, data: firstPage(q.state.data) };
      if (!state.queries.length) return storage.removeItem(KEY);
      const json = JSON.stringify({ at: Date.now(), state } satisfies Saved);
      if (json.length <= MAX_BYTES) storage.setItem(KEY, json);
    } catch {
      // full or blocked storage: the copy is only a speed-up
    }
  };
  return client.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" && e.type !== "removed") return;
    if (e.type === "updated" && !isPublic(e.query)) return;
    if (!timer) timer = setTimeout(save, 1000);
  });
}
