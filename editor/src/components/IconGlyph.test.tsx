import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, waitFor } from '@testing-library/react';
import { IconGlyph } from './IconGlyph';
import { ALL_ITEMS } from '../data/catalog';
import { getIcon, hasIcon, resetFailedIcons } from '../data/icons';
import { GENERIC_ICONS } from '../data/icons/generic';
import { loadIcon, registerIconPack } from '../data/icons/registry';
import { auditSvgBody } from '../lib/svgAudit';

const SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line|image|use)\b/;

describe('every catalog icon renders visible SVG', () => {
  it('renders non-empty svg with shapes and a valid viewBox, and is not invisible (white / currentColor)', async () => {
    const problems: string[] = [];
    for (const item of ALL_ITEMS.filter((i) => i.kind === 'icon')) {
      await loadIcon(item.iconId!); // lazy pack
      const html = renderToStaticMarkup(<IconGlyph iconId={item.iconId} size={32} />);
      const vb = html.match(/viewBox="([^"]+)"/)?.[1];
      if (!html.startsWith('<svg')) problems.push(`${item.id}: not an svg`);
      else if (!vb || vb.split(/\s+/).map(Number).some((n) => !Number.isFinite(n)) || Number(vb.split(/\s+/)[2]) <= 0 || Number(vb.split(/\s+/)[3]) <= 0) problems.push(`${item.id}: bad viewBox ${vb}`);
      else if (!SHAPE.test(html)) problems.push(`${item.id}: no shapes`);
      else if (html.includes('data-fallback')) problems.push(`${item.id}: fell back to generic glyph`);
      const icon = getIcon(item.iconId);
      if (icon.kind === 'brand') {
        const a = auditSvgBody(icon.body, icon.viewBox);
        if (!a.ok) problems.push(`${item.id}: ${a.problems.join('; ')}`);
      } else if (icon.kind !== 'generic') problems.push(`${item.id}: unresolved icon kind ${icon.kind}`);
    }
    expect(problems).toEqual([]);
  }, 60000);
});

describe('runtime fallback', () => {
  it('unknown id shows a neutral generic glyph (never blank) and warns once in dev', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<IconGlyph iconId="definitely-not-an-icon" size={32} />);
    expect(html).toContain('data-fallback="true"');
    expect(html).toMatch(/<path/);
    render(<IconGlyph iconId="definitely-not-an-icon-2" />);
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('definitely-not-an-icon-2')));
    warn.mockRestore();
  });
  it('an icon whose pack fails to load falls back instead of staying blank', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerIconPack({ 'broken-logo': 'brokenpack/broken-logo' }, { brokenpack: () => Promise.reject(new Error('chunk failed')) });
    const { container } = render(<IconGlyph iconId="broken-logo" />);
    expect(container.querySelector('.icon-pending')).not.toBeNull(); // while loading
    await waitFor(() => expect(container.querySelector('[data-fallback="true"]')).not.toBeNull());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken-logo'));
    warn.mockRestore();
  });
  it('a pack missing the key also falls back', async () => {
    registerIconPack({ 'ghost-logo': 'emptypack/ghost-logo' }, { emptypack: () => Promise.resolve({ default: {} }) });
    const { container } = render(<IconGlyph iconId="ghost-logo" />);
    await waitFor(() => expect(container.querySelector('[data-fallback="true"]')).not.toBeNull());
    resetFailedIcons();
  });
});

describe('every palette item can show an icon (command palette "Add …" rows pass the item id)', () => {
  it('shapes, notes, groups, cards, callouts... all resolve to a real glyph, never the fallback', () => {
    const bad = ALL_ITEMS.filter((i) => i.kind !== 'icon' && i.kind !== 'cluster').filter((i) => !hasIcon(i.id)).map((i) => i.id);
    expect(bad).toEqual([]);
    for (const id of ['note', 'text', 'group', 'rectangle', 'callout']) {
      const html = renderToStaticMarkup(<IconGlyph iconId={id} size={18} />);
      expect(html, id).not.toContain('data-fallback');
      expect(html, id).toMatch(/<path/);
    }
  });
  it('all generic icons are well-formed: 24x24 stroke paths, a title and a colour', () => {
    for (const [id, g] of Object.entries(GENERIC_ICONS)) {
      expect(g.paths.length, id).toBeGreaterThan(0);
      expect(g.title.length, id).toBeGreaterThan(0);
      expect(g.hex, id).toMatch(/^[0-9a-f]{6}$/i);
      for (const d of g.paths) expect(d, id).toMatch(/^M/);
    }
  });
});
