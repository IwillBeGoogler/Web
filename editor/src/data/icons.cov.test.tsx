import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_ICONS } from './icons/generic';
import { registerIconPack } from './icons/registry';
import { clearCustomIcons, registerCustomIcons } from './customIcons';
import { getIcon, hasIcon, isBrandIcon, isIconFailed, markIconFailed, resetFailedIcons, resolveIcon, useIcon } from './icons';

const gen = Object.keys(GENERIC_ICONS)[0];
const okLoader = vi.fn(async () => ({ default: { k: { viewBox: '0 0 2 2', body: '<p/>' } } }));
registerIconPack({ 'ic-ok': 'icok/k', 'ic-gone': 'icok/missing', 'ic-bad': 'icbad/k', 'ic-gen': `g:${gen}` }, { icok: okLoader, icbad: async () => { throw new Error('boom'); } });

beforeEach(() => { resetFailedIcons(); clearCustomIcons(); });

describe('getIcon', () => {
  it('asset icons resolve through the custom icon store, else fall back', () => {
    registerCustomIcons({ h1: { mime: 'image/png', data: 'AA' } as never });
    expect(getIcon('asset:h1')).toMatchObject({ kind: 'asset', src: 'data:image/png;base64,AA', title: 'Custom icon' });
    expect(getIcon('asset:zz')).toEqual({ id: 'asset:zz', title: 'asset:zz', kind: 'fallback' });
  });
  it('generic refs and generic ids render as generic glyphs', () => {
    expect(getIcon('ic-gen')).toMatchObject({ kind: 'generic', id: 'ic-gen' });
    expect(getIcon(gen)).toMatchObject({ kind: 'generic', id: gen });
  });
  it('a generic ref whose glyph is missing falls to the badge', () => {
    registerIconPack({ 'ic-nog': 'g:__nope__' }, {});
    expect(getIcon('ic-nog')).toMatchObject({ kind: 'badge', initials: 'IC' });
  });
  it('brand refs are pending until loaded, then brand; failed ones become fallback', async () => {
    expect(getIcon('ic-ok').kind).toBe('pending');
    expect(isBrandIcon('ic-ok')).toBe(true);
    expect(isBrandIcon('ic-gen')).toBe(false);
    expect(isBrandIcon('unknown')).toBe(false);
    expect(await resolveIcon('ic-ok')).toMatchObject({ kind: 'brand', body: '<p/>', viewBox: '0 0 2 2' });
    markIconFailed('ic-gone');
    expect(isIconFailed('ic-gone')).toBe(true);
    expect(getIcon('ic-gone').kind).toBe('fallback');
    resetFailedIcons();
    expect(isIconFailed('ic-gone')).toBe(false);
  });
  it('unknown and missing ids become an initials badge', () => {
    expect(getIcon('zebra')).toEqual({ id: 'zebra', title: 'zebra', kind: 'badge', hex: '6B7280', initials: 'ZE' });
    expect(getIcon(undefined)).toMatchObject({ id: '?', kind: 'badge', initials: '?' });
  });
  it('resolveIcon without an id does not load anything', async () => {
    expect(await resolveIcon(undefined)).toMatchObject({ kind: 'badge' });
  });
  it('hasIcon covers assets, refs, generics and unknowns', () => {
    registerCustomIcons({ h2: { mime: 'a/b', data: 'x' } as never });
    expect(hasIcon('asset:h2')).toBe(true);
    expect(hasIcon('asset:none')).toBe(false);
    expect(hasIcon('ic-ok')).toBe(true);
    expect(hasIcon(gen)).toBe(true);
    expect(hasIcon('nothing-here')).toBe(false);
  });
});

describe('useIcon pack subscription', () => {
  it('re-renders when any pack finishes loading', async () => {
    let release!: () => void;
    registerIconPack({ 'ic-slow': 'icslow/k', 'ic-other': 'icother/k' }, {
      icslow: () => new Promise((r) => { release = () => r({ default: { k: { viewBox: '0', body: 's' } } }); }),
      icother: async () => ({ default: { k: { viewBox: '0', body: 'o' } } }),
    });
    let renders = 0;
    renderHook(() => { renders++; return useIcon('ic-slow'); });
    const before = renders;
    await act(async () => { await resolveIcon('ic-other'); });
    expect(renders).toBeGreaterThan(before);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
  });
});

describe('useIcon', () => {
  it('returns a pending icon, loads the pack and re-renders with the brand icon', async () => {
    const { result } = renderHook(() => useIcon('ic-ok'));
    await waitFor(() => expect(result.current.kind).toBe('brand'));
  });
  it('marks an icon failed when its pack lacks it', async () => {
    const { result } = renderHook(() => useIcon('ic-gone'));
    await waitFor(() => expect(result.current.kind).toBe('fallback'));
    expect(isIconFailed('ic-gone')).toBe(true);
  });
  it('marks an icon failed when the pack cannot load', async () => {
    const { result } = renderHook(() => useIcon('ic-bad'));
    await waitFor(() => expect(result.current.kind).toBe('fallback'));
  });
  it('non-pending icons and missing ids do nothing; unmount before load is safe', async () => {
    const { result, unmount } = renderHook(() => useIcon(undefined));
    expect(result.current.kind).toBe('badge');
    unmount();
    const r2 = renderHook(() => useIcon(gen));
    expect(r2.result.current.kind).toBe('generic');
    registerIconPack({ 'ic-late': 'iclate/k' }, { iclate: async () => { await new Promise((r) => setTimeout(r, 5)); return { default: { k: { viewBox: '0', body: '' } } }; } });
    registerIconPack({ 'ic-late-bad': 'iclatebad/k' }, { iclatebad: async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error('late'); } });
    const r4 = renderHook(() => useIcon('ic-late-bad'));
    r4.unmount();
    const r3 = renderHook(() => useIcon('ic-late'));
    r3.unmount();
    await act(async () => void (await new Promise((r) => setTimeout(r, 15))));
  });
});
