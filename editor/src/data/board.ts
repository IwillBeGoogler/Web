import { registerSections, type CatalogItem, type CatalogSection } from './catalog';

const TAGS = ['board', 'whiteboard', 'workshop'];
const item = (id: string, label: string, kind: CatalogItem['kind'], aliases: string[], keywords: string[], extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id, label, kind, aliases, keywords, ...extra, tags: [...TAGS, ...(extra.tags ?? [])],
});

/** "Board": the whiteboard objects and freehand tools (Sticky, Frame, Mind map, Pen, Highlighter, Stamp, Text) */
export const BOARD_SECTION: CatalogSection = {
  id: 'board',
  label: 'Board',
  count: 7,
  subs: [
    {
      id: 'board-objects',
      label: 'Whiteboard',
      items: [
        item('board-sticky', 'Sticky', 'sticky', ['sticky note', 'post-it', 'note'], ['idea', 'brainstorm', 'retro'], { preset: { width: 160, height: 140, data: { label: '', fill: '#fff3a3', stroke: '#e0c84a', strokeWidth: 1, fontSize: 18, autoFont: true } } }),
        item('board-frame', 'Frame', 'frame', ['section', 'area', 'slide'], ['present', 'group', 'container'], { preset: { width: 800, height: 500, data: { label: 'Frame' } } }),
        item('board-mindmap', 'Mind map', 'mindmap', ['mindmap', 'brain map'], ['tree', 'branch', 'outline', 'idea']),
        item('board-text', 'Text box', 'text', ['text', 'title', 'label'], ['heading', 'caption'], { preset: { width: 200, height: 30, data: { label: 'Text', fontSize: 16, bold: false } } }),
        item('board-stamp', 'Stamp', 'stamp', ['emoji', 'reaction sticker'], ['thumbs up', 'vote', 'sticker']),
      ],
    },
    {
      id: 'board-draw',
      label: 'Draw',
      items: [
        item('board-pen', 'Pen', 'tool', ['draw', 'freehand'], ['sketch', 'ink'], { tool: 'pen' }),
        item('board-highlighter', 'Highlighter', 'tool', ['marker'], ['translucent', 'emphasis'], { tool: 'highlighter' }),
      ],
    },
  ],
};

export function registerBoardSection(): void {
  registerSections([BOARD_SECTION]);
}
