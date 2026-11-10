import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedBrand, getRef, hasRef, loadIcon, loadPack, packNames, registerIconPack, subscribePacks } from './registry';

const brand = (body: string) => ({ viewBox: '0 0 1 1', body });

describe('icon pack registry', () => {
  const loader = vi.fn(async () => ({ default: { a: brand('<a/>'), b: brand('<b/>') } }));
  beforeEach(() => loader.mockClear());

  it('registers refs and loaders; generic refs are never loaded', async () => {
    registerIconPack({ 'rt-a': 'rtpack/a', 'rt-b': 'rtpack/b', 'rt-g': 'g:server', 'rt-missing': 'rtpack/zzz' }, { rtpack: loader });
    expect(getRef('rt-a')).toBe('rtpack/a');
    expect(hasRef('rt-g')).toBe(true);
    expect(hasRef('nope')).toBe(false);
    expect(packNames()).toContain('rtpack');
    expect(getCachedBrand('rt-a')).toBeUndefined(); // not loaded yet
    expect(getCachedBrand('rt-g')).toBeUndefined();
    expect(getCachedBrand('unknown')).toBeUndefined();
    expect(await loadIcon('rt-g')).toBeUndefined();
    expect(await loadIcon('unknown')).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });
  it('a pack loads once for concurrent requests, notifies subscribers and then serves from cache', async () => {
    const seen = vi.fn();
    const off = subscribePacks(seen);
    const [x, y] = await Promise.all([loadIcon('rt-a'), loadIcon('rt-b')]);
    expect(x?.body).toBe('<a/>');
    expect(y?.body).toBe('<b/>');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getCachedBrand('rt-a')?.body).toBe('<a/>');
    expect(await loadPack('rtpack')).toEqual(expect.objectContaining({ a: expect.anything() }));
    expect(await loadIcon('rt-missing')).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
    off();
    registerIconPack({ 'rt-c': 'rtpack2/c' }, { rtpack2: async () => ({ default: { c: brand('<c/>') } }) });
    await loadIcon('rt-c');
    expect(seen).toHaveBeenCalledTimes(1); // unsubscribed
  });
  it('rejects an unknown pack', async () => {
    await expect(loadPack('no-such-pack')).rejects.toThrow(/unknown icon pack/);
  });
});
