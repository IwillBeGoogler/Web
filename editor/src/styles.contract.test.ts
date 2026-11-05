import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles.css', 'utf8');

/** jsdom does not apply stylesheets, so scrolling is guarded at the source: every scroll container needs the right CSS. */
const rule = (selector: string): string => {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  let all = '';
  for (let m = re.exec(css); m; m = re.exec(css)) all += m[2];
  return all.replace(/\s+/g, ' ');
};

describe('scroll containers', () => {
  it('floating panels are flex columns that clip; their children can shrink', () => {
    expect(rule('.panel')).toMatch(/display: flex/);
    expect(rule('.panel')).toMatch(/flex-direction: column/);
    expect(rule('.panel')).toMatch(/min-height: 0/);
  });
  it('sidebar fills the panel (flex column, min-height 0) and the palette list scrolls', () => {
    expect(rule('.sidebar')).toMatch(/display: flex/);
    expect(rule('.sidebar')).toMatch(/flex-direction: column/);
    expect(rule('.sidebar')).toMatch(/min-height: 0/);
    expect(rule('.palette-scroll')).toMatch(/overflow-y: auto/);
    expect(rule('.palette-scroll')).toMatch(/min-height: 0/);
    expect(rule('.palette-scroll')).toMatch(/flex: 1/);
  });
  it('inspector scrolls', () => {
    expect(rule('.props')).toMatch(/display: flex/);
    expect(rule('.props')).toMatch(/min-height: 0/);
    expect(rule('.props-scroll')).toMatch(/overflow-y: auto/);
    expect(rule('.props-scroll')).toMatch(/min-height: 0/);
  });
  it('virtualised palette lists, modals, pickers, context submenus and the home screen scroll', () => {
    expect(rule('.palette-grid-wrap.virtual')).toMatch(/overflow-y: auto/);
    expect(rule('.modal')).toMatch(/overflow: auto/);
    expect(rule('.modal')).toMatch(/max-height/);
    expect(rule('.picker-grid')).toMatch(/overflow: auto/);
    expect(rule('.ctx-sub')).toMatch(/overflow-y: auto/);
    expect(rule('.home')).toMatch(/overflow-y: auto/);
    expect(rule('.home')).toMatch(/height: 100%/);
    expect(rule('.wizard-form')).toMatch(/overflow: auto/);
  });
  it('no scrollable region is accidentally overflow:hidden with a fixed pointer-events block', () => {
    expect(css).not.toMatch(/\.palette-scroll[^{]*\{[^}]*overflow: hidden/);
    expect(css).not.toMatch(/\.props-scroll[^{]*\{[^}]*overflow: hidden/);
  });
});
