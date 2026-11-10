import { beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  return (await import('./lintStore')).useLintStore;
}
beforeEach(() => localStorage.clear());

describe('lintStore', () => {
  it('starts empty with no storage', async () => {
    expect((await fresh()).getState().config).toEqual({});
  });
  it('loads and sanitizes persisted config', async () => {
    localStorage.setItem('sdd:lint', JSON.stringify({ rules: { a: { enabled: false, severity: 'warning' }, b: { severity: 'bogus', enabled: 'x' }, c: null, d: 5 }, naming: 'camelCase' }));
    expect((await fresh()).getState().config).toEqual({ rules: { a: { enabled: false, severity: 'warning' }, b: {} }, naming: 'camelCase' });
  });
  it('drops an unknown naming style and tolerates missing rules', async () => {
    localStorage.setItem('sdd:lint', JSON.stringify({ naming: 'kebab' }));
    expect((await fresh()).getState().config).toEqual({ rules: {} });
  });
  it('falls back to {} for non-object or corrupt JSON', async () => {
    localStorage.setItem('sdd:lint', 'null');
    expect((await fresh()).getState().config).toEqual({});
    localStorage.setItem('sdd:lint', '{bad');
    expect((await fresh()).getState().config).toEqual({});
  });
  it('setRule merges, clears severity with null, and persists', async () => {
    const s = await fresh();
    s.getState().setRule('r', { enabled: false, severity: 'error' });
    expect(s.getState().config.rules?.r).toEqual({ enabled: false, severity: 'error' });
    s.getState().setRule('r', { severity: null });
    expect(s.getState().config.rules?.r).toEqual({ enabled: false });
    s.getState().setRule('r', {});
    expect(JSON.parse(localStorage.getItem('sdd:lint')!).rules.r).toEqual({ enabled: false });
  });
  it('setNaming and reset', async () => {
    const s = await fresh();
    s.getState().setNaming('snake_case');
    expect(JSON.parse(localStorage.getItem('sdd:lint')!).naming).toBe('snake_case');
    s.getState().reset();
    expect(s.getState().config).toEqual({});
    expect(localStorage.getItem('sdd:lint')).toBe('{}');
  });
  it('survives a throwing localStorage on save', async () => {
    const s = await fresh();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    s.getState().setNaming('any');
    expect(s.getState().config.naming).toBe('any');
    spy.mockRestore();
  });
});
