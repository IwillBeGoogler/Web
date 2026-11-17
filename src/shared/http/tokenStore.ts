/**
 * Holds the access token (3 hours) and the refresh token (30 days). Memory
 * is the source of truth; localStorage mirrors
 * it so a reader stays signed in across reloads and tabs. Other tabs' writes
 * arrive as `storage` events: a token another tab rotated (or a sign-out
 * there) replaces the one in memory, so this tab never sends a retired token.
 */
export interface StoredToken {
  /** Access token (Authorization: Bearer). */
  token: string;
  expiresAt: string;
  /** Refresh token for POST /auth/refresh (absent for sessions from before access tokens). */
  refreshToken?: string;
  refreshExpiresAt?: string;
}

/** The stored form of a login/refresh response. */
export const storedFrom = (s: {
  token?: string;
  access_token?: string;
  expires_at: string;
  refresh_token?: string | undefined;
  refresh_expires_at?: string | undefined;
}): StoredToken => ({
  token: s.access_token || s.token || "",
  expiresAt: s.expires_at,
  ...(s.refresh_token ? { refreshToken: s.refresh_token, refreshExpiresAt: s.refresh_expires_at ?? "" } : {}),
});

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
    if (next?.token === current?.token && next?.refreshToken === current?.refreshToken) return;
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
    if (typeof v.token !== "string" || typeof v.expiresAt !== "string") return null;
    return typeof v.refreshToken === "string"
      ? { token: v.token, expiresAt: v.expiresAt, refreshToken: v.refreshToken, refreshExpiresAt: v.refreshExpiresAt ?? "" }
      : { token: v.token, expiresAt: v.expiresAt };
  } catch {
    return null;
  }
}
