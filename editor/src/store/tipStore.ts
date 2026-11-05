import { create } from 'zustand';
import type { Rect, TipContent } from '../lib/tooltip';

export const TIP_DELAY = 300;

interface TipState {
  tip: { anchor: Rect; content: TipContent } | null;
  show: (anchor: Rect, content: TipContent) => void;
  hide: () => void;
}
export const useTipStore = create<TipState>((set) => ({
  tip: null,
  show: (anchor, content) => set({ tip: { anchor, content } }),
  hide: () => set({ tip: null }),
}));
