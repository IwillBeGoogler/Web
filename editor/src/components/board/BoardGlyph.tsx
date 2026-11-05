import { Frame, Highlighter, Network, Pen, SmilePlus, StickyNote } from 'lucide-react';
import type { CatalogItem } from '../../data/catalog';

/** palette picture of a Board item */
export function BoardGlyph({ item }: { item: CatalogItem }) {
  const p = { size: 22, strokeWidth: 1.7, 'aria-hidden': true } as const;
  const icon =
    item.kind === 'frame' ? <Frame {...p} />
    : item.kind === 'mindmap' ? <Network {...p} />
    : item.kind === 'stamp' ? <SmilePlus {...p} />
    : item.tool === 'highlighter' ? <Highlighter {...p} />
    : item.tool === 'pen' ? <Pen {...p} />
    : <StickyNote {...p} />;
  return <span className="palette-glyph palette-board-glyph">{icon}</span>;
}
