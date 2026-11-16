// After a deploy the old page's code-split chunks are gone from the server: the next lazy page or dialog it opens fails to load
// ("Failed to fetch dynamically imported module"), and the user lands on the error screen. One reload fetches the new build.

const KEY = "iwbg:chunk-reload";
const GAP = 30_000; // never loop: at most one automatic reload per 30 s

/** True for the browsers' messages when a module script / lazy chunk cannot be fetched. */
export function isStaleChunkError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    msg,
  );
}

/** Reloads the page for a stale-chunk error (once per 30 s); true when a reload was started. */
export function reloadForStaleChunk(error: unknown, storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.sessionStorage): boolean {
  if (!isStaleChunkError(error)) return false;
  try {
    const last = Number(storage?.getItem(KEY) ?? 0);
    if (Date.now() - last < GAP) return false;
    storage?.setItem(KEY, String(Date.now()));
  } catch {
    // no storage: still reload once (this page load)
  }
  location.reload();
  return true;
}

/** Vite fires `vite:preloadError` when a chunk's preload fails: recover before React even sees the error. */
export function installStaleChunkRecovery(): void {
  addEventListener("vite:preloadError", (e) => {
    if (reloadForStaleChunk((e as Event & { payload?: unknown }).payload ?? new Error("dynamically imported module"))) e.preventDefault();
  });
}
