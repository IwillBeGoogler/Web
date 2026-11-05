import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PROFILES } from '../clusters/profiles';
import { clusterSection } from '../clusters/palette';
import { loadIcon } from '../data/icons/registry';
import { PaletteGlyph } from './Sidebar';

describe('cluster palette glyphs', () => {
  const items = clusterSection().subs.flatMap((s) => s.items);
  it('covers every registered profile', () => {
    expect(items.length).toBe(PROFILES.length);
    expect(PROFILES.length).toBeGreaterThanOrEqual(83);
  });
  it('every cluster item renders its real logo (no placeholder / fallback) with a cluster badge', async () => {
    const bad: string[] = [];
    for (const item of items) {
      await loadIcon(item.iconId!);
      const { container, unmount } = render(<PaletteGlyph item={item} />);
      const svg = container.querySelector('svg[role="img"]');
      if (!svg) bad.push(`${item.id}: no svg (${container.innerHTML.slice(0, 40)})`);
      else if (svg.getAttribute('data-fallback')) bad.push(`${item.id}: fallback icon ${item.iconId}`);
      if (!container.querySelector('[data-cluster-badge]')) bad.push(`${item.id}: no badge`);
      if (container.querySelector('.palette-glyph')) bad.push(`${item.id}: placeholder square`);
      unmount();
    }
    expect(bad).toEqual([]);
  }, 60000);
  it('shows the logo after lazy pack load', async () => {
    const item = items.find((i) => i.profileId === 'kafka')!;
    const { container } = render(<PaletteGlyph item={item} />);
    await waitFor(() => expect(container.querySelector('svg[role="img"]:not([data-fallback])')).not.toBeNull());
  });
});
