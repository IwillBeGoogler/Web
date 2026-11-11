/**
 * Holds the bearer token. Memory is the source of truth; localStorage mirrors
 * it so a reader stays signed in across reloads and tabs. Other tabs' writes
 * arrive as `storage` events: a token another tab rotated (or a sign-out
 * there) replaces the one in memory, so this tab never sends a retired token.
 */
export interface StoredToken {
  token: string;
  expiresAt: string;
}

type Listener = (t: StoredToken | null) => void;

export interface TokenStore {
  get(): StoredToken | null;
  set(t: StoredToken | null): void;
  subscribe(l: Listener): () => void;
}

const KEY = "iwillbegoogler.session";

type StorageEvents = Pick<Window, "addEventListener">;

export const createTokenStore = (
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocal(),
  events: StorageEvents | null = typeof window === "undefined" ? null : window,
): TokenStore => {
  let current: StoredToken | null = read(storage);
  const listeners = new Set<Listener>();
  // fired in every other tab of this origin, never in the one that wrote
  events?.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return; // null: storage.clear()
    const next = read(storage);
    if (next?.token === current?.token) return;
    current = next;
    for (const l of listeners) l(next);
  });
  return {
    get: () => current,
    set(t) {
      current = t;
      try {
        if (t) storage?.setItem(KEY, JSON.stringify(t));
        else storage?.removeItem(KEY);
      } catch {
        /* storage full or disabled: memory still works */
      }
      for (const l of listeners) l(t);
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
};

function safeLocal() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage: Pick<Storage, "getItem"> | null): StoredToken | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredToken>;
    return typeof v.token === "string" && typeof v.expiresAt === "string" ? { token: v.token, expiresAt: v.expiresAt } : null;
  } catch {
    return null;
  }
}
