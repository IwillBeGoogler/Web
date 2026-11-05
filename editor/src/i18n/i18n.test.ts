import { afterEach, describe, expect, it } from 'vitest';
import { dictionaries } from './dict';
import { setLang, t } from './index';

describe('i18n', () => {
  afterEach(() => setLang('en'));

  it('uses the English text as the key and falls back to it', () => {
    setLang('uz');
    expect(t('Share')).toBe('Ulashish');
    expect(t('Not translated yet')).toBe('Not translated yet');
  });

  it('fills placeholders in every language', () => {
    expect(t('{n} files', { n: 3 })).toBe('3 files');
  });

  it('has the same keys in uz and ru', () => {
    expect(Object.keys(dictionaries.ru).sort()).toEqual(Object.keys(dictionaries.uz).sort());
  });
});
