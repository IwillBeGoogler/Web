import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../data/catalog';
import { BoardGlyph } from './BoardGlyph';

const item = (p: Partial<CatalogItem>): CatalogItem => ({ id: 'x', label: 'X', kind: 'tool', aliases: [], tags: [], keywords: [], ...p }) as CatalogItem;
const cls = (i: CatalogItem) => render(<BoardGlyph item={i} />).container.querySelector('svg')!.getAttribute('class') ?? '';

describe('BoardGlyph', () => {
  it('picks a distinct lucide icon per kind / tool', () => {
    const names = [item({ kind: 'frame' }), item({ kind: 'mindmap' }), item({ kind: 'stamp' }), item({ tool: 'highlighter' }), item({ tool: 'pen' }), item({ kind: 'sticky' })].map(cls);
    expect(new Set(names).size).toBe(6);
  });
  it('wraps the icon in the palette glyph span, aria-hidden', () => {
    const { container } = render(<BoardGlyph item={item({ kind: 'frame' })} />);
    expect(container.querySelector('span.palette-glyph.palette-board-glyph svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
