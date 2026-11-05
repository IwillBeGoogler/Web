import { create } from 'zustand';
import type { CollabSession } from './session';
import type { CollabStatus } from './provider';
import { reduceFollow, type Collaborator, type FollowAction, type FollowEffect, type FollowState, type Rect } from './presenceMath';

interface CollabStore {
  /** the live session of the open file (null: local file, legacy REST file, or no server) */
  session: CollabSession | null;
  status: CollabStatus | 'off';
  synced: boolean;
  people: Collaborator[];
  /** I may not edit (viewer / commenter) */
  readOnly: boolean;
  follow: FollowState;
  /** the server ended the session (file deleted / collab unavailable) */
  fatal: number | null;
  attach: (s: CollabSession | null) => void;
  refresh: () => void;
  dispatchFollow: (a: FollowAction) => FollowEffect | undefined;
  setFatal: (code: number | null) => void;
}

export const useCollabStore = create<CollabStore>((set, get) => ({
  session: null,
  status: 'off',
  synced: false,
  people: [],
  readOnly: false,
  follow: { following: null },
  fatal: null,
  attach: (session) => {
    set({ session, status: session ? session.status : 'off', synced: session?.synced ?? false, people: session?.collaborators() ?? [], readOnly: session?.readOnly ?? false, follow: { following: null }, fatal: null });
  },
  refresh: () => {
    const { session } = get();
    if (!session) return;
    const people = session.collaborators();
    const prev = get();
    // a followed person who left ends the follow
    let follow = prev.follow;
    if (follow.following !== null && !people.some((p) => p.clientId === follow.following)) follow = reduceFollow(follow, { type: 'userLeft', clientId: follow.following }).state;
    set({ status: session.status, synced: session.synced, people, follow });
  },
  dispatchFollow: (a) => {
    const r = reduceFollow(get().follow, a);
    if (r.state !== get().follow) set({ follow: r.state });
    return r.effect;
  },
  setFatal: (fatal) => set({ fatal }),
}));

/** the visible flow rectangle of the person with this awareness client id (for "follow" and the minimap) */
export const viewportOf = (people: Collaborator[], clientId: number): Rect | undefined => people.find((p) => p.clientId === clientId)?.state.viewport;
