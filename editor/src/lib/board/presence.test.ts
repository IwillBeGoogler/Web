import { describe, expect, it } from 'vitest';
import { detectReactions, detectSummon, findPresenter, reducePresenterFollow, type PresenterFollowState } from './presence';
import type { Collaborator, RemoteState } from '../../collab/presenceMath';

const R = (x: number) => ({ x, y: 0, w: 800, h: 600 });
const person = (clientId: number, extra: Partial<RemoteState> = {}): Collaborator => {
  const state: RemoteState = { user: { name: `u${clientId}`, color: '#000' }, ...extra };
  return { clientId, user: state.user, status: 'active', state, tabs: 1 };
};
const present = (clientId: number, frameId: string, x: number, seq = 1) => person(clientId, { presenting: { frameId, index: 0, rect: R(x), seq } });
const idle: PresenterFollowState = { presenterId: null, broken: false, seq: 0 };

describe('findPresenter', () => {
  it('returns null when nobody presents', () => {
    expect(findPresenter([person(1), person(2)])).toBeNull();
  });
  it('picks the lowest client id when several present', () => {
    expect(findPresenter([present(9, 'a', 0), present(3, 'b', 0)])?.clientId).toBe(3);
  });
});

describe('reducePresenterFollow', () => {
  it('starts following a new presenter and moves to the frame', () => {
    const r = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100) });
    expect(r.state.presenterId).toBe(2);
    expect(r.effect).toEqual({ type: 'move', rect: R(100) });
  });
  it('follows each new step of the same presenter', () => {
    const a = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    const b = reducePresenterFollow(a.state, { type: 'presenter', presenter: present(2, 'b', 900, 2) });
    expect(b.effect).toEqual({ type: 'move', rect: R(900) });
  });
  it('does not repeat the same step', () => {
    const a = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    const b = reducePresenterFollow(a.state, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    expect(b.effect).toBeUndefined();
  });
  it('breaking away stops following until rejoin', () => {
    const a = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    const away = reducePresenterFollow(a.state, { type: 'userInteraction' });
    expect(away.state.broken).toBe(true);
    const b = reducePresenterFollow(away.state, { type: 'presenter', presenter: present(2, 'b', 900, 2) });
    expect(b.effect).toBeUndefined();
    const back = reducePresenterFollow(b.state, { type: 'rejoin', presenter: present(2, 'b', 900, 2) });
    expect(back.state.broken).toBe(false);
    expect(back.effect).toEqual({ type: 'move', rect: R(900) });
  });
  it('ignores interaction when not following anyone', () => {
    expect(reducePresenterFollow(idle, { type: 'userInteraction' }).state.broken).toBe(false);
  });
  it('the program-driven move is not a break-away', () => {
    const a = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    expect(reducePresenterFollow(a.state, { type: 'userInteraction', programmatic: true }).state.broken).toBe(false);
  });
  it('resets and reports the end when the presenter stops', () => {
    const a = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) });
    const b = reducePresenterFollow(a.state, { type: 'presenter', presenter: null });
    expect(b.state).toEqual(idle);
    expect(b.effect).toEqual({ type: 'ended' });
  });
  it('a broken follower follows the next presenting session again', () => {
    let s = reducePresenterFollow(idle, { type: 'presenter', presenter: present(2, 'a', 100, 1) }).state;
    s = reducePresenterFollow(s, { type: 'userInteraction' }).state;
    s = reducePresenterFollow(s, { type: 'presenter', presenter: null }).state;
    const r = reducePresenterFollow(s, { type: 'presenter', presenter: present(2, 'a', 100, 5) });
    expect(r.effect).toEqual({ type: 'move', rect: R(100) });
  });
});

describe('detectSummon (bring everyone to me)', () => {
  const now = 100_000;
  const summoner = (id: number, seq: number) => person(id, { summon: { seq, rect: R(50) } });
  it('moves to a fresh summon once', () => {
    const a = detectSummon({}, [summoner(2, now - 500)], now);
    expect(a.effect).toEqual({ type: 'move', rect: R(50), from: 'u2' });
    const b = detectSummon(a.seen, [summoner(2, now - 500)], now);
    expect(b.effect).toBeUndefined();
  });
  it('reacts again to a newer summon', () => {
    const a = detectSummon({}, [summoner(2, now - 500)], now);
    expect(detectSummon(a.seen, [summoner(2, now - 100)], now).effect).toBeDefined();
  });
  it('ignores stale summons (from before I joined)', () => {
    expect(detectSummon({}, [summoner(2, now - 60_000)], now).effect).toBeUndefined();
  });
  it('does nothing without a summon', () => {
    expect(detectSummon({}, [person(2)], now).effect).toBeUndefined();
  });
});

describe('detectReactions', () => {
  const now = 50_000;
  const reacting = (id: number, seq: number, emoji = '🎉') => person(id, { reaction: { emoji, seq, at: { x: 3, y: 4 } } });
  it('reports each reaction once', () => {
    const a = detectReactions({}, [reacting(2, now - 100)], now);
    expect(a.fresh).toEqual([{ emoji: '🎉', at: { x: 3, y: 4 }, name: 'u2' }]);
    expect(detectReactions(a.seen, [reacting(2, now - 100)], now).fresh).toEqual([]);
  });
  it('reports a newer reaction from the same person and several people at once', () => {
    const a = detectReactions({}, [reacting(2, now - 900)], now);
    const b = detectReactions(a.seen, [reacting(2, now - 100, '👍'), reacting(3, now - 50, '🔥')], now);
    expect(b.fresh.map((f) => f.emoji)).toEqual(['👍', '🔥']);
  });
  it('drops stale ones (joined late) but remembers them', () => {
    const a = detectReactions({}, [reacting(2, now - 20_000)], now);
    expect(a.fresh).toEqual([]);
    expect(a.seen[2]).toBe(now - 20_000);
  });
});
