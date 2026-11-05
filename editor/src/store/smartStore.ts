import { create } from 'zustand';

/** Phase 6 (smart tooling) UI state. Everything is closed by default; panels are popovers / a docked split view opened on demand. */
interface SmartState {
  /** diagrams-as-code split view (⌘⇧E) */
  code: boolean;
  setCode: (v: boolean) => void;
  toggleCode: () => void;
  codeWidth: number;
  setCodeWidth: (w: number) => void;
  /** Problems popover */
  problems: boolean;
  setProblems: (v: boolean) => void;
  /** capacity & latency popover / overlay */
  capacity: boolean;
  setCapacity: (v: boolean) => void;
  /** diff review (the compared snapshot is held by the diff panel) */
  diff: boolean;
  setDiff: (v: boolean) => void;
  reset: () => void;
}

export const CODE_MIN = 300;
export const CODE_MAX = 720;
const initial = { code: false, codeWidth: 420, problems: false, capacity: false, diff: false };

export const useSmart = create<SmartState>((set) => ({
  ...initial,
  setCode: (code) => set({ code }),
  toggleCode: () => set((s) => ({ code: !s.code })),
  setCodeWidth: (w) => set({ codeWidth: Math.min(CODE_MAX, Math.max(CODE_MIN, Math.round(w))) }),
  setProblems: (problems) => set({ problems }),
  setCapacity: (capacity) => set({ capacity }),
  setDiff: (diff) => set({ diff }),
  reset: () => set(initial),
}));
