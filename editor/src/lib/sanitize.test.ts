import { describe, expect, it } from 'vitest';
import { sanitizeSvg, isUnsafe, scopeIds } from '../../scripts/sanitize.mjs';

const wrap = (inner: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;

describe('sanitizeSvg safety', () => {
  it('strips scripts, handlers, javascript:, foreignObject, external refs', () => {
    const r = sanitizeSvg(wrap(`<script>alert(1)</script><rect onclick="x()" width="5" height="5" fill="red"/><a href="https://evil"><foreignObject><div/></foreignObject></a><image href="http://x/y.png"/><path style="fill:url(http://x)" d="M0 0"/>`));
    expect(isUnsafe(r.body)).toBe(false);
    expect(r.body).toContain('<rect');
    expect(r.body).not.toMatch(/script|onclick|evil|foreignObject|http:/);
  });
  it('keeps internal #refs and embedded png data URIs', () => {
    const r = sanitizeSvg(wrap(`<defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="5" height="5"/><image href="data:image/png;base64,AAAA"/>`));
    expect(r.body).toContain('url(#g)');
    expect(r.body).toContain('data:image/png;base64,AAAA');
  });
});

describe('sanitizeSvg white background removal', () => {
  it('removes a full-size white rect, keeps other shapes', () => {
    const r = sanitizeSvg(wrap(`<rect width="100" height="100" fill="#fff"/><rect x="10" y="10" width="20" height="20" fill="#ff0000"/><rect width="10" height="10" fill="#ffffff"/>`));
    expect(r.body).not.toMatch(/fill="#fff"/);
    expect(r.body).toContain('#ff0000'); // other shape kept
    expect(r.body).toContain('width="10" height="10"'); // small white rect kept
  });
  it('removes percent-size / named / rgb white rects', () => {
    expect(sanitizeSvg(wrap(`<rect width="100%" height="100%" fill="white"/><circle r="3"/>`)).body).not.toContain('<rect');
    expect(sanitizeSvg(wrap(`<rect x="0" y="0" width="100" height="100" style="fill:#FFFFFF"/><circle r="3"/>`)).body).not.toContain('<rect');
    expect(sanitizeSvg(wrap(`<rect width="100" height="100" fill="rgb(255,255,255)"/><circle r="3"/>`)).body).not.toContain('<rect');
  });
  it('removes a full-size white background path', () => {
    const r = sanitizeSvg(wrap(`<path d="M0 0h100v100H0z" fill="#fff"/><path d="M5 5h10v10H5z" fill="#fff"/>`));
    expect(r.body).not.toContain('M0 0h100');
    expect(r.body).toContain('M5 5h10');
  });
  it('does not remove a full-size non-white rect (e.g. coloured service tile)', () => {
    const r = sanitizeSvg(wrap(`<rect width="100" height="100" fill="#ED7100"/>`));
    expect(r.body).toContain('#ED7100');
  });
});

describe('sanitizeSvg: css classes, ids, currentColor', () => {
  it('inlines <style> class rules into style attributes (style block itself is removed)', () => {
    const r = sanitizeSvg(wrap(`<style>.a{fill:#ff0000}.b,.c{fill:none;stroke:#00f;stroke-width:2}</style><path class="a" d="M0 0h5v5z"/><path class="b" d="M1 1h5"/>`));
    expect(r.body).not.toMatch(/<style|class=/);
    expect(r.body).toMatch(/style="[^"]*fill:#ff0000/);
    expect(r.body).toMatch(/stroke:#00f/);
  });
  it('handles multiple classes and attribute-defined fills (rule wins like CSS)', () => {
    const r = sanitizeSvg(wrap(`<style>.x{fill:#111}.y{opacity:.5}</style><path class="x y" fill="#fff" d="M0 0h5v5z"/>`));
    expect(r.body).toMatch(/fill:#111/);
    expect(r.body).toMatch(/opacity:.5/);
  });
  it('replaces currentColor with a fixed neutral colour', () => {
    const r = sanitizeSvg(wrap(`<path fill="currentColor" d="M0 0h5v5z"/>`));
    expect(r.body).not.toMatch(/currentColor/i);
    expect(r.body).toContain('#2d3340');
  });
  it('scopeIds prefixes ids and every reference so inlined icons never collide', () => {
    const body = `<defs><linearGradient id="a"/><clipPath id="c"><rect/></clipPath></defs><path fill="url(#a)" clip-path="url(#c)" d="M0 0"/><use href="#c"/><use xlink:href="#a"/>`;
    const out = scopeIds(body, 'pg');
    expect(out).toContain('id="pg-a"');
    expect(out).toContain('url(#pg-a)');
    expect(out).toContain('url(#pg-c)');
    expect(out).toContain('href="#pg-c"');
    expect(out).toContain('xlink:href="#pg-a"');
    expect(out).not.toMatch(/id="a"|url\(#a\)/);
  });
  it('scopeIds is a no-op without ids', () => {
    expect(scopeIds('<path d="M0 0"/>', 'x')).toBe('<path d="M0 0"/>');
  });
});
