/**
 * Holds the bearer token. Memory is the source of truth; localStorage mirrors
 * it so a reader stays signed in across reloads and tabs.
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

const KEY = "iblog.session";

export const createTokenStore = (storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocal()): TokenStore => {
  let current: StoredToken | null = read(storage);
  const listeners = new Set<Listener>();
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
