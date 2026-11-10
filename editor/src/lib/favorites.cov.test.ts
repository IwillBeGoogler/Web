import { describe, it, expect } from 'vitest';
import { emptyUsage, toggleFavorite, pushRecent, loadUsage, saveUsage, RECENT_MAX } from './favorites';

describe('favorites', () => {
  it('toggles favorites on and off', () => {
    const a = toggleFavorite(emptyUsage(), 'x');
    expect(a.favorites).toEqual(['x']);
    expect(toggleFavorite(a, 'x').favorites).toEqual([]);
  });
  it('pushRecent dedups, orders and caps', () => {
    let s = emptyUsage();
    s = pushRecent(s, 'a'); s = pushRecent(s, 'b'); s = pushRecent(s, 'a');
    expect(s.recent).toEqual(['a', 'b']);
    for (let i = 0; i < 20; i++) s = pushRecent(s, 'k' + i);
    expect(s.recent).toHaveLength(RECENT_MAX);
    expect(pushRecent(s, 'z', 2).recent).toEqual(['z', 'k19']);
  });
  it('loadUsage handles missing, bad json, bad shape, filtering', () => {
    const mk = (v: string | null) => ({ getItem: () => v });
    expect(loadUsage(mk(null), 'k')).toEqual(emptyUsage());
    expect(loadUsage(mk('{bad'), 'k')).toEqual(emptyUsage());
    expect(loadUsage(mk('{"favorites":1,"recent":[]}'), 'k')).toEqual(emptyUsage());
    const raw = JSON.stringify({ favorites: ['a', 5, 'b'], recent: ['b', 'c', 7] });
    expect(loadUsage(mk(raw), 'k')).toEqual({ favorites: ['a', 'b'], recent: ['b', 'c'] });
    expect(loadUsage(mk(raw), 'k', (id) => id !== 'b')).toEqual({ favorites: ['a'], recent: ['c'] });
  });
  it('saveUsage writes json and swallows errors', () => {
    const m: Record<string, string> = {};
    saveUsage({ setItem: (k, v) => { m[k] = v; } }, 'k', { favorites: ['a'], recent: [] });
    expect(JSON.parse(m.k)).toEqual({ favorites: ['a'], recent: [] });
    expect(() => saveUsage({ setItem: () => { throw new Error('q'); } }, 'k', emptyUsage())).not.toThrow();
  });
});
