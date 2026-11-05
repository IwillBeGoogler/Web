import { create } from 'zustand';
import { reducePresenterFollow, type PresenterFollowAction, type PresenterFollowEffect, type PresenterFollowState } from './presence';

interface FollowStore {
  state: PresenterFollowState;
  dispatch: (a: PresenterFollowAction) => PresenterFollowEffect | undefined;
  reset: () => void;
}
const IDLE: PresenterFollowState = { presenterId: null, broken: false, seq: 0 };
/** follow-the-presenter state (who I follow and whether I broke away); the reducer is lib/board/presence.ts */
export const usePresenterFollow = create<FollowStore>((set, get) => ({
  state: IDLE,
  dispatch: (a) => {
    const r = reducePresenterFollow(get().state, a);
    if (r.state !== get().state) set({ state: r.state });
    return r.effect;
  },
  reset: () => set({ state: IDLE }),
}));
