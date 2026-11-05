import { describe, expect, it } from 'vitest';
import { collaborators, colorForUser, followTransform, presenceStatus, reduceFollow, smoothCursor, type FollowState, type RemoteState } from './presenceMath';

describe('smoothCursor (exponential smoothing)', () => {
  it('moves a fraction of the way depending on the elapsed time; a frame-rate independent ease-out', () => {
    const a = smoothCursor({ x: 0, y: 0 }, { x: 100, y: 50 }, 16, 80);
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(100);
    expect(a.y / a.x).toBeCloseTo(0.5, 5);
    // two 8ms steps ~= one 16ms step
    const half = smoothCursor(smoothCursor({ x: 0, y: 0 }, { x: 100, y: 50 }, 8, 80), { x: 100, y: 50 }, 8, 80);
    expect(half.x).toBeCloseTo(a.x, 5);
  });
  it('converges and snaps when close, never overshoots, ignores bad input', () => {
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) {
      p = smoothCursor(p, { x: 40, y: -30 }, 16, 80);
      expect(p.x).toBeLessThanOrEqual(40);
    }
    expect(p).toEqual({ x: 40, y: -30 });
    expect(smoothCursor({ x: 1, y: 1 }, { x: 5, y: 5 }, 0, 80)).toEqual({ x: 1, y: 1 });
    expect(smoothCursor({ x: 1, y: 1 }, { x: 5, y: 5 }, 1e9, 80)).toEqual({ x: 5, y: 5 });
    expect(smoothCursor({ x: 1, y: 1 }, { x: 5, y: 5 }, 16, 0)).toEqual({ x: 5, y: 5 });
    expect(smoothCursor({ x: 1, y: 1 }, { x: Number.NaN, y: 5 }, 16, 80)).toEqual({ x: 1, y: 1 });
  });
});

describe('followTransform (viewport of the person you follow)', () => {
  it('centres on their view and picks the zoom that shows all of it in my window', () => {
    // they see flow rect x:100..500, y:0..300 (400 x 300)
    const t = followTransform({ x: 100, y: 0, w: 400, h: 300 }, { width: 800, height: 600 });
    expect(t.zoom).toBeCloseTo(2, 5); // 800/400 = 2, 600/300 = 2
    // flow (300, 150) = their centre must land at my screen centre (400, 300)
    expect(300 * t.zoom + t.x).toBeCloseTo(400, 5);
    expect(150 * t.zoom + t.y).toBeCloseTo(300, 5);
  });
  it('uses the smaller zoom when the aspect ratios differ, and clamps absurd zoom', () => {
    const t = followTransform({ x: 0, y: 0, w: 1000, h: 100 }, { width: 500, height: 500 });
    expect(t.zoom).toBeCloseTo(0.5, 5);
    expect(followTransform({ x: 0, y: 0, w: 0.01, h: 0.01 }, { width: 500, height: 500 }).zoom).toBeLessThanOrEqual(4);
    expect(followTransform({ x: 0, y: 0, w: 1e9, h: 1e9 }, { width: 500, height: 500 }).zoom).toBeGreaterThanOrEqual(0.05);
  });
});

describe('reduceFollow (follow a user; Esc / your own pan or zoom stops it)', () => {
  const idle: FollowState = { following: null };
  const rect = { x: 0, y: 0, w: 100, h: 100 };
  it('start -> following; the followed user\'s viewport changes produce a move effect', () => {
    const s1 = reduceFollow(idle, { type: 'start', clientId: 7 });
    expect(s1.state.following).toBe(7);
    const s2 = reduceFollow(s1.state, { type: 'remoteViewport', clientId: 7, rect });
    expect(s2.effect).toEqual({ type: 'move', rect });
    expect(reduceFollow(s1.state, { type: 'remoteViewport', clientId: 8, rect }).effect).toBeUndefined();
    expect(reduceFollow(idle, { type: 'remoteViewport', clientId: 7, rect }).effect).toBeUndefined();
  });
  it('starting also jumps to their current view when known', () => {
    expect(reduceFollow(idle, { type: 'start', clientId: 7, rect }).effect).toEqual({ type: 'move', rect });
  });
  it('Esc, a manual pan / zoom, or the user leaving stops following', () => {
    const f: FollowState = { following: 7 };
    expect(reduceFollow(f, { type: 'escape' }).state.following).toBeNull();
    expect(reduceFollow(f, { type: 'userInteraction' }).state.following).toBeNull();
    const left = reduceFollow(f, { type: 'userLeft', clientId: 7 });
    expect(left.state.following).toBeNull();
    expect(left.effect).toEqual({ type: 'ended', reason: 'left' });
    expect(reduceFollow(f, { type: 'userLeft', clientId: 9 }).state.following).toBe(7);
    expect(reduceFollow(idle, { type: 'escape' }).effect).toBeUndefined();
  });
  it('clicking the same avatar again toggles it off; another avatar switches', () => {
    expect(reduceFollow({ following: 7 }, { type: 'start', clientId: 7 }).state.following).toBeNull();
    expect(reduceFollow({ following: 7 }, { type: 'start', clientId: 8 }).state.following).toBe(8);
  });
  it('the programmatic move that follows a remote viewport does not count as a user interaction', () => {
    const f: FollowState = { following: 7 };
    expect(reduceFollow(f, { type: 'userInteraction', programmatic: true }).state.following).toBe(7);
  });
});

describe('presenceStatus (active / idle / away)', () => {
  const now = 1_000_000;
  it('active recently, idle after a minute, away after five or when the tab is hidden', () => {
    expect(presenceStatus(now - 5_000, now, true)).toBe('active');
    expect(presenceStatus(now - 61_000, now, true)).toBe('idle');
    expect(presenceStatus(now - 301_000, now, true)).toBe('away');
    expect(presenceStatus(now - 1_000, now, false)).toBe('away');
  });
});

describe('collaborators (awareness states -> people)', () => {
  const st = (name: string, extra: Partial<RemoteState> = {}): RemoteState => ({ user: { id: `u_${name}`, name, color: '#123456' }, ...extra });
  it('lists everybody but me, one entry per person even with several tabs, busiest tab first', () => {
    const states = new Map<number, RemoteState>([
      [1, st('Me')],
      [2, st('Ann', { status: 'idle' })],
      [3, st('Ann', { status: 'active', cursor: { x: 1, y: 1 } })],
      [4, st('Bo', { status: 'away' })],
      [5, { cursor: { x: 0, y: 0 } } as RemoteState], // no user: ignored
    ]);
    const list = collaborators(states, 1, 'u_Me');
    expect(list.map((c) => c.user.name)).toEqual(['Ann', 'Bo']);
    expect(list[0].clientId).toBe(3);
    expect(list[0].tabs).toBe(2);
    expect(list[1].status).toBe('away');
  });
  it('a person with the same account in another tab is not "somebody else" for me', () => {
    const states = new Map<number, RemoteState>([[1, st('Me')], [2, st('Me')]]);
    expect(collaborators(states, 1, 'u_Me')).toEqual([]);
  });
  it('colorForUser is stable and picks from a fixed palette', () => {
    expect(colorForUser('usr_1')).toBe(colorForUser('usr_1'));
    expect(colorForUser('usr_1')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(colorForUser)).size).toBeGreaterThan(3);
  });
});
