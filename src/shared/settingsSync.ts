/**
 * Per-user settings mirrored to the server (`GET/PATCH /api/diagrams/me/prefs`, a generic per-user JSON object
 * whose top-level keys are merged). localStorage stays the immediate store; while signed in, changes are also
 * PATCHed (debounced) and, on sign-in / app load, the server copy is fetched and applied (server wins).
 * Everything fails silently: offline or signed out simply means local-only.
 */
export interface SyncedSetting {
  key: string;
  /** the locally stored value, or undefined when the user never chose one (seeds the server on first sign-in) */
  get(): unknown;
  /** apply a value that came from the server; must not call push() */
  apply(value: unknown): void;
}

interface Deps {
  http: (path: string, opts?: { method?: "GET" | "PATCH"; body?: unknown }) => Promise<unknown>;
  tokens: { get(): unknown; subscribe(l: (t: unknown) => void): () => void };
}

export const SETTINGS_PATH = "/diagrams/me/prefs";

export function createSettingsSync(debounceMs = 800) {
  const registry = new Map<string, SyncedSetting>();
  const pending = new Map<string, unknown>();
  let server: Record<string, unknown> | null = null;
  let deps: Deps | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signed = false;
  let unsub: (() => void) | undefined;

  const signedIn = () => !!deps && deps.tokens.get() !== null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (!deps || !signedIn() || pending.size === 0) return;
    const batch = Object.fromEntries(pending);
    pending.clear();
    try {
      await deps.http(SETTINGS_PATH, { method: "PATCH", body: batch });
      server = { ...(server ?? {}), ...batch };
    } catch {
      /* offline: local copy stays authoritative until the next change */
    }
  };

  const applyKey = (s: SyncedSetting) => {
    if (!server || pending.has(s.key) || !(s.key in server)) return;
    try {
      s.apply(server[s.key]);
    } catch {
      /* a bad server value must not break the app */
    }
  };

  const pull = async () => {
    if (!deps || !signedIn()) return;
    let prefs: Record<string, unknown>;
    try {
      const r = (await deps.http(SETTINGS_PATH)) as { prefs?: Record<string, unknown> } | null;
      if (!r?.prefs || typeof r.prefs !== "object") return;
      prefs = r.prefs;
    } catch {
      return;
    }
    if (!signedIn()) return;
    server = prefs;
    for (const s of registry.values()) {
      if (s.key in prefs) applyKey(s);
      else {
        const local = s.get();
        if (local !== undefined) pending.set(s.key, local); // first sign-in: seed the server from this device
      }
    }
    if (pending.size) timer = setTimeout(() => void flush(), debounceMs);
  };

  return {
    /** declare a synced setting; a value already fetched from the server is applied right away */
    register(s: SyncedSetting): () => void {
      registry.set(s.key, s);
      applyKey(s);
      return () => void (registry.get(s.key) === s && registry.delete(s.key));
    },
    /** record a user change; no-op when signed out or when the server already holds the value */
    push(key: string, value: unknown): void {
      if (!signedIn()) return;
      if (server && same(server[key], value)) {
        pending.delete(key);
        return;
      }
      pending.set(key, value);
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
    flush,
    /** begin watching the token store; fetches now when already signed in */
    start(d: Deps): () => void {
      unsub?.();
      deps = d;
      signed = signedIn();
      if (signed) void pull();
      unsub = d.tokens.subscribe(() => {
        const now = signedIn();
        if (now && !signed) void pull();
        if (!now) {
          server = null;
          pending.clear();
          clearTimeout(timer);
        }
        signed = now;
      });
      return () => {
        unsub?.();
        unsub = undefined;
      };
    },
    /** test helper */
    _pull: pull,
  };
}

export const settingsSync = createSettingsSync();
