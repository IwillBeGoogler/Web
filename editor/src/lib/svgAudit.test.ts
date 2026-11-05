import { describe, expect, it } from 'vitest';
import { auditSvgBody } from './svgAudit';

const vb = '0 0 24 24';
describe('auditSvgBody', () => {
  it('accepts a coloured path', () => expect(auditSvgBody('<path d="M0 0h20v20z" fill="#e6522c"/>', vb).ok).toBe(true));
  it('accepts shapes with default (black) fill', () => expect(auditSvgBody('<path d="M0 0h20v20z"/>', vb).ok).toBe(true));
  it('accepts inherited group fill and gradients', () => {
    expect(auditSvgBody('<g fill="#336791"><path d="M0 0h20v20z"/></g>', vb).ok).toBe(true);
    expect(auditSvgBody('<defs><linearGradient id="a"/></defs><path d="M0 0h20v20z" fill="url(#a)"/>', vb).ok).toBe(true);
  });
  it('accepts raster images', () => expect(auditSvgBody('<image href="data:image/png;base64,AAAA" width="24" height="24"/>', vb).ok).toBe(true));
  it('flags empty body, no shapes, bad viewBox', () => {
    expect(auditSvgBody('', vb).problems).toContain('empty body');
    expect(auditSvgBody('<defs><linearGradient id="a"/></defs>', vb).problems).toContain('no drawable shapes');
    expect(auditSvgBody('<path d="M0 0h1v1z"/>', '0 0 0 0').ok).toBe(false);
  });
  it('flags white-on-white logos', () => {
    expect(auditSvgBody('<path d="M0 0h20v20z" fill="#fff"/>', vb).ok).toBe(false);
    expect(auditSvgBody('<g fill="white"><path d="M0 0h20v20z"/><circle r="3"/></g>', vb).ok).toBe(false);
    expect(auditSvgBody('<path d="M0 0h20v20z" style="fill:#FFFFFF"/>', vb).ok).toBe(false);
    expect(auditSvgBody('<path d="M0 0h20v20z" fill="rgb(255,255,255)"/>', vb).ok).toBe(false);
  });
  it('flags currentColor-only logos (invisible on transparent dark backgrounds)', () => {
    expect(auditSvgBody('<path d="M0 0h20v20z" fill="currentColor"/>', vb).problems.join()).toMatch(/currentColor/);
  });
  it('flags shapes with fill none and no stroke', () => {
    expect(auditSvgBody('<path d="M0 0h20v20z" fill="none"/>', vb).ok).toBe(false);
    expect(auditSvgBody('<path d="M0 0h20v20z" fill="none" stroke="#333"/>', vb).ok).toBe(true);
  });
  it('white detail on a coloured logo is fine', () => {
    expect(auditSvgBody('<path d="M0 0h200v100H0z" fill="#e94600"/><path d="M5 5h5v5z" fill="#fff"/>', vb).ok).toBe(true);
  });
  it('ignores shapes inside defs / clipPath', () => {
    expect(auditSvgBody('<defs><clipPath id="c"><rect width="9" height="9"/></clipPath></defs><path d="M0 0h20v20z" fill="#123456"/>', vb).ok).toBe(true);
  });
});

describe('tiny / illegible check', () => {
  it('flags a drawing that fills less than half of its viewBox', () => {
    const r = auditSvgBody('<path d="M0 0h20v20H0z" fill="#d00"/>', '0 0 100 100');
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/tiny/);
  });
  it('accepts a drawing that fills its tile (relative commands, compact arc flags)', () => {
    expect(auditSvgBody('<path d="M2 2a10 10 0 00 20 0v20H2z" fill="#d00"/>', '0 0 24 24').ok).toBe(true);
  });
  it('flags a very wide image that cannot be legible', () => {
    const r = auditSvgBody('<image width="1200" height="100" href="x"/>', '0 0 1200 100');
    expect(r.problems.join()).toMatch(/illegible/);
    expect(auditSvgBody('<image width="300" height="100" href="x"/>', '0 0 300 100').ok).toBe(true);
  });
});
