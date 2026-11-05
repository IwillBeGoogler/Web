/** Pure presence maths: cursor smoothing, follow mode, idle state and the collaborator list. No DOM, no Yjs. */

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PresenceStatus = 'active' | 'idle' | 'away';

/** what every client publishes in its awareness state */
export interface RemoteState {
  user: { id?: string; name: string; color: string };
  /** flow coordinates */
  cursor?: Pt | null;
  selection?: { nodes: string[]; edges: string[] };
  /** the visible area in flow coordinates (drives follow mode and the minimap rectangles) */
  viewport?: Rect;
  status?: PresenceStatus;
  lastActive?: number;
  /** facilitation (Board): I am presenting this frame (others follow), I brought everybody here, my laser pointer, a floating emoji */
  presenting?: { frameId: string; index: number; rect: Rect; seq: number };
  summon?: { seq: number; rect: Rect };
  laser?: boolean;
  reaction?: { emoji: string; seq: number; at: Pt };
  /** audio room */
  audio?: { in: boolean; muted: boolean; speaking: boolean };
}

/** exponential smoothing towards `target`; `tauMs` is the time constant. Frame-rate independent, never overshoots, snaps when close. */
export function smoothCursor(cur: Pt, target: Pt, dtMs: number, tauMs: number): Pt {
  if (![cur.x, cur.y, target.x, target.y, dtMs, tauMs].every(Number.isFinite)) return cur;
  if (dtMs <= 0) return cur;
  if (tauMs <= 0) return target;
  const k = 1 - Math.exp(-dtMs / tauMs);
  const x = cur.x + (target.x - cur.x) * k;
  const y = cur.y + (target.y - cur.y) * k;
  return Math.hypot(target.x - x, target.y - y) < 0.25 ? { x: target.x, y: target.y } : { x, y };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

/** the viewport transform (screen = flow * zoom + offset) that shows `view` (a flow rect) centred in a window of `size` */
export function followTransform(view: Rect, size: { width: number; height: number }): { x: number; y: number; zoom: number } {
  const raw = Math.min(size.width / Math.max(view.w, 1e-6), size.height / Math.max(view.h, 1e-6));
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw));
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  return { zoom, x: size.width / 2 - cx * zoom, y: size.height / 2 - cy * zoom };
}

export interface FollowState {
  /** awareness client id of the person being followed */
  following: number | null;
}
export type FollowAction =
  | { type: 'start'; clientId: number; rect?: Rect }
  | { type: 'escape' }
  /** the user panned / zoomed / dragged themselves; `programmatic` = it was the follow move itself */
  | { type: 'userInteraction'; programmatic?: boolean }
  | { type: 'userLeft'; clientId: number }
  | { type: 'remoteViewport'; clientId: number; rect: Rect };
export type FollowEffect = { type: 'move'; rect: Rect } | { type: 'ended'; reason: 'left' };

export function reduceFollow(state: FollowState, a: FollowAction): { state: FollowState; effect?: FollowEffect } {
  switch (a.type) {
    case 'start':
      if (state.following === a.clientId) return { state: { following: null } }; // clicking the same avatar again
      return { state: { following: a.clientId }, ...(a.rect ? { effect: { type: 'move', rect: a.rect } as const } : {}) };
    case 'escape':
      return { state: { following: null } };
    case 'userInteraction':
      return a.programmatic ? { state } : { state: { following: null } };
    case 'userLeft':
      return state.following === a.clientId ? { state: { following: null }, effect: { type: 'ended', reason: 'left' } } : { state };
    case 'remoteViewport':
      return state.following === a.clientId ? { state, effect: { type: 'move', rect: a.rect } } : { state };
  }
}

export const IDLE_AFTER_MS = 60_000;
export const AWAY_AFTER_MS = 300_000;
export function presenceStatus(lastActive: number, now: number, tabVisible: boolean): PresenceStatus {
  if (!tabVisible) return 'away';
  const idle = now - lastActive;
  return idle >= AWAY_AFTER_MS ? 'away' : idle >= IDLE_AFTER_MS ? 'idle' : 'active';
}

const PALETTE = ['#e5484d', '#f76b15', '#d6a000', '#30a46c', '#0ea5a4', '#3e63dd', '#8e4ec6', '#d6409f', '#6e56cf', '#12a594'];
/** stable colour per user (so a person keeps their colour in every tab and every session) */
export function colorForUser(key: string): string {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export interface Collaborator {
  /** the busiest tab of this person */
  clientId: number;
  user: RemoteState['user'];
  status: PresenceStatus;
  state: RemoteState;
  tabs: number;
}
const RANK: Record<PresenceStatus, number> = { active: 0, idle: 1, away: 2 };
/** everybody else in the file: one entry per person (several tabs collapse into the most active one) */
export function collaborators(states: Map<number, RemoteState>, myClientId: number, myUserId: string | null): Collaborator[] {
  const byPerson = new Map<string, Collaborator>();
  for (const [clientId, s] of states) {
    if (clientId === myClientId || !s?.user) continue;
    if (myUserId && s.user.id === myUserId) continue; // my other tab
    const key = s.user.id ?? `anon:${s.user.name}:${clientId}`;
    const status = s.status ?? 'active';
    const cur = byPerson.get(key);
    if (!cur) byPerson.set(key, { clientId, user: s.user, status, state: s, tabs: 1 });
    else {
      cur.tabs++;
      if (RANK[status] < RANK[cur.status]) Object.assign(cur, { clientId, user: s.user, status, state: s });
    }
  }
  return [...byPerson.values()].sort((a, b) => RANK[a.status] - RANK[b.status] || a.user.name.localeCompare(b.user.name));
}

export const jsonEqualPoint = (a: Pt | null | undefined, b: Pt | null | undefined): boolean => (a == null || b == null ? a == b : a.x === b.x && a.y === b.y);
