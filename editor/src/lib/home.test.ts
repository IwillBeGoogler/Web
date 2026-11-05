import { describe, expect, it } from 'vitest';
import { filterProjects, formatRelative, greeting, sortProjects } from './home';
import type { ProjectMeta } from './projects';

const m = (name: string, updatedAt: number): ProjectMeta => ({ id: name, name, updatedAt, pageCount: 1 });

describe('formatRelative', () => {
  const now = Date.UTC(2026, 5, 10, 12);
  it('buckets', () => {
    expect(formatRelative(now - 5_000, now)).toBe('just now');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelative(now - 59 * 60_000, now)).toBe('59m ago');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(formatRelative(now - 15 * 86_400_000, now)).toBe('2w ago');
    expect(formatRelative(now - 90 * 86_400_000, now)).toBe(new Date(now - 90 * 86_400_000).toLocaleDateString());
  });
  it('future timestamps are "just now"', () => expect(formatRelative(now + 10_000, now)).toBe('just now'));
});

describe('greeting', () => {
  it('follows the hour', () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
    expect(greeting(new Date(2026, 0, 1, 2))).toBe('Working late');
  });
});

describe('sort + filter', () => {
  const list = [m('beta', 100), m('Alpha', 300), m('alpha 10', 200), m('alpha 2', 200)];
  it('updated: newest first, ties by name', () => expect(sortProjects(list, 'updated').map((p) => p.name)).toEqual(['Alpha', 'alpha 10', 'alpha 2', 'beta']));
  it('name: natural, case-insensitive', () => expect(sortProjects(list, 'name').map((p) => p.name)).toEqual(['Alpha', 'alpha 2', 'alpha 10', 'beta']));
  it('does not mutate', () => {
    const copy = [...list];
    sortProjects(list, 'name');
    expect(list).toEqual(copy);
  });
  it('filter: all terms, case-insensitive; empty keeps all', () => {
    expect(filterProjects(list, 'ALPHA 2').map((p) => p.name)).toEqual(['alpha 2']);
    expect(filterProjects(list, 'a l').map((p) => p.name).sort()).toEqual(['Alpha', 'alpha 10', 'alpha 2'].sort());
    expect(filterProjects(list, '  ')).toBe(list);
    expect(filterProjects(list, 'zzz')).toEqual([]);
  });
});
