import { create } from 'zustand';
import { emptyUsage, loadUsage, pushRecent, saveUsage, toggleFavorite, type UsageState } from '../lib/favorites';

export const USAGE_KEY = 'sdd:usage';

interface UsageStore extends UsageState {
  toggleFavorite: (id: string) => void;
  recordUse: (id: string) => void;
  hydrate: () => void;
  reset: () => void;
}

const persist = (s: UsageState) => {
  try {
    saveUsage(localStorage, USAGE_KEY, s);
  } catch {
    /* ignore */
  }
};

export const useUsageStore = create<UsageStore>((set, get) => ({
  ...emptyUsage(),
  toggleFavorite: (id) => {
    set((s) => toggleFavorite(s, id));
    persist(get());
  },
  recordUse: (id) => {
    set((s) => pushRecent(s, id));
    persist(get());
  },
  hydrate: () => {
    try {
      set(loadUsage(localStorage, USAGE_KEY));
    } catch {
      /* ignore */
    }
  },
  reset: () => set(emptyUsage()),
}));
