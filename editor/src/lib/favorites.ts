type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

export interface UsageState {
  favorites: string[];
  recent: string[];
}
export const RECENT_MAX = 12;
export const emptyUsage = (): UsageState => ({ favorites: [], recent: [] });

export const toggleFavorite = (s: UsageState, id: string): UsageState => ({
  ...s,
  favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id],
});

/** Most recent first, no duplicates, capped. */
export const pushRecent = (s: UsageState, id: string, max = RECENT_MAX): UsageState => ({
  ...s,
  recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, max),
});

export function loadUsage(st: Reader, key: string, valid?: (id: string) => boolean): UsageState {
  try {
    const v = JSON.parse(st.getItem(key) ?? 'null');
    if (v && Array.isArray(v.favorites) && Array.isArray(v.recent)) {
      const ok = (x: unknown): x is string => typeof x === 'string' && (!valid || valid(x));
      return { favorites: v.favorites.filter(ok), recent: v.recent.filter(ok).slice(0, RECENT_MAX) };
    }
  } catch {
    /* fall through */
  }
  return emptyUsage();
}

export function saveUsage(st: Writer, key: string, s: UsageState): void {
  try {
    st.setItem(key, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
