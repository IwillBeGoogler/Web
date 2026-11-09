import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKETCH_DEFS_ID, SKETCH_FILTER_ID, sketchDefsElement, sketchFontEmbedCss } from './sketch';

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('sketch', () => {
  it('builds a hidden svg that carries the wobble filter', () => {
    const svg = sketchDefsElement();
    expect(svg.id).toBe(SKETCH_DEFS_ID);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector(`#${SKETCH_FILTER_ID}`)).not.toBeNull();
  });

  it('is empty when no Caveat font face is loaded', async () => {
    expect(await sketchFontEmbedCss('hello')).toBe('');
  });

  it('inlines only the subsets that the text uses, and skips unreadable sheets and failed fetches', async () => {
    const face = (range: string, file: string) => ({
      style: { getPropertyValue: (p: string) => ({ 'font-family': 'Caveat', 'unicode-range': range, src: `url("/f/${file}.woff2") format("woff2")`, 'font-weight': '700' })[p] ?? '' },
    });
    class FakeFace {
      style: unknown;
      constructor(o: { style: unknown }) {
        this.style = o.style;
      }
    }
    vi.stubGlobal('CSSFontFaceRule', FakeFace);
    const mk = (o: object) => Object.assign(new FakeFace(o as { style: unknown }), o);
    const sheets = [
      { href: 'http://x/s.css', cssRules: [mk(face('U+0000-00FF', 'latin')), mk(face('U+0400-04FF', 'cyr')), { style: {} }, mk(face('U+0000-00FF', 'bad'))] },
      Object.defineProperty({ href: null }, 'cssRules', { get: () => { throw new Error('cross-origin'); } }),
      { href: null, cssRules: [mk({ style: { getPropertyValue: (p: string) => (p === 'font-family' ? 'Other' : '') } }), mk({ style: { getPropertyValue: (p: string) => (p === 'font-family' ? 'Caveat' : p === 'src' ? 'local(x)' : '') } })] },
    ];
    vi.spyOn(document, 'styleSheets', 'get').mockReturnValue(sheets as unknown as StyleSheetList);
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (String(u).includes('bad')) throw new Error('404');
      return new Response(new Blob(['font-bytes']));
    }));
    const css = await sketchFontEmbedCss('abc');
    expect(css).toContain("font-family:'Caveat'");
    expect(css).toContain('unicode-range:U+0000-00FF');
    expect(css).not.toContain('0400');
    const cyr = await sketchFontEmbedCss('привет');
    expect(cyr).toContain('U+0400-04FF');
    vi.unstubAllGlobals();
  });
});
