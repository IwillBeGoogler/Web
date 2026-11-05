import { create } from 'zustand';
import type { DocDiff } from '../lib/versionDiff';

/** the version comparison shown on the canvas (green = added, red = removed, amber = changed) */
interface DiffState {
  diff: DocDiff | null;
  from: string;
  to: string;
  /** who set it ("timeline" for the version timeline); a feature only clears a comparison it set itself */
  owner: string;
  show: (diff: DocDiff, from: string, to: string, owner?: string) => void;
  clear: () => void;
}
export const useDiffStore = create<DiffState>((set) => ({
  diff: null,
  from: '',
  to: '',
  owner: '',
  show: (diff, from, to, owner = '') => set({ diff, from, to, owner }),
  clear: () => set({ diff: null, from: '', to: '', owner: '' }),
}));
