import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLang, localeTag, setLang, t, useLang } from './index';

afterEach(() => setLang('en'));

describe('i18n runtime', () => {
  it('localeTag follows the language', () => {
    expect(localeTag()).toBe('en');
    setLang('uz');
    expect(localeTag()).toBe('uz-UZ');
    setLang('ru');
    expect(localeTag()).toBe('ru-RU');
  });
  it('t leaves unknown placeholders alone and substitutes known ones, in english and translated modes', () => {
    expect(t('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    setLang('ru');
    expect(t('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2');
    expect(t('Share')).not.toBe('Share');
  });
  it('setLang is a no-op for the same language and notifies hook subscribers otherwise', () => {
    const { result } = renderHook(() => useLang());
    expect(result.current).toBe('en');
    act(() => setLang('en'));
    expect(result.current).toBe('en');
    act(() => setLang('uz'));
    expect(result.current).toBe('uz');
    expect(getLang()).toBe('uz');
  });
  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useLang());
    unmount();
    expect(() => setLang('ru')).not.toThrow();
  });
  void vi;
});
