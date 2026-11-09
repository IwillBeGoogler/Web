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
  /** global metrics bar (RPS in, p99, availability, dropped, cost vs budget) */
  metrics: boolean;
  setMetrics: (v: boolean) => void;
  /** chaos (never saved with the file): per-node down / slow and a traffic spike multiplier */
  chaosNodes: Record<string, 'down' | 'slow'>;
  setChaosNode: (id: string, state: 'down' | 'slow' | null) => void;
  spike: number;
  setSpike: (v: number) => void;
  resetChaos: () => void;
  /** one-click simulation running (never saved): metrics bar + overlay + flowing packets, default capacities assumed */
  simulating: boolean;
  setSimulating: (v: boolean) => void;
  /** edges carrying load while simulating -> true when the target is over / down (set by the capacity overlay) */
  simEdges: Record<string, boolean>;
  setSimEdges: (m: Record<string, boolean>) => void;
  /** diff review (the compared snapshot is held by the diff panel) */
  diff: boolean;
  setDiff: (v: boolean) => void;
  reset: () => void;
}

export const CODE_MIN = 300;
export const CODE_MAX = 720;
const initial = { code: false, codeWidth: 420, problems: false, capacity: false, diff: false, metrics: false, chaosNodes: {} as Record<string, 'down' | 'slow'>, spike: 1, simulating: false, simEdges: {} as Record<string, boolean> };

export const useSmart = create<SmartState>((set) => ({
  ...initial,
  setCode: (code) => set({ code }),
  toggleCode: () => set((s) => ({ code: !s.code })),
  setCodeWidth: (w) => set({ codeWidth: Math.min(CODE_MAX, Math.max(CODE_MIN, Math.round(w))) }),
  setProblems: (problems) => set({ problems }),
  setCapacity: (capacity) => set({ capacity }),
  setDiff: (diff) => set({ diff }),
  setMetrics: (metrics) => set({ metrics }),
  setChaosNode: (id, state) => set((s) => {
    const { [id]: _drop, ...rest } = s.chaosNodes;
    void _drop;
    return { chaosNodes: state ? { ...rest, [id]: state } : rest };
  }),
  setSpike: (spike) => set({ spike }),
  setSimulating: (simulating) => set(simulating ? { simulating } : { simulating, simEdges: {} }),
  setSimEdges: (simEdges) => set({ simEdges }),
  resetChaos: () => set({ chaosNodes: {}, spike: 1 }),
  reset: () => set(initial),
}));
