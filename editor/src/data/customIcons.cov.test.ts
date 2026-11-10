import { afterEach, describe, expect, it } from 'vitest';
import { apiClient } from '../api/api';
import { assetUrl, clearCustomIcons, dataUri, getCustomIcon, registerCustomIcons } from './customIcons';

afterEach(clearCustomIcons);

describe('customIcons', () => {
  it('builds a data uri, defaulting missing data to empty', () => {
    expect(dataUri({ mime: 'image/png', data: 'AAA' } as never)).toBe('data:image/png;base64,AAA');
    expect(dataUri({ mime: 'image/png' } as never)).toBe('data:image/png;base64,');
  });
  it('registers inline assets as data uris and stored ones as served urls', () => {
    registerCustomIcons({ h1: { mime: 'image/svg+xml', data: 'Zm9v' } as never, h2: { mime: 'image/png' } as never });
    expect(getCustomIcon('h1')).toBe('data:image/svg+xml;base64,Zm9v');
    expect(getCustomIcon('h2')).toBe(apiClient.url('/assets/h2'));
    expect(assetUrl('h2')).toBe(apiClient.url('/assets/h2'));
    expect(getCustomIcon('nope')).toBeUndefined();
  });
  it('accepts undefined and clears', () => {
    registerCustomIcons(undefined);
    registerCustomIcons({ h: { mime: 'a/b', data: 'x' } as never });
    clearCustomIcons();
    expect(getCustomIcon('h')).toBeUndefined();
  });
});
