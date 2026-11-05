import { create } from 'zustand';

/** UI state of the Board tools (sticky colour, brushes, popovers, presentation). Nothing here is part of the document. */
export type Popover = 'frames' | 'emoji' | 'help' | null;
export interface Presenting { index: number; laser: boolean; spotlight: boolean }

interface BoardState {
  stickyColor: string;
  /** new stickies are hidden from everybody else until revealed */
  privateMode: boolean;
  /** tag new stickies with the author's name */
  showAuthor: boolean;
  /** 'auto' = the ink that reads on the canvas (dark on light, light on dark) */
  penColor: string;
  penSize: number;
  hlColor: string;
  hlSize: number;
  eraserSize: number;
  /** replace rough circles / rectangles / triangles / arrows by clean shapes */
  recognize: boolean;
  stampEmoji: string;
  popover: Popover;
  presenting: Presenting | null;
  set: (p: Partial<Omit<BoardState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const KEY = 'sdd:board-prefs';
const PERSISTED = ['stickyColor', 'showAuthor', 'penColor', 'penSize', 'hlColor', 'hlSize', 'recognize', 'stampEmoji'] as const;

const defaults = {
  stickyColor: 'yellow', privateMode: false, showAuthor: false,
  penColor: 'auto', penSize: 4, hlColor: '#ffd400', hlSize: 20, eraserSize: 14, recognize: false,
  stampEmoji: '👍', popover: null as Popover, presenting: null as Presenting | null,
};

function load(): Partial<typeof defaults> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of PERSISTED) if (typeof raw[k] === typeof (defaults as Record<string, unknown>)[k]) out[k] = raw[k];
    return out as Partial<typeof defaults>;
  } catch {
    return {};
  }
}

export const useBoardStore = create<BoardState>((set, get) => ({
  ...defaults,
  ...load(),
  set: (p) => {
    set(p);
    try {
      const s = get() as unknown as Record<string, unknown>;
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, s[k]]))));
    } catch { /* private mode */ }
  },
  reset: () => set({ ...defaults }),
}));

export const QUICK_EMOJI = ['👍', '❤️', '🎉', '😂', '🤔', '👀', '🔥', '✅'];
