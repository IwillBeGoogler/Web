/** Facilitation presence over Yjs awareness: follow the presenter, "bring everyone to me". Pure. */
import type { Collaborator, Rect } from '../../collab/presenceMath';

export function findPresenter(people: Collaborator[]): Collaborator | null {
  return people.filter((p) => p.state.presenting).sort((a, b) => a.clientId - b.clientId)[0] ?? null;
}

export interface PresenterFollowState { presenterId: number | null; broken: boolean; seq: number }
export type PresenterFollowAction =
  | { type: 'presenter'; presenter: Collaborator | null }
  | { type: 'userInteraction'; programmatic?: boolean }
  | { type: 'rejoin'; presenter: Collaborator | null };
export type PresenterFollowEffect = { type: 'move'; rect: Rect } | { type: 'ended' };

const IDLE: PresenterFollowState = { presenterId: null, broken: false, seq: 0 };

export function reducePresenterFollow(s: PresenterFollowState, a: PresenterFollowAction): { state: PresenterFollowState; effect?: PresenterFollowEffect } {
  switch (a.type) {
    case 'presenter': {
      const p = a.presenter;
      if (!p?.state.presenting) return s.presenterId === null ? { state: s } : { state: IDLE, effect: { type: 'ended' } };
      const pr = p.state.presenting;
      const isNew = s.presenterId !== p.clientId;
      const base: PresenterFollowState = isNew ? { presenterId: p.clientId, broken: false, seq: pr.seq } : { ...s, seq: pr.seq };
      if (!isNew && (s.broken || s.seq === pr.seq)) return { state: base };
      return { state: base, effect: { type: 'move', rect: pr.rect } };
    }
    case 'userInteraction':
      if (a.programmatic || s.presenterId === null || s.broken) return { state: s };
      return { state: { ...s, broken: true } };
    case 'rejoin': {
      const pr = a.presenter?.state.presenting;
      if (!a.presenter || !pr) return { state: s };
      return { state: { presenterId: a.presenter.clientId, broken: false, seq: pr.seq }, effect: { type: 'move', rect: pr.rect } };
    }
  }
}

export const SUMMON_MAX_AGE_MS = 10_000;
/** the newest unseen, fresh summon among everybody else; `seen` maps client id to the last summon seq already handled */
export function detectSummon(seen: Record<number, number>, people: Collaborator[], now: number): { seen: Record<number, number>; effect?: { type: 'move'; rect: Rect; from: string } } {
  let best: { p: Collaborator; seq: number; rect: Rect } | null = null;
  const next = { ...seen };
  for (const p of people) {
    const s = p.state.summon;
    if (!s || s.seq <= (seen[p.clientId] ?? 0)) continue;
    next[p.clientId] = s.seq;
    if (now - s.seq > SUMMON_MAX_AGE_MS) continue;
    if (!best || s.seq > best.seq) best = { p, seq: s.seq, rect: s.rect };
  }
  return best ? { seen: next, effect: { type: 'move', rect: best.rect, from: best.p.user.name } } : { seen: next };
}

export const REACTION_MAX_AGE_MS = 4_000;
/** reactions (floating emoji) other people sent since the last look: one per client and `seq`, none older than 4 s */
export function detectReactions(seen: Record<number, number>, people: Collaborator[], now: number): { seen: Record<number, number>; fresh: { emoji: string; at: { x: number; y: number }; name: string }[] } {
  const next = { ...seen };
  const fresh: { emoji: string; at: { x: number; y: number }; name: string }[] = [];
  for (const p of people) {
    const r = p.state.reaction;
    if (!r || r.seq <= (seen[p.clientId] ?? 0)) continue;
    next[p.clientId] = r.seq;
    if (now - r.seq <= REACTION_MAX_AGE_MS) fresh.push({ emoji: r.emoji, at: r.at, name: p.user.name });
  }
  return { seen: next, fresh };
}
