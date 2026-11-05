import { create } from 'zustand';

/** Bumped whenever the local project cache changed behind the UI's back (server sync, upload), so lists re-read it. */
export const useLibrary = create<{ rev: number; bump: () => void }>((set) => ({ rev: 0, bump: () => set((s) => ({ rev: s.rev + 1 })) }));
