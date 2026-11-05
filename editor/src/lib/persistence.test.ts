import { beforeEach, describe, expect, it } from 'vitest';
import { loadFromStorage, saveToStorage, STORAGE_KEY } from './persistence';

beforeEach(() => localStorage.clear());

describe('persistence', () => {
  const d = { version: 1 as const, nodes: [], edges: [] };
  it('saves and loads', () => {
    saveToStorage(localStorage, d);
    expect(loadFromStorage(localStorage)).toEqual(d);
  });
  it('returns null when empty or corrupt', () => {
    expect(loadFromStorage(localStorage)).toBeNull();
    localStorage.setItem(STORAGE_KEY, '{bad');
    expect(loadFromStorage(localStorage)).toBeNull();
  });
});
